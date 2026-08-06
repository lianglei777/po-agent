import { describe, expect, it, vi } from "vitest";
import {
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { mapEvents, PiAgentRuntime } from "./pi-agent-runtime";

describe("mapEvents", () => {
  it("forwards partial tool results for incremental UI updates", () => {
    expect(mapEvents({
      type: "tool_execution_update",
      toolCallId: "tool-1",
      toolName: "generate_image",
      args: {},
      partialResult: {
        content: [{ type: "text", text: "Generation is running" }],
        details: { runId: "run-1", status: "running" },
      },
    })).toEqual([{
      type: "tool_execution_update",
      toolCallId: "tool-1",
      toolName: "generate_image",
      content: [{ type: "text", text: "Generation is running" }],
      details: { runId: "run-1", status: "running" },
    }]);
  });

  it("emits a structured agent error after an errored assistant message", () => {
    const events = mapEvents({
      type: "message_end",
      message: {
        role: "assistant",
        content: [],
        api: "openai-completions",
        provider: "custom",
        model: "deepseek-v4-pro",
        stopReason: "error",
        errorMessage: "400 unsupported developer role",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        timestamp: 1,
      },
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "message_end",
      message: {
        role: "assistant",
        failure: { code: "MODEL_PROTOCOL_ERROR" },
      },
    });
    expect(events[1]).toMatchObject({
      type: "agent_error",
      error: {
        code: "MODEL_PROTOCOL_ERROR",
        provider: "custom",
        model: "deepseek-v4-pro",
      },
    });
  });
});

describe("PiAgentRuntime model config refresh", () => {
  it("refreshes and rebinds the current model before the next prompt", async () => {
    const previousModel = {
      provider: "custom",
      id: "model-a",
      compat: { supportsDeveloperRole: true },
    };
    const refreshedModel = {
      ...previousModel,
      compat: { supportsDeveloperRole: false },
    };
    const refresh = vi.fn();
    const find = vi.fn(() => refreshedModel);
    const setModel = vi.fn(async () => {});
    const prompt = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      model: previousModel,
      modelRegistry: { refresh, find },
      setModel,
      prompt,
    } as unknown as AgentSession);

    runtime.invalidateModelConfig({
      scope: "targets",
      targets: [{ provider: "custom", modelId: "model-a" }],
    });
    await runtime.execute({ type: "prompt", message: "continue" });

    expect(refresh).toHaveBeenCalledOnce();
    expect(find).toHaveBeenCalledWith("custom", "model-a");
    expect(setModel).toHaveBeenCalledWith(refreshedModel);
    expect(prompt).toHaveBeenCalledWith("continue", { images: undefined });
    expect(setModel.mock.invocationCallOrder[0]).toBeLessThan(
      prompt.mock.invocationCallOrder[0],
    );
  });

  it("ignores changes for another model", async () => {
    const refresh = vi.fn();
    const prompt = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      model: { provider: "custom", id: "model-b" },
      modelRegistry: { refresh },
      prompt,
    } as unknown as AgentSession);

    runtime.invalidateModelConfig({
      scope: "targets",
      targets: [{ provider: "custom", modelId: "model-a" }],
    });
    await runtime.execute({ type: "prompt", message: "continue" });

    expect(refresh).not.toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("refreshes when the current model provider is targeted", async () => {
    const model = { provider: "custom", id: "model-b" };
    const refresh = vi.fn();
    const find = vi.fn(() => model);
    const setModel = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      model,
      modelRegistry: { refresh, find },
      setModel,
      prompt: vi.fn(async () => {}),
    } as unknown as AgentSession);

    runtime.invalidateModelConfig({
      scope: "targets",
      targets: [{ provider: "custom" }],
    });
    await runtime.execute({ type: "prompt", message: "continue" });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not refresh model config for non-prompt commands", async () => {
    const refresh = vi.fn();
    const manager = SessionManager.inMemory("C:\\workspace");
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      sessionManager: manager,
      settingsManager: {
        getCompactionSettings: () => ({
          enabled: true,
          reserveTokens: 16_384,
          keepRecentTokens: 20_000,
        }),
      },
      modelRegistry: { refresh },
      getContextUsage: vi.fn(() => null),
      systemPrompt: "",
      thinkingLevel: "off",
    } as unknown as AgentSession);

    runtime.invalidateModelConfig({ scope: "all" });
    await runtime.execute({ type: "get_state" });

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("PiAgentRuntime compaction", () => {
  it("reports whether the current branch has removable history", async () => {
    const manager = SessionManager.inMemory("C:\\workspace");
    manager.appendMessage({
      role: "user",
      content: "short conversation",
      timestamp: 1,
    });
    const session = {
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      sessionManager: manager,
      settingsManager: {
        getCompactionSettings: () => ({
          enabled: true,
          reserveTokens: 16_384,
          keepRecentTokens: 20_000,
        }),
      },
      getContextUsage: () => null,
      isStreaming: false,
      isCompacting: false,
      autoCompactionEnabled: true,
      autoRetryEnabled: true,
      systemPrompt: "",
      thinkingLevel: "off",
    } as unknown as AgentSession;

    await expect(new PiAgentRuntime(session).getState()).resolves.toMatchObject({
      compactionAvailable: false,
    });

    session.settingsManager.getCompactionSettings = () => ({
      enabled: true,
      reserveTokens: 16_384,
      keepRecentTokens: 1,
    });
    manager.appendMessage({
      role: "user",
      content: "new turn",
      timestamp: 2,
    });

    await expect(new PiAgentRuntime(session).getState()).resolves.toMatchObject({
      compactionAvailable: true,
    });
  });

  it("rejects compaction before calling the model when no messages would be removed", async () => {
    const manager = SessionManager.inMemory("C:\\workspace");
    manager.appendMessage({
      role: "user",
      content: "short conversation",
      timestamp: 1,
    });
    const compact = vi.fn(async () => ({
      summary: "unused",
      firstKeptEntryId: "unused",
      tokensBefore: 10,
      details: {},
    }));
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      sessionManager: manager,
      settingsManager: {
        getCompactionSettings: () => ({
          enabled: true,
          reserveTokens: 16_384,
          keepRecentTokens: 20_000,
        }),
      },
      compact,
    } as unknown as AgentSession);

    await expect(runtime.execute({ type: "compact" })).rejects.toMatchObject({
      code: "COMPACTION_NOT_AVAILABLE",
      status: 409,
    });
    expect(compact).not.toHaveBeenCalled();
  });

  it("delegates when the SDK preparation finds content to remove", async () => {
    const manager = SessionManager.inMemory("C:\\workspace");
    manager.appendMessage({
      role: "user",
      content: "first turn",
      timestamp: 1,
    });
    manager.appendMessage({
      role: "assistant",
      api: "openai-completions",
      provider: "custom",
      model: "model-a",
      content: [{ type: "text", text: "first answer" }],
      stopReason: "stop",
      timestamp: 2,
      usage: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 2,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
    });
    manager.appendMessage({
      role: "user",
      content: "second turn",
      timestamp: 3,
    });
    const result = {
      summary: "first turn summary",
      firstKeptEntryId: "kept",
      tokensBefore: 10,
      details: {},
    };
    const compact = vi.fn(async () => result);
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      sessionManager: manager,
      settingsManager: {
        getCompactionSettings: () => ({
          enabled: true,
          reserveTokens: 16_384,
          keepRecentTokens: 1,
        }),
      },
      compact,
    } as unknown as AgentSession);

    await expect(runtime.execute({ type: "compact" })).resolves.toEqual(result);
    expect(compact).toHaveBeenCalledOnce();
  });

  it("allows compaction when an oversized turn has a removable prefix", async () => {
    const manager = SessionManager.inMemory("C:\\workspace");
    manager.appendMessage({
      role: "user",
      content: "large request",
      timestamp: 1,
    });
    manager.appendMessage({
      role: "assistant",
      api: "openai-completions",
      provider: "custom",
      model: "model-a",
      content: [{ type: "text", text: "x".repeat(100) }],
      stopReason: "stop",
      timestamp: 2,
      usage: {
        input: 1,
        output: 25,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 26,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
    });
    const compact = vi.fn(async () => ({
      summary: "turn prefix summary",
      firstKeptEntryId: "kept",
      tokensBefore: 26,
      details: {},
    }));
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      sessionManager: manager,
      settingsManager: {
        getCompactionSettings: () => ({
          enabled: true,
          reserveTokens: 16_384,
          keepRecentTokens: 1,
        }),
      },
      compact,
    } as unknown as AgentSession);

    await runtime.execute({ type: "compact" });

    expect(compact).toHaveBeenCalledOnce();
  });
});
