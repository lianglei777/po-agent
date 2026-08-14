import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationSession } from "@/server/domain/generation";
import type { GenerationToolDetails } from "@/contracts/generation";
import { createRunningHubRoutes } from "@/server/infrastructure/content-generation/runninghub/runninghub-routes";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";
import { GenerationRunService } from "./generation-run-service";
import { seedGenerationRoutes } from "./seed-generation-routes";
import { GenerationAgentToolProvider } from "./generation-agent-tool-provider";
import { GenerationReviewRegistry } from "./generation-review-registry";

const NOW = "2026-08-06T00:00:00.000Z";

describe("GenerationAgentToolProvider", () => {
  let database: SqliteDatabase;
  let repository: SqliteGenerationRepository;
  let service: GenerationRunService;
  let provider: GenerationAgentToolProvider;
  let reviews: GenerationReviewRegistry;
  let sequence: number;

  beforeEach(async () => {
    database = new SqliteDatabase(":memory:");
    repository = new SqliteGenerationRepository(database);
    await seedGenerationRoutes(repository, createRunningHubRoutes(NOW).map((route) => ({ ...route, enabled: true })));
    await repository.setProviderEnabled("runninghub", true, NOW);
    await repository.upsertSession(session());
    sequence = 0;
    service = new GenerationRunService(repository, {
      createId: () => `id-${++sequence}`,
      now: () => new Date(NOW),
    });
    reviews = new GenerationReviewRegistry();
    reviews.begin("session-1", generationTurn(false));
    provider = new GenerationAgentToolProvider(() => service, {
      waitTimeoutMs: 0,
      pollIntervalMs: 0,
    }, reviews);
  });

  afterEach(() => database.close());

  it("rejects paid generation without explicit user authorization", async () => {
    reviews.end("session-1");
    const generate = provider.getTools({ sessionId: "session-1", cwd: "D:\\project" })[0]!;
    await expect(generate.execute({
      toolCallId: "call-without-approval",
      input: { prompt: "A quiet lake", userAuthorized: false },
    })).rejects.toMatchObject({
      code: "GENERATION_USER_AUTHORIZATION_REQUIRED",
      status: 403,
    });
    await expect(service.listRuns("session-1")).resolves.toHaveLength(0);
  });

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
      input: { prompt: "A quiet lake", userAuthorized: true },
    };
    const first = await generate.execute(context);
    const repeated = await generate.execute(context);

    expect(first.details).toMatchObject({
      runId: "id-1",
      status: "queued",
      phase: "queued",
      waitTimedOut: true,
      createdAt: NOW,
    });
    expect(generate.promptGuidelines).toContain(
      "The generation tool waits for completion. Do not poll get_generation automatically. Use it only when the user explicitly asks about an existing run.",
    );
    expect(generate.promptGuidelines?.join(" ")).toContain(
      "Do not mention pricing, billing, or paid APIs unless the user asks about them.",
    );
    expect(repeated.details).toEqual(first.details);
    await expect(service.listRuns("session-1")).resolves.toHaveLength(1);
  });

  it("returns the provider task ID after the provider accepts the job", async () => {
    const tools = provider.getTools({ sessionId: "session-1", cwd: "D:\\project" });
    const created = await service.createRun({
      sessionId: "session-1",
      capability: "text-to-image",
      prompt: "A quiet lake",
      source: "agent-tool",
      sourceRef: "call-provider-task",
      idempotencyKey: "session-1:call-provider-task",
    });
    const job = created.jobs[0]!;
    await repository.updateJob({
      ...job,
      status: "submitted",
      remoteTaskId: "2013508786110730241",
      updatedAt: NOW,
    }, ["created"]);

    const result = await tools[2]!.execute({
      toolCallId: "get-provider-task",
      input: { runId: created.run.id },
    });

    expect(result.details).toMatchObject({
      providerId: "runninghub",
      providerTaskId: "2013508786110730241",
    });
    expect(result.content).toEqual([expect.objectContaining({
      type: "text",
      text: expect.stringContaining("RunningHub task ID: 2013508786110730241"),
    })]);
  });

  it("returns a route-aware parameter review without creating provider work", async () => {
    reviews.begin("session-1", generationTurn(true));
    provider = new GenerationAgentToolProvider(
      () => service,
      { waitTimeoutMs: 0, pollIntervalMs: 0 },
      reviews,
    );

    const updates = vi.fn();
    const result = await provider.getTools({
      sessionId: "session-1",
      cwd: "D:\\project",
    })[0]!.execute({
      toolCallId: "call-review",
      input: { prompt: "A quiet lake", userAuthorized: true },
      onUpdate: updates,
    });

    expect(result.details).toMatchObject({
      status: "awaiting_confirmation",
      phase: "awaiting_confirmation",
      review: {
        route: { id: "runninghub-seedream-v5-pro-text-to-image" },
        input: { prompt: "A quiet lake" },
      },
    });
    await expect(service.getRun(
      (result.details as GenerationToolDetails).runId,
    )).resolves.toMatchObject({ jobs: [] });
    expect(updates).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({
        status: "awaiting_confirmation",
        review: expect.objectContaining({
          route: expect.objectContaining({
            id: "runninghub-seedream-v5-pro-text-to-image",
          }),
        }),
      }),
    }));
  });

  it("maps assets to a multimodal video run without exposing provider fields", async () => {
    const generate = provider
      .getTools({ sessionId: "session-1", cwd: "D:\\project" })
      .find((tool) => tool.name === "generate_video")!;

    const result = await generate.execute({
      toolCallId: "call-video",
      input: {
        userAuthorized: true,
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

  it("forces the selected API and binds composer assets without trusting model paths", async () => {
    reviews.begin("session-1", {
      mode: {
        type: "generation-route",
        routeId: "runninghub-seedream-v5-pro-image-to-image",
      },
      reviewFirst: false,
      originalPrompt: "Use my uploaded reference to create a new poster",
      assets: [{
        slot: "auto-image",
        name: "reference.png",
        mediaType: "image",
        mimeType: "image/png",
        ref: {
          type: "workspace-file",
          relativePath: ".po-agent/generation-inputs/reference.png",
        },
      }],
    });
    const generate = provider.getTools({
      sessionId: "session-1",
      cwd: "D:\\project",
    })[0]!;

    const result = await generate.execute({
      toolCallId: "call-policy-image",
      input: {
        prompt: "A complete new character poster inspired by the reference style",
        routeId: "runninghub-seedream-v5-pro-text-to-image",
        assets: [{ slot: "imageUrls", relativePath: "model-invented.png" }],
      },
    });
    const stored = await service.getRun(
      (result.details as GenerationToolDetails).runId,
    );

    expect(stored?.run).toMatchObject({
      routeId: "runninghub-seedream-v5-pro-image-to-image",
      input: {
        originalPrompt: "Use my uploaded reference to create a new poster",
        assets: [{
          slot: "imageUrls",
          ref: {
            type: "workspace-file",
            relativePath: ".po-agent/generation-inputs/reference.png",
          },
        }],
      },
    });
  });

  it("stops waiting on abort without cancelling the durable run", async () => {
    provider = new GenerationAgentToolProvider(() => service, {
      waitTimeoutMs: 10_000,
      pollIntervalMs: 10_000,
    }, reviews);
    const generate = provider.getTools({ sessionId: "session-1", cwd: "D:\\project" })[0]!;
    const controller = new AbortController();
    const updates = vi.fn();
    const pending = generate.execute({
      toolCallId: "call-abort",
      input: { prompt: "Keep running", userAuthorized: true },
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

function generationTurn(reviewFirst: boolean) {
  return {
    mode: { type: "generation-auto" } as const,
    reviewFirst,
    assets: [],
    originalPrompt: "Generate an image",
  };
}

function session(): GenerationSession {
  return {
    id: "session-1",
    cwd: "D:\\project",
    origin: "chat",
    createdAt: NOW,
    updatedAt: NOW,
  };
}
