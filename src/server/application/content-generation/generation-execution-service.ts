import { createHash } from "node:crypto";
import { AppError } from "@/server/domain/app-error";
import type {
  GenerationArtifact,
  GenerationRun,
  ProviderJob,
} from "@/server/domain/generation";
import type { GenerationFileStore } from "@/server/ports/generation-file-store";
import type {
  GenerationCredentialStore,
  GenerationProvider,
  ProviderInputAsset,
  ProviderOutput,
  ProviderSubmitResult,
} from "@/server/ports/generation-provider";
import type { GenerationRepository } from "@/server/ports/generation-repository";
import { generationOutputName } from "./generation-output-name";

const POLL_INTERVAL_MS = 5_000;

export class GenerationExecutionService {
  private readonly providers: Map<string, GenerationProvider>;

  constructor(
    private readonly repository: GenerationRepository,
    providers: GenerationProvider[],
    private readonly credentials: GenerationCredentialStore,
    private readonly files: GenerationFileStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.providers = new Map(providers.map((provider) => [
      provider.providerId,
      provider,
    ]));
  }

  async advance(jobId: string): Promise<void> {
    const job = await this.repository.getJob(jobId);
    if (!job || isTerminal(job.status) || job.status === "submission_unknown") {
      return;
    }
    const run = await this.requiredRun(job.runId);
    const provider = this.providers.get(job.providerId);
    if (!provider) {
      await this.fail(job, run, "GENERATION_PROVIDER_NOT_FOUND", "Generation provider is not configured");
      return;
    }
    const credential = job.credentialRef
      ? await this.credentials.getCredential(job.credentialRef)
      : null;
    if (!credential) {
      await this.fail(job, run, "GENERATION_CREDENTIAL_NOT_FOUND", "Generation credential is not configured");
      return;
    }

    if (job.status === "created" || job.status === "uploading") {
      await this.submit(job, run, provider, credential);
      return;
    }
    await this.poll(job, run, provider, credential);
  }

  async recoverInterruptedSubmissions(): Promise<number> {
    const jobs = await this.repository.listExpiredJobsByStatus({
      status: "submitting",
      now: this.timestamp(),
    });
    for (const job of jobs) {
      const run = await this.repository.getRun(job.runId);
      if (!run) continue;
      const updated = await this.repository.updateJob({
        ...job,
        status: "submission_unknown",
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: "GENERATION_SUBMISSION_UNKNOWN",
        lastErrorMessage:
          "The process stopped before the provider submission was confirmed",
        updatedAt: this.timestamp(),
      }, ["submitting"]);
      if (updated) {
        await this.failRun(
          run,
          "GENERATION_SUBMISSION_UNKNOWN",
          "The provider submission result is unknown; the task was not resubmitted",
        );
      }
    }
    return jobs.length;
  }

  private async submit(
    originalJob: ProviderJob,
    run: GenerationRun,
    provider: GenerationProvider,
    credential: string,
  ): Promise<void> {
    await this.markRunRunning(run);
    let job = originalJob;
    if (!job.preparedAssets) {
      job = {
        ...job,
        status: "uploading",
        updatedAt: this.timestamp(),
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
      };
      if (!await this.repository.updateJob(job, ["created", "uploading"])) return;
      try {
        const assets = await this.resolveInputAssets(run);
        job = {
          ...job,
          preparedAssets: await provider.upload({ assets, credential }),
          updatedAt: this.timestamp(),
        };
        if (!await this.repository.updateJob(job, ["uploading"])) return;
      } catch (error) {
        await this.fail(job, run, errorCode(error, "GENERATION_UPLOAD_FAILED"), errorMessage(error));
        return;
      }
    }

    job = {
      ...job,
      status: "submitting",
      nextPollAt: undefined,
      updatedAt: this.timestamp(),
    };
    if (!await this.repository.updateJob(job, ["uploading", "created"])) return;
    let result: ProviderSubmitResult;
    try {
      result = await provider.submit({
        operation: job.providerOperation,
        generation: run.input,
        assets: job.preparedAssets ?? [],
        credential,
      });
    } catch (error) {
      const uncertain = {
        ...job,
        status: "submission_unknown" as const,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: errorCode(error, "GENERATION_PROVIDER_ERROR"),
        lastErrorMessage: errorMessage(error),
        updatedAt: this.timestamp(),
      };
      await this.repository.updateJob(uncertain, ["submitting"]);
      await this.failRun(
        run,
        "GENERATION_SUBMISSION_UNKNOWN",
        "The provider submission result is unknown; the task was not resubmitted",
      );
      return;
    }
    await this.handleProviderResult(job, run, provider, result);
  }

  private async poll(
    originalJob: ProviderJob,
    run: GenerationRun,
    provider: GenerationProvider,
    credential: string,
  ): Promise<void> {
    if (!originalJob.remoteTaskId) {
      await this.fail(
        originalJob,
        run,
        "GENERATION_PROVIDER_PROTOCOL_ERROR",
        "Provider job is missing its remote task ID",
      );
      return;
    }
    const job = {
      ...originalJob,
      status: "polling" as const,
      updatedAt: this.timestamp(),
    };
    if (!await this.repository.updateJob(
      job,
      ["submitted", "polling", "downloading"],
    )) return;
    try {
      const result = await provider.poll({
        operation: job.providerOperation,
        remoteTaskId: originalJob.remoteTaskId,
        credential,
      });
      await this.handleProviderResult(job, run, provider, result);
    } catch (error) {
      await this.repository.updateJob({
        ...job,
        status: "polling",
        nextPollAt: this.after(POLL_INTERVAL_MS),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: errorCode(error, "GENERATION_PROVIDER_ERROR"),
        lastErrorMessage: errorMessage(error),
        updatedAt: this.timestamp(),
      }, ["polling"]);
    }
  }

  private async handleProviderResult(
    job: ProviderJob,
    run: GenerationRun,
    provider: GenerationProvider,
    result: ProviderSubmitResult,
  ): Promise<void> {
    if (result.state === "failed") {
      await this.fail(
        job,
        run,
        result.errorCode || "GENERATION_PROVIDER_ERROR",
        result.errorMessage || "Generation provider reported a failure",
      );
      return;
    }
    if (result.state === "pending") {
      const remoteTaskId = result.remoteTaskId ?? job.remoteTaskId;
      if (!remoteTaskId) {
        await this.fail(
          job,
          run,
          "GENERATION_PROVIDER_PROTOCOL_ERROR",
          "Generation provider did not return a task ID",
        );
        return;
      }
      await this.repository.updateJob({
        ...job,
        status: "submitted",
        remoteTaskId,
        remoteStatus: result.remoteStatus,
        nextPollAt: this.after(POLL_INTERVAL_MS),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
        updatedAt: this.timestamp(),
      }, ["submitting", "polling"]);
      return;
    }
    await this.complete(
      job,
      run,
      provider,
      result.outputs,
      result.remoteStatus,
    );
  }

  private async complete(
    originalJob: ProviderJob,
    run: GenerationRun,
    provider: GenerationProvider,
    outputs: ProviderOutput[],
    remoteStatus?: string,
  ): Promise<void> {
    const job = {
      ...originalJob,
      status: "downloading" as const,
      nextPollAt: undefined,
      updatedAt: this.timestamp(),
    };
    if (!await this.repository.updateJob(
      job,
      ["submitting", "polling", "downloading"],
    )) return;
    try {
      const session = await this.repository.getSession(run.sessionId);
      if (!session) throw new AppError("SESSION_NOT_FOUND", "Session was not found", 404);
      const artifacts: GenerationArtifact[] = [];
      for (const [index, output] of outputs.entries()) {
        let localPath: string | undefined;
        let contentType: string | undefined;
        let sizeBytes: number | undefined;
        let checksum: string | undefined;
        if (output.url) {
          const downloaded = await provider.download(output.url);
          const kind = artifactKind(
            output.outputType,
            downloaded.contentType,
            output.text,
          );
          localPath = await this.files.saveOutput({
            cwd: session.cwd,
            runId: run.id,
            nameHint: generationOutputName(run.prompt, kind),
            index,
            extension: output.outputType,
            data: downloaded.data,
          });
          contentType = downloaded.contentType;
          sizeBytes = downloaded.data.byteLength;
          checksum = createHash("sha256").update(downloaded.data).digest("hex");
        }
        artifacts.push({
          id: `${job.id}-${index + 1}`,
          runId: run.id,
          jobId: job.id,
          kind: artifactKind(output.outputType, contentType, output.text),
          localPath,
          remoteUrl: output.url,
          contentType,
          sizeBytes,
          checksum,
          text: output.text,
          createdAt: this.timestamp(),
        });
      }
      await this.repository.addArtifacts(artifacts);
      const completedAt = this.timestamp();
      await this.repository.updateJob({
        ...job,
        status: "succeeded",
        remoteStatus: remoteStatus ?? job.remoteStatus,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
        updatedAt: completedAt,
      }, ["downloading"]);
      await this.repository.updateRun({
        ...run,
        status: "succeeded",
        errorCode: undefined,
        errorMessage: undefined,
        updatedAt: completedAt,
        completedAt,
      }, ["queued", "running"]);
    } catch (error) {
      await this.repository.updateJob({
        ...job,
        status: "downloading",
        nextPollAt: this.after(POLL_INTERVAL_MS),
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: errorCode(error, "GENERATION_DOWNLOAD_FAILED"),
        lastErrorMessage: errorMessage(error),
        updatedAt: this.timestamp(),
      }, ["downloading"]);
    }
  }

  private async resolveInputAssets(run: GenerationRun): Promise<ProviderInputAsset[]> {
    const session = await this.repository.getSession(run.sessionId);
    if (!session) throw new AppError("SESSION_NOT_FOUND", "Session was not found", 404);
    const resolved: ProviderInputAsset[] = [];
    for (const asset of run.input.assets ?? []) {
      let relativePath: string;
      if (asset.ref.type === "workspace-file") {
        relativePath = asset.ref.relativePath;
      } else {
        const artifact = await this.repository.getArtifact(asset.ref.artifactId);
        if (!artifact?.localPath) {
          throw new AppError("FILE_NOT_FOUND", "Generation artifact was not found", 404);
        }
        const sourceRun = await this.repository.getRun(artifact.runId);
        if (!sourceRun || sourceRun.sessionId !== run.sessionId) {
          throw new AppError(
            "PROJECT_NOT_REGISTERED",
            "Generation artifact belongs to another session",
            403,
          );
        }
        relativePath = artifact.localPath;
      }
      resolved.push(await this.files.readInput({
        cwd: session.cwd,
        relativePath,
        slot: asset.slot,
      }));
    }
    return resolved;
  }

  private async markRunRunning(run: GenerationRun): Promise<void> {
    if (run.status !== "queued") return;
    await this.repository.updateRun({
      ...run,
      status: "running",
      updatedAt: this.timestamp(),
    }, ["queued"]);
  }

  private async fail(
    job: ProviderJob,
    run: GenerationRun,
    code: string,
    message: string,
  ): Promise<void> {
    const completedAt = this.timestamp();
    await this.repository.updateJob({
      ...job,
      status: "failed",
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: code,
      lastErrorMessage: message,
      updatedAt: completedAt,
    });
    await this.failRun(run, code, message, completedAt);
  }

  private async failRun(
    run: GenerationRun,
    code: string,
    message: string,
    completedAt = this.timestamp(),
  ): Promise<void> {
    await this.repository.updateRun({
      ...run,
      status: "failed",
      errorCode: code,
      errorMessage: message,
      updatedAt: completedAt,
      completedAt,
    }, ["queued", "running"]);
  }

  private async requiredRun(id: string): Promise<GenerationRun> {
    const run = await this.repository.getRun(id);
    if (!run) {
      throw new AppError("GENERATION_RUN_NOT_FOUND", "Generation run was not found", 404);
    }
    return run;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private after(milliseconds: number): string {
    return new Date(this.now().getTime() + milliseconds).toISOString();
  }
}

function isTerminal(status: ProviderJob["status"]): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

function errorCode(error: unknown, fallback: string): string {
  return error instanceof AppError ? error.code : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown generation error";
}

function artifactKind(
  outputType?: string,
  contentType?: string,
  text?: string,
): GenerationArtifact["kind"] {
  if (text && !outputType && !contentType) return "text";
  const value = `${contentType ?? ""} ${outputType ?? ""}`.toLowerCase();
  if (/\b(text|txt|json|markdown|md)\b/.test(value)) return "text";
  if (value.includes("video") || /\b(mp4|mov|webm)\b/.test(value)) return "video";
  if (value.includes("audio") || /\b(mp3|wav|m4a)\b/.test(value)) return "audio";
  return "image";
}
