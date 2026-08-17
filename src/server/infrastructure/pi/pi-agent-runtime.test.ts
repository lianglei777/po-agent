import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SessionManager,
  type AgentSession,
} from "@earendil-works/pi-coding-agent";
import { mapEvents, PiAgentRuntime } from "./pi-agent-runtime";

describe("mapEvents", () => {
  it("forwards partial tool results for incremental UI updates", () => {
    expect(
      mapEvents({
        type: "tool_execution_update",
        toolCallId: "tool-1",
        toolName: "generate_image",
        args: {},
        partialResult: {
          content: [{ type: "text", text: "Generation is running" }],
          details: { runId: "run-1", status: "running" },
        },
      }),
    ).toEqual([
      {
        type: "tool_execution_update",
        toolCallId: "tool-1",
        toolName: "generate_image",
        content: [{ type: "text", text: "Generation is running" }],
        details: { runId: "run-1", status: "running" },
      },
    ]);
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
  it("forces the planned generation tool only for the first provider request", async () => {
    type StreamFunction = AgentSession["agent"]["streamFunction"];
    const streamImplementation: StreamFunction = () =>
      undefined as unknown as ReturnType<StreamFunction>;
    const streamMock = vi.fn(streamImplementation);
    const originalStream: StreamFunction = streamMock;
    const setActiveToolsByName = vi.fn();
    const agent = { streamFunction: originalStream };
    const prompt = vi.fn(async () => {
      expect(agent.streamFunction).not.toBe(originalStream);
      agent.streamFunction(
        { api: "openai-completions" } as Parameters<StreamFunction>[0],
        { systemPrompt: "", messages: [], tools: [] },
        { reasoning: "high" },
      );
      agent.streamFunction(
        { api: "openai-completions" } as Parameters<StreamFunction>[0],
        { systemPrompt: "", messages: [], tools: [] },
        {},
      );
    });
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      sessionManager: SessionManager.inMemory("C:\\workspace"),
      agent,
      prompt,
      getActiveToolNames: () => ["read", "generate_image"],
      setActiveToolsByName,
      modelRuntime: { refresh: vi.fn() },
    } as unknown as AgentSession);

    await runtime.execute({
      type: "prompt",
      message: "Create a poster",
      generation: {
        mode: { type: "generation-route", routeId: "route-1" },
        reviewFirst: false,
        assets: [],
        plan: {
          toolName: "generate_image",
          routeId: "route-1",
          prompt: "Create a complete poster",
          parameters: {},
        },
      },
    });

    expect(setActiveToolsByName).toHaveBeenNthCalledWith(1, ["generate_image"]);
    expect(setActiveToolsByName).toHaveBeenLastCalledWith(["read", "generate_image"]);
    expect(streamMock.mock.calls[0]?.[2]).toMatchObject({ toolChoice: "required" });
    expect(streamMock.mock.calls[0]?.[2]).toHaveProperty("reasoning", undefined);
    expect(streamMock.mock.calls[1]?.[2]).not.toHaveProperty("toolChoice");
    expect(streamMock.mock.calls[1]?.[2]).toHaveProperty("reasoning", undefined);
    expect(agent.streamFunction).toBe(originalStream);
  });

  it("preserves required tools when the active tool selection changes", async () => {
    const setActiveToolsByName = vi.fn();
    const runtime = new PiAgentRuntime(
      {
        sessionId: "session-1",
        sessionFile: "session-1.jsonl",
        setActiveToolsByName,
      } as unknown as AgentSession,
      ["web_search", "fetch_content"],
    );

    await runtime.execute({ type: "set_tools", toolNames: ["read"] });

    expect(setActiveToolsByName).toHaveBeenCalledWith([
      "read",
      "web_search",
      "fetch_content",
    ]);
  });

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

  it("reloads Web Access extensions once before the next prompt", async () => {
    const reload = vi.fn(async () => {});
    const prompt = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      reload,
      prompt,
      modelRuntime: { refresh: vi.fn() },
    } as unknown as AgentSession);

    runtime.invalidateWebAccessConfig();
    await runtime.execute({ type: "prompt", message: "search" });
    await runtime.execute({ type: "prompt", message: "search again" });

    expect(reload).toHaveBeenCalledOnce();
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it("persists generation audit context as a hidden model-context message", async () => {
    const manager = SessionManager.inMemory("C:\\workspace");
    const prompt = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      sessionManager: manager,
      prompt,
      modelRuntime: { refresh: vi.fn() },
    } as unknown as AgentSession);

    await runtime.execute({
      type: "prompt",
      message: "analyze the result",
      generationContext: "trusted run audit",
      generation: {
        mode: { type: "generation-auto" },
        reviewFirst: false,
        assets: [{
          slot: "imageUrls",
          name: "reference.png",
          mediaType: "image",
          mimeType: "image/png",
          ref: {
            type: "workspace-file",
            relativePath: ".po-agent/generation-inputs/reference.png",
          },
        }],
      },
    });

    expect(manager.getEntries()).toContainEqual(expect.objectContaining({
      type: "custom_message",
      customType: "po-agent-generation-context",
      content: "trusted run audit",
      display: false,
      details: {
        assets: [expect.objectContaining({ name: "reference.png" })],
      },
    }));
    expect(prompt).toHaveBeenCalledWith("analyze the result", { images: undefined });
  });

  it("records a workflow generation turn once without prompting the model", async () => {
    const manager = SessionManager.inMemory("C:\\workspace");
    const prompt = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      sessionManager: manager,
      prompt,
      modelRuntime: { refresh: vi.fn() },
    } as unknown as AgentSession);
    const command = {
      type: "record_user_turn" as const,
      turnId: "turn-123",
      message: "修改这张图片",
      generationContext: "trusted attachment context",
      assets: [{
        slot: "auto-image",
        name: "reference.png",
        mediaType: "image" as const,
        mimeType: "image/png",
        ref: {
          type: "workspace-file" as const,
          relativePath: ".po-agent/generation-inputs/reference.png",
        },
      }],
      plan: {
        toolName: "generate_image" as const,
        routeId: "image-route",
        prompt: "生成女性角色",
        parameters: { width: 1024 },
      },
    };

    await runtime.execute(command);
    await runtime.execute(command);

    expect(manager.getEntries().filter((entry) =>
      entry.type === "custom_message" &&
      entry.customType === "po-agent-generation-turn"
    )).toHaveLength(1);
    expect(manager.getBranch().filter((entry) =>
      entry.type === "message" && entry.message.role === "user"
    )).toHaveLength(1);
    expect(manager.getBranch().filter((entry) =>
      entry.type === "message" &&
      entry.message.role === "assistant" &&
      entry.message.content.some((part) =>
        part.type === "toolCall" &&
        part.id === "chat-workflow:turn-123" &&
        part.name === "generate_image"
      )
    )).toHaveLength(1);
    expect(prompt).not.toHaveBeenCalled();
  });

  it("records one workflow result per run and permits an error to be superseded", async () => {
    const manager = SessionManager.inMemory("C:\\workspace");
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      sessionManager: manager,
      prompt: vi.fn(async () => {}),
      modelRuntime: { refresh: vi.fn() },
    } as unknown as AgentSession);
    const failed = {
      type: "record_generation_turn_result" as const,
      turnId: "turn-123",
      toolName: "generate_image" as const,
      result: {
        content: [{ type: "text" as const, text: "provider unavailable" }],
        details: { error: { code: "GENERATION_PROVIDER_ERROR" } },
        isError: true,
      },
    };
    const succeeded = {
      ...failed,
      result: {
        content: [{ type: "text" as const, text: "run-1 queued" }],
        details: { runId: "run-1", status: "queued" },
        isError: false,
      },
    };

    await runtime.execute(failed);
    await runtime.execute(failed);
    await runtime.execute(succeeded);
    await runtime.execute(succeeded);

    const results = manager.getBranch().filter((entry) =>
      entry.type === "message" &&
      entry.message.role === "toolResult" &&
      entry.message.toolCallId === "chat-workflow:turn-123"
    );
    expect(results).toHaveLength(2);
    expect(results.at(-1)).toMatchObject({
      message: { isError: false, details: { runId: "run-1" } },
    });
  });

  it("persists a new generation-only session without waiting for a model response", async () => {
    const root = mkdtempSync(join(tmpdir(), "po-agent-generation-session-"));
    try {
      const manager = SessionManager.create(root, root, { id: "session-persisted" });
      const runtime = new PiAgentRuntime({
        sessionId: "session-persisted",
        sessionFile: manager.getSessionFile(),
        sessionManager: manager,
        prompt: vi.fn(async () => {}),
        modelRuntime: { refresh: vi.fn() },
      } as unknown as AgentSession);

      await runtime.execute({
        type: "record_user_turn",
        turnId: "turn-persisted",
        message: "修改这张图片",
        assets: [],
        plan: {
          toolName: "generate_image",
          routeId: "image-route",
          prompt: "修改这张图片",
          parameters: {},
        },
      });

      const sessionFile = manager.getSessionFile();
      expect(sessionFile && existsSync(sessionFile)).toBe(true);
      expect(SessionManager.open(sessionFile!).getBranch()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "message",
            message: expect.objectContaining({ role: "user" }),
          }),
        ]),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
    const refresh = vi.fn(async () => ({
      aborted: false,
      errors: new Map(),
    }));
    const getModel = vi.fn(() => refreshedModel);
    const setModel = vi.fn(async () => {});
    const prompt = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      model: previousModel,
      modelRuntime: { refresh, getModel },
      setModel,
      prompt,
    } as unknown as AgentSession);

    runtime.invalidateModelConfig({
      scope: "targets",
      targets: [{ provider: "custom", modelId: "model-a" }],
    });
    await runtime.execute({ type: "prompt", message: "continue" });

    expect(refresh).toHaveBeenCalledOnce();
    expect(getModel).toHaveBeenCalledWith("custom", "model-a");
    expect(setModel).toHaveBeenCalledWith(refreshedModel);
    expect(prompt).toHaveBeenCalledWith("continue", { images: undefined });
    expect(setModel.mock.invocationCallOrder[0]).toBeLessThan(
      prompt.mock.invocationCallOrder[0],
    );
  });

  it("ignores changes for another model", async () => {
    const refresh = vi.fn(async () => ({
      aborted: false,
      errors: new Map(),
    }));
    const prompt = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      model: { provider: "custom", id: "model-b" },
      modelRuntime: { refresh },
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
    const refresh = vi.fn(async () => ({
      aborted: false,
      errors: new Map(),
    }));
    const getModel = vi.fn(() => model);
    const setModel = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      model,
      modelRuntime: { refresh, getModel },
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
    const refresh = vi.fn(async () => ({
      aborted: false,
      errors: new Map(),
    }));
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
      modelRuntime: { refresh },
      getContextUsage: vi.fn(() => null),
      systemPrompt: "",
      thinkingLevel: "off",
    } as unknown as AgentSession);

    runtime.invalidateModelConfig({ scope: "all" });
    await runtime.execute({ type: "get_state" });

    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the model config invalidated when refresh reports an error", async () => {
    const refresh = vi
      .fn()
      .mockResolvedValueOnce({
        aborted: false,
        errors: new Map([["custom", new Error("invalid config")]]),
      })
      .mockResolvedValueOnce({ aborted: false, errors: new Map() });
    const model = { provider: "custom", id: "model-a" };
    const getModel = vi.fn(() => model);
    const prompt = vi.fn(async () => {});
    const runtime = new PiAgentRuntime({
      sessionId: "session-1",
      sessionFile: "session-1.jsonl",
      model,
      modelRuntime: { refresh, getModel },
      setModel: vi.fn(async () => {}),
      prompt,
    } as unknown as AgentSession);

    runtime.invalidateModelConfig({ scope: "all" });
    await expect(
      runtime.execute({ type: "prompt", message: "first" }),
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    await runtime.execute({ type: "prompt", message: "second" });

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(prompt).toHaveBeenCalledOnce();
  });
});
