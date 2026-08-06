import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationSession } from "@/server/domain/generation";
import type { GenerationToolDetails } from "@/contracts/generation";
import { createRunningHubRoutes } from "@/server/infrastructure/content-generation/runninghub/runninghub-routes";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";
import { GenerationRunService } from "./generation-run-service";
import { seedGenerationRoutes } from "./seed-generation-routes";
import { GenerationAgentToolProvider } from "./generation-agent-tool-provider";

const NOW = "2026-08-06T00:00:00.000Z";

describe("GenerationAgentToolProvider", () => {
  let database: SqliteDatabase;
  let repository: SqliteGenerationRepository;
  let service: GenerationRunService;
  let provider: GenerationAgentToolProvider;
  let sequence: number;

  beforeEach(async () => {
    database = new SqliteDatabase(":memory:");
    repository = new SqliteGenerationRepository(database);
    await seedGenerationRoutes(repository, createRunningHubRoutes(NOW));
    await repository.upsertSession(session());
    sequence = 0;
    service = new GenerationRunService(repository, {
      createId: () => `id-${++sequence}`,
      now: () => new Date(NOW),
    });
    provider = new GenerationAgentToolProvider(() => service, {
      waitTimeoutMs: 0,
      pollIntervalMs: 0,
    });
  });

  afterEach(() => database.close());

  it("exposes stable semantic tools and creates an idempotent durable run", async () => {
    const tools = provider.getTools({ sessionId: "session-1", cwd: "D:\\project" });
    expect(tools.map((tool) => tool.name)).toEqual([
      "generate_image",
      "generate_video",
      "get_generation",
      "cancel_generation",
    ]);
    const generate = tools[0]!;
    const context = {
      toolCallId: "call-1",
      input: { prompt: "A quiet lake" },
    };
    const first = await generate.execute(context);
    const repeated = await generate.execute(context);

    expect(first.details).toMatchObject({ runId: "id-1", status: "queued" });
    expect(repeated.details).toEqual(first.details);
    await expect(service.listRuns("session-1")).resolves.toHaveLength(1);
  });

  it("maps assets to a multimodal video run without exposing provider fields", async () => {
    const generate = provider
      .getTools({ sessionId: "session-1", cwd: "D:\\project" })
      .find((tool) => tool.name === "generate_video")!;

    const result = await generate.execute({
      toolCallId: "call-video",
      input: {
        prompt: "Animate these references",
        durationSeconds: 8,
        assets: [
          { slot: "imageUrls", relativePath: "inputs/first.png" },
          { slot: "imageUrls", artifactId: "artifact-2" },
        ],
      },
    });
    const stored = await service.getRun(
      (result.details as GenerationToolDetails).runId,
    );

    expect(stored?.run).toMatchObject({
      capability: "multimodal-to-video",
      source: "agent-tool",
      sourceRef: "call-video",
      input: { parameters: { durationSeconds: 8 } },
    });
  });

  it("stops waiting on abort without cancelling the durable run", async () => {
    provider = new GenerationAgentToolProvider(() => service, {
      waitTimeoutMs: 10_000,
      pollIntervalMs: 10_000,
    });
    const generate = provider.getTools({ sessionId: "session-1", cwd: "D:\\project" })[0]!;
    const controller = new AbortController();
    const updates = vi.fn();
    const pending = generate.execute({
      toolCallId: "call-abort",
      input: { prompt: "Keep running" },
      signal: controller.signal,
      onUpdate: updates,
    });
    controller.abort();

    await expect(pending).resolves.toMatchObject({ details: { status: "queued" } });
    expect(updates).toHaveBeenCalled();
    await expect(service.getRun("id-1")).resolves.toMatchObject({
      run: { status: "queued" },
    });
  });

  it("prevents querying or cancelling a run from another session", async () => {
    const created = await service.createRun({
      sessionId: "session-1",
      capability: "text-to-image",
      prompt: "Private run",
      source: "api",
      idempotencyKey: "private-run",
    });
    const tools = provider.getTools({ sessionId: "other-session", cwd: "D:\\other" });

    await expect(tools[2]!.execute({
      toolCallId: "get-1",
      input: { runId: created.run.id },
    })).rejects.toMatchObject({ code: "GENERATION_RUN_NOT_FOUND" });
    await expect(tools[3]!.execute({
      toolCallId: "cancel-1",
      input: { runId: created.run.id },
    })).rejects.toMatchObject({ code: "GENERATION_RUN_NOT_FOUND" });
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
