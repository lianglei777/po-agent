import { describe, expect, it, vi } from "vitest";
import type {
  AgentRuntime,
  CreateRuntimeInput,
} from "@/server/ports/agent-runtime";
import type { SessionRepository } from "@/server/ports/session-repository";
import { InMemoryAgentRegistry } from "@/server/infrastructure/runtime/in-memory-agent-registry";
import { AgentService } from "./agent-service";
import { GenerationReviewRegistry } from "./content-generation/generation-review-registry";

describe("AgentService", () => {
  it("creates and configures a runtime without starting a prompt", async () => {
    const commands: unknown[] = [];
    const execute = async <T,>(command: unknown) => {
      commands.push(command);
      return undefined as T;
    };
    const runtime = runtimeStub({ execute });
    const registry = new InMemoryAgentRegistry();
    const service = new AgentService(
      {} as SessionRepository,
      registry,
      { create: vi.fn(async () => runtime) },
      { listRoots: async () => [], addRoot: vi.fn() },
    );

    await expect(
      service.create({
        cwd: "C:\\work",
        provider: "provider",
        modelId: "model",
        thinkingLevel: "high",
        toolNames: ["read"],
      }),
    ).resolves.toEqual({ sessionId: "created" });

    expect(commands).toEqual([
      { type: "set_model", provider: "provider", modelId: "model" },
      { type: "set_thinking_level", level: "high" },
      { type: "set_tools", toolNames: ["read"] },
    ]);
  });

  it("binds project tools to the requested session id on create", async () => {
    const runtime = runtimeStub();
    const create = vi
      .fn<(input: CreateRuntimeInput) => Promise<AgentRuntime>>()
      .mockResolvedValue(runtime);
    const getTools = vi
      .fn<(input: { sessionId: string; cwd: string }) => []>()
      .mockReturnValue([]);
    const service = new AgentService(
      {} as SessionRepository,
      new InMemoryAgentRegistry(),
      { create },
      { listRoots: async () => [], addRoot: vi.fn() },
      { getTools },
    );

    await service.create({ cwd: "C:\\work" });

    const requestedSessionId = create.mock.calls[0]?.[0].requestedSessionId;
    expect(requestedSessionId).toEqual(expect.any(String));
    expect(getTools).toHaveBeenCalledWith({
      sessionId: requestedSessionId,
      cwd: "C:\\work",
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      requestedSessionId,
      customTools: [],
    }));
  });

  it("destroys the original runtime after a successful fork", async () => {
    const destroy = vi.fn();
    const runtime: AgentRuntime = {
      sessionId: "original",
      sessionFile: "original.jsonl",
      isAlive: () => true,
      execute: async <T,>() =>
        ({
          sessionId: "forked",
          sessionFile: "forked.jsonl",
        }) as T,
      getState: async () => ({
        sessionId: "original",
        sessionFile: "original.jsonl",
        isStreaming: false,
        isCompacting: false,
        autoRetryEnabled: true,
        contextUsage: null,
        systemPrompt: "",
        thinkingLevel: "off",
      }),
      subscribe: () => () => {},
      invalidateModelConfig: () => {},
      invalidateWebAccessConfig: () => {},
      reloadAgentSettings: async () => {},
      destroy,
    };
    const registry = new InMemoryAgentRegistry();
    registry.register("original", runtime);
    const service = new AgentService(
      {} as SessionRepository,
      registry,
      { create: vi.fn() },
      { listRoots: async () => [], addRoot: vi.fn() },
    );

    await expect(
      service.execute("original", {
        type: "fork",
        entryId: "entry-1",
      }),
    ).resolves.toEqual({
      sessionId: "forked",
      sessionFile: "forked.jsonl",
    });

    expect(destroy).toHaveBeenCalledOnce();
    expect(registry.get("original")).toBeUndefined();
  });

  it("scopes generation review to the active prompt execution", async () => {
    let finishPrompt: (() => void) | undefined;
    const runtime = runtimeStub({
      execute: async <T,>() =>
        new Promise<T>((resolve) => {
          finishPrompt = () => resolve(undefined as T);
        }),
    });
    const runtimes = new InMemoryAgentRegistry();
    runtimes.register("session-1", runtime);
    const reviews = new GenerationReviewRegistry();
    const service = new AgentService(
      {} as SessionRepository,
      runtimes,
      { create: vi.fn() },
      { listRoots: async () => [], addRoot: vi.fn() },
      undefined,
      reviews,
    );

    await service.execute("session-1", {
      type: "prompt",
      message: "Generate with review",
      generationReview: true,
    });
    expect(reviews.requiresReview("session-1")).toBe(true);

    finishPrompt?.();
    await vi.waitFor(() =>
      expect(reviews.requiresReview("session-1")).toBe(false),
    );
  });
});

function runtimeStub(
  overrides: Partial<AgentRuntime> = {},
): AgentRuntime {
  return {
    sessionId: "created",
    sessionFile: "created.jsonl",
    isAlive: () => true,
    invalidateModelConfig: () => {},
    invalidateWebAccessConfig: () => {},
    reloadAgentSettings: async () => {},
    execute: async <T,>() => undefined as T,
    getState: async () => ({
      sessionId: "created",
      sessionFile: "created.jsonl",
      isStreaming: false,
      isCompacting: false,
      autoRetryEnabled: true,
      contextUsage: null,
      systemPrompt: "",
      thinkingLevel: "off",
    }),
    subscribe: () => () => {},
    destroy: () => {},
    ...overrides,
  };
}
