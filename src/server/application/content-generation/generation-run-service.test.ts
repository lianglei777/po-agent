import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GenerationSession } from "@/server/domain/generation";
import { createRunningHubRoutes } from "@/server/infrastructure/content-generation/runninghub/runninghub-routes";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";
import { GenerationRunService } from "./generation-run-service";
import { seedGenerationRoutes } from "./seed-generation-routes";

const NOW = "2026-08-06T00:00:00.000Z";

describe("GenerationRunService", () => {
  let database: SqliteDatabase;
  let repository: SqliteGenerationRepository;
  let service: GenerationRunService;
  let sequence: number;

  beforeEach(async () => {
    database = new SqliteDatabase(":memory:");
    repository = new SqliteGenerationRepository(database);
    await seedGenerationRoutes(repository, createRunningHubRoutes(NOW).map((route) => ({ ...route, enabled: true })));
    await repository.setProviderEnabled("runninghub", true, NOW);
    await repository.upsertSession(session());
    sequence = 0;
    service = new GenerationRunService(
      repository,
      {
        createId: () => `id-${++sequence}`,
        now: () => new Date(NOW),
      },
    );
  });

  afterEach(() => database.close());

  it("creates a durable run with resolved route defaults", async () => {
    const result = await service.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      routeId: "runninghub-seedance-2-text-to-video",
      prompt: " rainy bamboo forest ",
      originalPrompt: " make a video ",
      parameters: { durationSeconds: 10 },
      source: "agent-tool",
      sourceRef: "tool-call-1",
      idempotencyKey: "idem-1",
    });

    expect(result).toMatchObject({
      created: true,
      run: {
        id: "id-1",
        routeId: "runninghub-seedance-2-text-to-video",
        prompt: "rainy bamboo forest",
        status: "queued",
        input: {
          originalPrompt: "make a video",
          parameters: {
            resolution: "720p",
            durationSeconds: 10,
            generateAudio: true,
          },
        },
      },
      jobs: [{
        id: "id-2",
        providerId: "runninghub",
        providerOperation: "seedance-2-text-to-video",
        credentialRef: "runninghub:default",
        status: "created",
      }],
      artifacts: [],
    });
  });

  it("fills schema field defaults that are absent from route defaults", async () => {
    const result = await service.prepareRun({
      sessionId: "session-1",
      capability: "text-to-image",
      prompt: "minimal poster",
      source: "agent-tool",
      idempotencyKey: "schema-defaults",
    });

    expect(result.run.input.parameters).toMatchObject({
      resolution: "2k",
      outputFormat: "png",
      width: 1024,
      height: 1024,
    });
  });

  it("persists a reviewable run without creating provider work until confirmation", async () => {
    const prepared = await service.prepareRun({
      sessionId: "session-1",
      capability: "text-to-video",
      routeId: "runninghub-seedance-2-text-to-video",
      prompt: "rainy bamboo forest",
      parameters: { durationSeconds: 5 },
      source: "agent-tool",
      sourceRef: "tool-review-1",
      idempotencyKey: "review-1",
    });

    expect(prepared).toMatchObject({
      run: {
        status: "awaiting_confirmation",
        input: {
          parameters: {
            resolution: "720p",
            durationSeconds: 5,
            aspectRatio: "adaptive",
            generateAudio: true,
            webSearch: false,
            returnLastFrame: false,
            seed: -1,
          },
        },
      },
      jobs: [],
    });
    await expect(repository.claimDueJobs({
      owner: "worker",
      now: NOW,
      leaseExpiresAt: "2026-08-06T00:01:00.000Z",
      limit: 10,
    })).resolves.toEqual([]);

    const confirmed = await service.confirmRun(prepared.run.id, {
      prompt: "rainy bamboo forest at dawn",
      parameters: {
        resolution: "720p",
        durationSeconds: 10,
        generateAudio: false,
      },
    });

    expect(confirmed).toMatchObject({
      run: {
        status: "queued",
        prompt: "rainy bamboo forest at dawn",
        input: { parameters: { durationSeconds: 10, generateAudio: false } },
      },
      jobs: [{ status: "created" }],
    });
    await expect(service.confirmRun(prepared.run.id, {
      prompt: "ignored after the first confirmation",
      parameters: {},
    })).resolves.toMatchObject({
      run: { prompt: "rainy bamboo forest at dawn" },
      jobs: [{ status: "created" }],
    });
  });

  it("rejects invalid edits while keeping a prepared run unsubmitted", async () => {
    const prepared = await service.prepareRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "review this",
      source: "agent-tool",
      idempotencyKey: "review-invalid",
    });

    await expect(service.confirmRun(prepared.run.id, {
      prompt: "review this",
      parameters: { durationSeconds: 99 },
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    await expect(service.getRun(prepared.run.id)).resolves.toMatchObject({
      run: { status: "awaiting_confirmation" },
      jobs: [],
    });
  });

  it("returns the existing run for an identical idempotent request", async () => {
    const input = {
      sessionId: "session-1",
      capability: "text-to-image" as const,
      prompt: "a clean product photo",
      source: "direct-ui" as const,
      idempotencyKey: "idem-1",
    };

    const first = await service.createRun(input);
    const repeated = await service.createRun(input);

    expect(first.created).toBe(true);
    expect(repeated.created).toBe(false);
    expect(repeated.run.id).toBe(first.run.id);
  });

  it("rejects reuse of an idempotency key for a different request", async () => {
    await service.createRun({
      sessionId: "session-1",
      capability: "text-to-image",
      prompt: "first prompt",
      source: "api",
      idempotencyKey: "idem-1",
    });

    await expect(service.createRun({
      sessionId: "session-1",
      capability: "text-to-image",
      prompt: "different prompt",
      source: "api",
      idempotencyKey: "idem-1",
    })).rejects.toMatchObject({
      code: "GENERATION_IDEMPOTENCY_CONFLICT",
      status: 409,
    });
  });

  it("rejects a missing session before creating billable work", async () => {
    await expect(service.createRun({
      sessionId: "missing",
      capability: "text-to-video",
      prompt: "test",
      source: "api",
      idempotencyKey: "idem-1",
    })).rejects.toMatchObject({ code: "SESSION_NOT_FOUND", status: 404 });
    await expect(service.listRuns("missing")).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
      status: 404,
    });
    await expect(service.listRunsForContext("missing")).resolves.toEqual([]);
  });

  it("validates semantic parameters and asset slots before creating billable work", async () => {
    await expect(service.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "test",
      parameters: { durationSeconds: 99 },
      source: "api",
      idempotencyKey: "invalid-option",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });

    await expect(service.createRun({
      sessionId: "session-1",
      capability: "image-to-image",
      prompt: "test",
      source: "api",
      idempotencyKey: "missing-asset",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });

    await expect(service.createRun({
      sessionId: "session-1",
      capability: "text-to-image",
      prompt: "...",
      source: "api",
      idempotencyKey: "short-image-prompt",
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });

  it("accepts an empty prompt when the selected route marks it optional", async () => {
    const result = await service.createRun({
      sessionId: "session-1",
      capability: "image-to-video",
      prompt: "",
      assets: [{
        slot: "firstFrameUrl",
        ref: { type: "workspace-file", relativePath: "first.png" },
      }],
      source: "api",
      idempotencyKey: "optional-prompt",
    });

    expect(result.run.prompt).toBe("");
  });

  it("cancels active work without exposing it to the worker again", async () => {
    const created = await service.createRun({
      sessionId: "session-1",
      capability: "text-to-image",
      prompt: "cancel this",
      source: "direct-ui",
      idempotencyKey: "idem-cancel",
    });

    const cancelled = await service.cancelRun(created.run.id);

    expect(cancelled.run).toMatchObject({ status: "cancelled", completedAt: NOW });
    expect(cancelled.jobs).toHaveLength(1);
    expect(cancelled.jobs[0]?.status).toBe("cancelled");
  });

  it("retries failed work as a new job under the same run", async () => {
    const created = await service.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "retry this",
      source: "direct-ui",
      idempotencyKey: "idem-original",
    });
    await repository.updateRun({ ...created.run, status: "failed", updatedAt: NOW }, ["queued"]);

    const retried = await service.retryRun(created.run.id, "idem-retry");

    expect(retried.created).toBe(true);
    expect(retried.run).toMatchObject({ id: created.run.id, prompt: "retry this", status: "queued" });
    expect(retried.jobs).toMatchObject([
      { id: "id-2", attempt: 1, status: "created" },
      { id: "id-3", attempt: 2, status: "created" },
    ]);

    const repeated = await service.retryRun(created.run.id, "idem-retry");
    expect(repeated.created).toBe(false);
    expect(repeated.jobs).toHaveLength(2);
  });

  it("rejects retrying a legacy run that violates the current route contract", async () => {
    const created = await service.createRun({
      sessionId: "session-1",
      capability: "text-to-image",
      prompt: "valid prompt",
      source: "direct-ui",
      idempotencyKey: "legacy-original",
    });
    await repository.updateRun({
      ...created.run,
      status: "failed",
      prompt: "...",
      input: { ...created.run.input, prompt: "..." },
      updatedAt: NOW,
    }, ["queued"]);

    await expect(service.retryRun(created.run.id, "legacy-retry"))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(await repository.listJobsByRun(created.run.id)).toHaveLength(1);
  });
});

function session(): GenerationSession {
  return {
    id: "session-1",
    cwd: "D:\\project",
    origin: "chat",
    createdAt: NOW,
    updatedAt: NOW,
  };
}
