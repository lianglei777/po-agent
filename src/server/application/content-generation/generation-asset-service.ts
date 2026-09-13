import { AppError } from "@/server/domain/app-error";
import type { GenerationFileStore } from "@/server/ports/generation-file-store";
import { GenerationRunService } from "./generation-run-service";

const MAX_INPUT_BYTES = 50 * 1024 * 1024;

export class GenerationAssetService {
  constructor(
    private readonly runs: GenerationRunService,
    private readonly files: GenerationFileStore,
  ) {}

  async upload(input: {
    sessionId: string;
    name: string;
    contentType: string;
    data: Uint8Array;
  }) {
    const session = await this.runs.requireSession(input.sessionId);
    if (!input.name.trim()) {
      throw new AppError("VALIDATION_ERROR", "Generation asset name is required", 400);
    }
    if (!input.data.byteLength || input.data.byteLength > MAX_INPUT_BYTES) {
      throw new AppError(
        "FILE_TOO_LARGE",
        "Generation asset must contain between 1 byte and 50 MiB",
        413,
      );
    }
    const relativePath = await this.files.saveInput({
      cwd: session.cwd,
      name: input.name,
      data: input.data,
    });
    return {
      name: input.name,
      contentType: input.contentType || "application/octet-stream",
      sizeBytes: input.data.byteLength,
      ref: { type: "workspace-file" as const, relativePath },
    };
  }

  async read(input: { sessionId: string; relativePath: string }) {
    const session = await this.runs.requireSession(input.sessionId);
    return this.files.readInput({
      cwd: session.cwd,
      relativePath: input.relativePath,
      slot: "preview",
    });
  }

  async readArtifact(artifactId: string) {
    const artifact = await this.runs.getArtifact(artifactId);
    if (!artifact?.localPath) {
      throw new AppError("FILE_NOT_FOUND", "Generation artifact was not found", 404);
    }
    const run = await this.runs.getRun(artifact.runId);
    if (!run) {
      throw new AppError("GENERATION_RUN_NOT_FOUND", "Generation run was not found", 404);
    }
    const session = await this.runs.requireSession(run.run.sessionId);
    // 只使用持久化的 workspace-relative 路径读取，不能信任浏览器提供文件路径。
    return this.files.readInput({
      cwd: session.cwd,
      relativePath: artifact.localPath,
      slot: "preview",
    });
  }
}
