import { describe, expect, it, vi } from "vitest";
import type { AgentRuntime } from "@/server/ports/agent-runtime";
import { InMemoryAgentRegistry } from "./in-memory-agent-registry";

describe("InMemoryAgentRegistry", () => {
  it("shares one start promise for concurrent session restores", async () => {
    const registry = new InMemoryAgentRegistry();
    const runtime = createRuntime("session-1");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const factory = vi.fn(async () => {
      await gate;
      return runtime;
    });

    const first = registry.getOrStart("session-1", factory);
    const second = registry.getOrStart("session-1", factory);
    release();

    await expect(first).resolves.toBe(runtime);
    await expect(second).resolves.toBe(runtime);
    expect(factory).toHaveBeenCalledTimes(1);
    registry.destroy("session-1");
  });

  it("propagates model config impact to every loaded runtime", () => {
    const registry = new InMemoryAgentRegistry();
    const firstInvalidation = vi.fn();
    const secondInvalidation = vi.fn();
    const first = createRuntime("session-1", firstInvalidation);
    const second = createRuntime("session-2", secondInvalidation);

    registry.register(first.sessionId, first);
    registry.register(second.sessionId, second);

    const invalidation = {
      scope: "targets" as const,
      targets: [{ provider: "custom", modelId: "model-a" }],
    };
    registry.invalidateModelConfig(invalidation);

    expect(firstInvalidation).toHaveBeenCalledWith(invalidation);
    expect(secondInvalidation).toHaveBeenCalledWith(invalidation);
    registry.destroy(first.sessionId);
    registry.destroy(second.sessionId);
  });

  it("reloads Agent settings in every loaded runtime", async () => {
    const registry = new InMemoryAgentRegistry();
    const first = createRuntime("session-1");
    const second = createRuntime("session-2");
    first.reloadAgentSettings = vi.fn(async () => {});
    second.reloadAgentSettings = vi.fn(async () => {});
    registry.register(first.sessionId, first);
    registry.register(second.sessionId, second);

    await registry.reloadAgentSettings();

    expect(first.reloadAgentSettings).toHaveBeenCalledOnce();
    expect(second.reloadAgentSettings).toHaveBeenCalledOnce();
    registry.destroy(first.sessionId);
    registry.destroy(second.sessionId);
  });
});

function createRuntime(
  sessionId: string,
  invalidateModelConfig: (invalidation: unknown) => void = () => {},
): AgentRuntime {
  return {
    sessionId,
    sessionFile: `${sessionId}.jsonl`,
    isAlive: () => true,
    execute: async <T,>() => undefined as T,
    getState: async () => ({
      sessionId,
      sessionFile: `${sessionId}.jsonl`,
      isStreaming: false,
      isCompacting: false,
      autoRetryEnabled: true,
      contextUsage: null,
      systemPrompt: "",
      thinkingLevel: "off",
    }),
    subscribe: () => () => {},
    invalidateModelConfig,
    reloadAgentSettings: async () => {},
    destroy: () => {},
  };
}
