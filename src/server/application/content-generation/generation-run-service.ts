import { randomUUID } from "node:crypto";
import type { JsonValue } from "@/contracts/content-generation";
import { AppError } from "@/server/domain/app-error";
import type {
  GenerationArtifact,
  GenerationCapability,
  GenerationInput,
  GenerationRun,
  GenerationSession,
  GenerationSource,
  ProviderJob,
} from "@/server/domain/generation";
import type { ContentGenerationRepository } from "@/server/ports/content-generation-repository";
import type { GenerationRepository } from "@/server/ports/generation-repository";
import type { SessionRepository } from "@/server/ports/session-repository";
import { GenerationRouter } from "./generation-router";

export interface GenerationRunView {
  run: GenerationRun;
  jobs: ProviderJob[];
  artifacts: GenerationArtifact[];
}

export class GenerationRunService {
  private readonly router: GenerationRouter;
  private readonly ready: Promise<unknown>;
  private readonly createId: () => string;
  private readonly now: () => Date;
  private readonly sessions?: SessionRepository;
  private readonly contentSessions?: ContentGenerationRepository;

  constructor(
    private readonly repository: GenerationRepository,
    options: {
      ready?: Promise<unknown>;
      createId?: () => string;
      now?: () => Date;
      sessions?: SessionRepository;
      contentSessions?: ContentGenerationRepository;
    } = {},
  ) {
    this.router = new GenerationRouter(repository);
    this.ready = options.ready ?? Promise.resolve();
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.sessions = options.sessions;
    this.contentSessions = options.contentSessions;
  }

  async upsertSession(session: GenerationSession): Promise<void> {
    await this.ready;
    await this.repository.upsertSession(session);
  }

  async requireSession(id: string): Promise<GenerationSession> {
    await this.ready;
    const session = await this.resolveSession(id);
    if (!session || session.deletedAt) {
      throw new AppError("SESSION_NOT_FOUND", "Session was not found", 404);
    }
    return session;
  }

  async createRun(input: {
    sessionId: string;
    capability: GenerationCapability;
    routeId?: string;
    parentRunId?: string;
    prompt: string;
    assets?: GenerationInput["assets"];
    parameters?: Record<string, JsonValue>;
    source: GenerationSource;
    sourceRef?: string;
    idempotencyKey: string;
  }): Promise<GenerationRunView & { created: boolean }> {
    await this.ready;
    const session = await this.requireSession(input.sessionId);
    const prompt = input.prompt.trim();
    if (!prompt || prompt.length > 20_480) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Generation prompt must contain between 1 and 20480 characters",
        400,
      );
    }
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Generation idempotency key must contain between 1 and 200 characters",
        400,
      );
    }
    const route = await this.router.resolve({
      capability: input.capability,
      routeId: input.routeId,
    });
    const timestamp = this.now().toISOString();
    const parameters = { ...route.defaults, ...input.parameters };
    const run: GenerationRun = {
      id: this.createId(),
      sessionId: session.id,
      capability: input.capability,
      routeId: route.id,
      parentRunId: input.parentRunId,
      status: "queued",
      prompt,
      input: {
        prompt,
        assets: input.assets,
        parameters,
      },
      source: input.source,
      sourceRef: input.sourceRef,
      idempotencyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const job: ProviderJob = {
      id: this.createId(),
      runId: run.id,
      attempt: 1,
      providerId: route.providerId,
      providerOperation: route.providerOperation,
      routeRevision: route.revision,
      resolvedConfigSnapshot: {
        parameters,
        adapterConfig: route.adapterConfig,
      },
      credentialRef: route.credentialRef,
      status: "created",
      nextPollAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const result = await this.repository.createRun(run, job);
    if (!result.created && !sameRequest(result.run, run)) {
      throw new AppError(
        "GENERATION_IDEMPOTENCY_CONFLICT",
        "The generation idempotency key was already used for another request",
        409,
      );
    }
    return {
      created: result.created,
      run: result.run,
      jobs: await this.repository.listJobsByRun(result.run.id),
      artifacts: await this.repository.listArtifactsByRun(result.run.id),
    };
  }

  async getRun(id: string): Promise<GenerationRunView | null> {
    await this.ready;
    const run = await this.repository.getRun(id);
    if (!run) return null;
    return {
      run,
      jobs: await this.repository.listJobsByRun(id),
      artifacts: await this.repository.listArtifactsByRun(id),
    };
  }

  async listRoutes() {
    await this.ready;
    return this.repository.listRoutes();
  }

  async cancelRun(id: string): Promise<GenerationRunView> {
    await this.ready;
    const run = await this.repository.getRun(id);
    if (!run) {
      throw new AppError("GENERATION_RUN_NOT_FOUND", "Generation run was not found", 404);
    }
    if (run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
      return (await this.getRun(id))!;
    }
    const timestamp = this.now().toISOString();
    const cancelled = await this.repository.updateRun({
      ...run,
      status: "cancelled",
      updatedAt: timestamp,
      completedAt: timestamp,
    }, ["queued", "running", "cancel_requested"]);
    if (!cancelled) return (await this.getRun(id))!;
    const jobs = await this.repository.listJobsByRun(id);
    for (const job of jobs) {
      if (["succeeded", "failed", "cancelled", "submission_unknown"].includes(job.status)) continue;
      await this.repository.updateJob({
        ...job,
        status: "cancelled",
        nextPollAt: undefined,
        leaseOwner: undefined,
        leaseExpiresAt: undefined,
        updatedAt: timestamp,
      }, ["created", "uploading", "submitting", "submitted", "polling", "downloading"]);
    }
    return (await this.getRun(id))!;
  }

  async retryRun(id: string, idempotencyKey: string) {
    await this.ready;
    const run = await this.repository.getRun(id);
    if (!run) {
      throw new AppError("GENERATION_RUN_NOT_FOUND", "Generation run was not found", 404);
    }
    const retryKey = idempotencyKey.trim();
    if (!retryKey || retryKey.length > 200) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Generation retry idempotency key must contain between 1 and 200 characters",
        400,
      );
    }
    const jobs = await this.repository.listJobsByRun(id);
    const previous = jobs.at(-1);
    if (!previous) throw new Error(`Generation run ${id} has no provider job`);
    const timestamp = this.now().toISOString();
    const nextRun: GenerationRun = {
      ...run,
      status: "queued",
      errorCode: undefined,
      errorMessage: undefined,
      updatedAt: timestamp,
      completedAt: undefined,
    };
    const nextJob: ProviderJob = {
      id: this.createId(),
      runId: run.id,
      attempt: previous.attempt + 1,
      providerId: previous.providerId,
      providerOperation: previous.providerOperation,
      routeRevision: previous.routeRevision,
      resolvedConfigSnapshot: previous.resolvedConfigSnapshot,
      credentialRef: previous.credentialRef,
      retryKey,
      status: "created",
      nextPollAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const result = await this.repository.createRetryJob(nextRun, nextJob);
    if (!result) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Generation run is no longer retryable",
        409,
      );
    }
    return {
      created: result.created,
      run: result.run,
      jobs: await this.repository.listJobsByRun(run.id),
      artifacts: await this.repository.listArtifactsByRun(run.id),
    };
  }

  async listRuns(sessionId: string): Promise<GenerationRunView[]> {
    await this.ready;
    await this.requireSession(sessionId);
    const runs = await this.repository.listRunsBySession(sessionId);
    return Promise.all(runs.map(async (run) => ({
      run,
      jobs: await this.repository.listJobsByRun(run.id),
      artifacts: await this.repository.listArtifactsByRun(run.id),
    })));
  }

  private async resolveSession(id: string): Promise<GenerationSession | null> {
    const stored = await this.repository.getSession(id);
    if (stored) return stored;
    const detail = await this.sessions?.findById(id);
    const legacy = detail?.info ? null : await this.contentSessions?.getSession(id);
    if (!detail?.info && !legacy) return null;
    const projected: GenerationSession = detail?.info ? {
      id: detail.sessionId,
      cwd: detail.info.cwd,
      title: detail.info.name,
      origin: "chat",
      agentSessionRef: detail.filePath,
      createdAt: detail.info.created,
      updatedAt: detail.info.modified,
    } : {
      id: legacy!.id,
      cwd: legacy!.cwd,
      title: legacy!.name,
      origin: "direct-generation",
      createdAt: legacy!.created,
      updatedAt: legacy!.modified,
    };
    await this.repository.upsertSession(projected);
    return projected;
  }
}

function sameRequest(existing: GenerationRun, requested: GenerationRun): boolean {
  return (
    existing.sessionId === requested.sessionId &&
    existing.capability === requested.capability &&
    existing.routeId === requested.routeId &&
    existing.prompt === requested.prompt &&
    JSON.stringify(existing.input) === JSON.stringify(requested.input)
  );
}
