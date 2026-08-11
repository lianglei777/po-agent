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
  it("reloads the SDK settings snapshot on demand", async () => {
    const reload = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      settingsManager: { reload },
    } as unknown as AgentSession);

    await runtime.reloadAgentSettings();

    expect(reload).toHaveBeenCalledOnce();
  });

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
