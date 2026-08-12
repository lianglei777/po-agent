import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationProvider } from "@/server/ports/generation-provider";
import type { GenerationFileStore } from "@/server/ports/generation-file-store";
import { createRunningHubRoutes } from "@/server/infrastructure/content-generation/runninghub/runninghub-routes";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";
import { GenerationExecutionService } from "./generation-execution-service";
import { GenerationRunService } from "./generation-run-service";
import { GenerationWorker } from "./generation-worker";
import { seedGenerationRoutes } from "./seed-generation-routes";

describe("GenerationWorker", () => {
  let database: SqliteDatabase;
  let repository: SqliteGenerationRepository;
  let now: Date;
  let provider: GenerationProvider;
  let execution: GenerationExecutionService;
  let worker: GenerationWorker;
  let runService: GenerationRunService;
  let files: GenerationFileStore & { saveOutput: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    database = new SqliteDatabase(":memory:");
    repository = new SqliteGenerationRepository(database);
    now = new Date("2026-08-06T00:00:00.000Z");
    await seedGenerationRoutes(
      repository,
      createRunningHubRoutes(now.toISOString()).map((route) => ({ ...route, enabled: true })),
    );
    await repository.setProviderEnabled("runninghub", true, now.toISOString());
    await repository.upsertSession({
      id: "session-1",
      cwd: "D:\\project",
      origin: "chat",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    provider = {
      providerId: "runninghub",
      upload: vi.fn(async () => []),
      submit: vi.fn<GenerationProvider["submit"]>(async () => ({
        state: "pending",
        remoteTaskId: "remote-1",
        remoteStatus: "RUNNING",
        outputs: [],
      })),
      poll: vi.fn<GenerationProvider["poll"]>(async () => ({
        state: "succeeded",
        remoteTaskId: "remote-1",
        remoteStatus: "SUCCESS",
        outputs: [{
          url: "https://bucket.myqcloud.com/output.mp4",
          outputType: "mp4",
        }, {
          outputType: "text",
          text: "22819",
        }],
      })),
      download: vi.fn(async () => ({
        data: new Uint8Array([1, 2, 3]),
        contentType: "video/mp4",
      })),
    };
    files = {
      saveInput: vi.fn(async () => ".po-agent/generation-inputs/input.png"),
      readInput: vi.fn(),
      saveOutput: vi.fn(async () =>
        ".po-agent/generated/id-1/rainy-bamboo-forest-1.mp4"
      ),
    };
    execution = new GenerationExecutionService(
      repository,
      [provider],
      { getCredential: vi.fn(async () => "secret-key") },
      files,
      () => now,
    );
    worker = new GenerationWorker(
      repository,
      execution,
      "worker-1",
      () => now,
    );
    let sequence = 0;
    runService = new GenerationRunService(repository, {
      createId: () => `id-${++sequence}`,
      now: () => now,
    });
  });

  afterEach(() => database.close());

  it("submits, polls, downloads, and completes a durable run", async () => {
    const created = await runService.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "rainy bamboo forest",
      source: "agent-tool",
      idempotencyKey: "idem-1",
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: { status: "running" },
      jobs: [{ status: "submitted", remoteTaskId: "remote-1" }],
    });

    now = new Date("2026-08-06T00:00:05.000Z");
    await expect(worker.runOnce()).resolves.toBe(1);
    expect(files.saveOutput).toHaveBeenCalledWith(expect.objectContaining({
      nameHint: "rainy-bamboo-forest",
    }));

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: { status: "succeeded", completedAt: now.toISOString() },
      jobs: [{ status: "succeeded", remoteStatus: "SUCCESS" }],
      artifacts: [{
        id: "id-2-1",
        kind: "video",
        localPath: ".po-agent/generated/id-1/rainy-bamboo-forest-1.mp4",
        contentType: "video/mp4",
        sizeBytes: 3,
      }, {
        id: "id-2-2",
        kind: "text",
        text: "22819",
      }],
    });
    expect(provider.submit).toHaveBeenCalledOnce();
    expect(provider.poll).toHaveBeenCalledOnce();
    expect(provider.download).toHaveBeenCalledOnce();
  });

  it("marks an ambiguous provider submission without resubmitting", async () => {
    vi.mocked(provider.submit).mockRejectedValueOnce(new Error("connection reset"));
    const created = await runService.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "test",
      source: "api",
      idempotencyKey: "idem-1",
    });

    await worker.runOnce();

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: {
        status: "failed",
        errorCode: "GENERATION_SUBMISSION_UNKNOWN",
      },
      jobs: [{
        status: "submission_unknown",
        lastErrorMessage: "connection reset",
      }],
    });
    expect(provider.submit).toHaveBeenCalledOnce();
  });

  it("recovers an expired submitting job as unknown instead of retrying", async () => {
    const created = await runService.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "test",
      source: "api",
      idempotencyKey: "idem-1",
    });
    const job = created.jobs[0];
    await repository.updateRun({
      ...created.run,
      status: "running",
    });
    await repository.updateJob({
      ...job,
      status: "submitting",
      leaseOwner: "stopped-worker",
      leaseExpiresAt: "2026-08-05T23:59:59.000Z",
    });

    await worker.runOnce();

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: { status: "failed", errorCode: "GENERATION_SUBMISSION_UNKNOWN" },
      jobs: [{ status: "submission_unknown" }],
    });
    expect(provider.submit).not.toHaveBeenCalled();
  });
});
