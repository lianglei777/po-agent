import { describe, expect, it, vi } from "vitest";
import type { GenerationRouteDto } from "@/contracts/generation";
import type { AgentService } from "./agent-service";
import type { GenerationTurnPlanningService } from "./content-generation/generation-turn-planning-service";
import type { GenerationRunService } from "./content-generation/generation-run-service";
import type { GenerationTurnExecutor } from "./content-generation/generation-turn-executor";
import { ChatTurnService } from "./chat-turn-service";

const route: GenerationRouteDto = {
  id: "image-route",
  name: "Image",
  capability: "image-to-image",
  product: "Image",
  providerId: "provider",
  enabled: true,
  isDefault: true,
  revision: 1,
  defaults: {},
  inputSchema: { prompt: { required: true } },
};

function setup(plan: unknown) {
  const execute = vi
    .fn<(sessionId: string, command: unknown) => Promise<{ accepted: boolean }>>()
    .mockResolvedValue({ accepted: true });
  const agents = {
    execute,
    recordGenerationTurn: vi.fn(async () => {}),
    recordGenerationTurnResult: vi.fn(async () => {}),
    getState: vi.fn(async () => ({
      model: { provider: "chat-provider", id: "chat-model" },
    })),
  } as unknown as AgentService;
  const planner = {
    plan: vi.fn(async () => plan),
  } as unknown as GenerationTurnPlanningService;
  const runs = {
    listRunsForContext: vi.fn(async () => []),
    getRoute: vi.fn(async () => null),
  } as unknown as GenerationRunService;
  const run = {
    run: {
      id: "run-1",
      sessionId: "session-1",
      capability: "image-to-image",
      routeId: "image-route",
      status: "awaiting_confirmation",
      prompt: "生成一位相似画风的女性角色",
      input: { prompt: "生成一位相似画风的女性角色" },
      source: "chat-workflow",
      idempotencyKey: "chat-turn:session-1:turn-1",
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    },
    jobs: [],
    artifacts: [],
  } as const;
  const generationExecutor = {
    execute: vi.fn(async () => run),
  } as unknown as GenerationTurnExecutor;
  return {
    agents,
    execute,
    generationExecutor,
    planner,
    runs,
    service: new ChatTurnService(agents, planner, runs, generationExecutor),
  };
}

describe("ChatTurnService", () => {
  it("submits ordinary chat without invoking the generation planner", async () => {
    const { execute, service } = setup({ type: "generation" });
    await expect(service.submit("session-1", { turnId: "turn-1", message: "今天星期几" }))
      .resolves.toEqual({ type: "accepted", intent: "chat" });
    expect(execute).toHaveBeenCalledWith("session-1", {
      type: "prompt",
      message: "今天星期几",
      images: undefined,
    });
  });

  it("treats a planner chat decision as final and removes generation authorization", async () => {
    const { execute, service } = setup({ type: "chat" });
    await expect(service.submit("session-1", {
      turnId: "turn-1",
      message: "为什么上一张图片没有变化？",
      generation: {
        mode: { type: "generation-auto" },
        reviewFirst: false,
        assets: [],
      },
    })).resolves.toEqual({ type: "accepted", intent: "chat" });
    expect(execute).toHaveBeenCalledWith("session-1", {
      type: "prompt",
      message: "为什么上一张图片没有变化？",
      images: undefined,
    });
  });

  it("executes a trusted generation plan without asking the chat model to call a tool", async () => {
    const { agents, execute, generationExecutor, service } = setup({
      type: "generation",
      route,
      effectivePrompt: "生成一位相似画风的女性角色",
      parameters: { width: 1024 },
    });
    const asset = {
      slot: "auto-image",
      name: "reference.png",
      mediaType: "image" as const,
      mimeType: "image/png",
      ref: { type: "workspace-file" as const, relativePath: ".po-agent/input.png" },
    };
    await expect(service.submit("session-1", {
      turnId: "turn-1",
      message: "生成相似风格的女性角色",
      generation: {
        mode: { type: "generation-auto" },
        reviewFirst: true,
        assets: [asset],
      },
    })).resolves.toMatchObject({
      type: "accepted",
      intent: "generation",
      run: { run: { id: "run-1" } },
      route: { id: "image-route" },
    });
    expect(agents.recordGenerationTurn).toHaveBeenCalledWith("session-1", {
      turnId: "turn-1",
      message: "生成相似风格的女性角色",
      assets: [asset],
      plan: {
        toolName: "generate_image",
        routeId: "image-route",
        prompt: "生成一位相似画风的女性角色",
        parameters: { width: 1024 },
      },
    });
    // 成功路径不再立即记录 toolResult；Run 终态后由 sync 或下次 submit 兜底补录。
    expect(agents.recordGenerationTurnResult).not.toHaveBeenCalled();
    expect(generationExecutor.execute).toHaveBeenCalledWith({
      sessionId: "session-1",
      turnId: "turn-1",
      originalPrompt: "生成相似风格的女性角色",
      reviewFirst: true,
      assets: [asset],
      plan: {
        toolName: "generate_image",
        routeId: "image-route",
        prompt: "生成一位相似画风的女性角色",
        parameters: { width: 1024 },
      },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns clarification without starting an Agent prompt", async () => {
    const { execute, service } = setup({
      type: "clarification",
      reason: "AMBIGUOUS_INTENT",
      question: "你希望分析图片还是生成新图片？",
    });
    await expect(service.submit("session-1", {
      turnId: "turn-1",
      message: "按这个来",
      generation: {
        mode: { type: "generation-auto" },
        reviewFirst: false,
        assets: [],
      },
    })).resolves.toMatchObject({ type: "clarification" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("closes the persisted tool call with an error when run creation fails", async () => {
    const { agents, generationExecutor, service } = setup({
      type: "generation",
      route,
      effectivePrompt: "生成女性角色",
      parameters: {},
    });
    vi.mocked(generationExecutor.execute).mockRejectedValueOnce(
      new Error("provider unavailable"),
    );

    await expect(service.submit("session-1", {
      turnId: "turn-failed",
      message: "修改图片",
      generation: {
        mode: { type: "generation-auto" },
        reviewFirst: false,
        assets: [],
      },
    })).rejects.toThrow("provider unavailable");

    expect(agents.recordGenerationTurnResult).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        turnId: "turn-failed",
        result: expect.objectContaining({
          isError: true,
          details: {
            error: {
              code: "INTERNAL_ERROR",
              message: "provider unavailable",
            },
          },
        }),
      }),
    );
  });

  it("requires visual input for attachment understanding without granting generation", async () => {
    const { execute, service } = setup({ type: "attachment-understanding" });
    const generation = {
      mode: { type: "generation-auto" as const },
      reviewFirst: false,
      assets: [{
        slot: "auto-image",
        name: "reference.png",
        mediaType: "image" as const,
        mimeType: "image/png",
        ref: { type: "workspace-file" as const, relativePath: "reference.png" },
      }],
    };

    await expect(service.submit("session-1", {
      turnId: "turn-1",
      message: "描述这张图片",
      generation,
    })).resolves.toMatchObject({
      type: "clarification",
      reason: "MODEL_ATTACHMENT_UNSUPPORTED",
    });
    expect(execute).not.toHaveBeenCalled();

    await expect(service.submit("session-1", {
      turnId: "turn-2",
      message: "描述这张图片",
      images: [{ type: "image", data: "abc", mimeType: "image/png" }],
      generation,
    })).resolves.toEqual({
      type: "accepted",
      intent: "attachment-understanding",
    });
    expect(execute).toHaveBeenCalledWith("session-1", expect.objectContaining({
      type: "prompt",
      generationContextAssets: generation.assets,
    }));
    expect(execute.mock.calls[0]?.[1]).not.toHaveProperty("generation");
  });

  it("rejects a new turn while a durable generation run is active", async () => {
    const execute = vi.fn();
    const agents = {
      getState: vi.fn(async () => ({ isStreaming: false, isCompacting: false })),
      execute,
    } as unknown as AgentService;
    const planner = { plan: vi.fn() } as unknown as GenerationTurnPlanningService;
    const runs = {
      listRunsForContext: vi.fn(async () => [{ run: { status: "running" } }]),
    } as unknown as GenerationRunService;
    const generationExecutor = { execute: vi.fn() } as unknown as GenerationTurnExecutor;
    const service = new ChatTurnService(agents, planner, runs, generationExecutor);

    await expect(service.submit("session-1", { turnId: "turn-1", message: "继续" }))
      .rejects.toMatchObject({ code: "GENERATION_RUN_ACTIVE", status: 409 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("restores the same workflow run before applying the active-run guard", async () => {
    const { agents, generationExecutor, planner, runs, service } = setup({
      type: "generation",
    });
    vi.mocked(runs.listRunsForContext).mockResolvedValue([
      {
        run: {
          id: "run-1",
          sessionId: "session-1",
          capability: "image-to-image",
          routeId: route.id,
          status: "awaiting_confirmation",
          prompt: "生成一位相似画风的女性角色",
          input: {
            prompt: "生成一位相似画风的女性角色",
            originalPrompt: "修改图片",
            parameters: { width: 1024 },
          },
          source: "chat-workflow",
          sourceRef: "turn-1",
          idempotencyKey: "chat-turn:session-1:turn-1",
          createdAt: "2026-08-15T00:00:00.000Z",
          updatedAt: "2026-08-15T00:00:00.000Z",
        },
        jobs: [],
        artifacts: [],
      },
    ]);
    vi.mocked(runs.getRoute).mockResolvedValueOnce({
      ...route,
      providerOperation: "image-to-image",
      adapterConfig: {},
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    });

    await expect(service.submit("session-1", {
      turnId: "turn-1",
      message: "修改图片",
      generation: {
        mode: { type: "generation-auto" },
        reviewFirst: true,
        assets: [],
      },
    })).resolves.toMatchObject({
      type: "accepted",
      intent: "generation",
      run: { run: { id: "run-1" } },
    });
    expect(planner.plan).not.toHaveBeenCalled();
    expect(agents.recordGenerationTurn).not.toHaveBeenCalled();
    expect(generationExecutor.execute).not.toHaveBeenCalled();

    await expect(service.submit("session-1", {
      turnId: "turn-1",
      message: "改成另一张图片",
      generation: {
        mode: { type: "generation-auto" },
        reviewFirst: true,
        assets: [],
      },
    })).rejects.toMatchObject({
      code: "GENERATION_IDEMPOTENCY_CONFLICT",
      status: 409,
    });
  });
});
