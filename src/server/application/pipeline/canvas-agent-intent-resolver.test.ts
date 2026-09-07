import { describe, expect, it, vi } from "vitest";
import type { LlmPort } from "@/server/ports/llm-port";
import type { SessionRepository } from "@/server/ports/session-repository";
import { CanvasAgentIntentResolver, canvasAgentTurnPolicyContext, resolvePolicy } from "./canvas-agent-intent-resolver";

describe("resolvePolicy", () => {
  it.each([
    ["discuss", ["discuss"]],
    ["script", ["discuss", "script"]],
    ["storyboard", ["discuss", "script", "storyboard"]],
    ["canvas", ["discuss", "script", "storyboard", "canvas", "review"]],
    ["review", ["discuss", "review"]],
  ] as const)("stops a %s request at its requested delivery stage", (stage, allowedStages) => {
    expect(resolvePolicy(decision(stage), "当前请求", true)).toMatchObject({
      type: "resolved",
      requestedStage: stage,
      effectiveStage: stage,
      allowedStages,
      generationPermission: "not-requested",
    });
  });

  it("does not treat the project switch as generation intent", () => {
    expect(resolvePolicy(decision("script"), "写一个广告剧本", true)).toMatchObject({
      effectiveStage: "script",
      allowedStages: ["discuss", "script"],
      generationPermission: "not-requested",
    });
  });

  it("turns an explicitly requested regeneration into manual canvas preparation", () => {
    expect(resolvePolicy(decision("generate"), "评审后重新生成这个镜头", true)).toMatchObject({
      requestedStage: "canvas",
      effectiveStage: "canvas",
      allowedStages: ["discuss", "script", "storyboard", "canvas", "review"],
      generationPermission: "not-requested",
    });
  });

  it("stops at a prepared canvas regardless of the legacy automatic generation setting", () => {
    expect(resolvePolicy(decision("generate"), "做成完整视频", false)).toMatchObject({
      requestedStage: "canvas",
      effectiveStage: "canvas",
      generationPermission: "not-requested",
    });
    expect(resolvePolicy(decision("generate"), "做成完整视频", true)).toMatchObject({
      requestedStage: "canvas",
      effectiveStage: "canvas",
      generationPermission: "not-requested",
    });
  });

  it("keeps an explicit manual-generation request in canvas preparation", () => {
    expect(resolvePolicy({ ...decision("generate"), explicitlyForbidsGeneration: true }, "节点搭好，我自己生成", true)).toMatchObject({
      effectiveStage: "canvas",
      generationPermission: "not-requested",
    });
  });

  it("limits ambiguous requests to a clarification question", () => {
    expect(resolvePolicy({
      ...decision("generate"),
      confidence: "low",
      needsClarification: true,
      question: "你希望只搭节点还是现在生成？",
    }, "帮我做一下", true)).toMatchObject({
      type: "clarification",
      effectiveStage: "discuss",
      allowedStages: ["discuss"],
      question: "你希望只搭节点还是现在生成？",
    });
  });
});

describe("CanvasAgentIntentResolver", () => {
  it("uses recent conversation, canvas context, and the selected Agent model", async () => {
    const chat = vi.fn(async (
      _messages: Parameters<LlmPort["chat"]>[0],
      _options?: Parameters<LlmPort["chat"]>[1],
    ) => {
      void _messages;
      void _options;
      return JSON.stringify(decision("storyboard"));
    });
    const sessions = {
      getContext: vi.fn(async () => ({
        messages: [
          { role: "user", content: "做一个香水广告", timestamp: 1 },
          { role: "assistant", provider: "p", model: "m", content: [{ type: "text", text: "可以" }], timestamp: 2 },
        ],
      })),
    } as unknown as SessionRepository;
    const resolver = new CanvasAgentIntentResolver({ chat } as unknown as LlmPort, sessions);

    await expect(resolver.resolve({
      sessionId: "session-1",
      message: "拆成六个镜头",
      model: { provider: "openai", modelId: "gpt-test" },
      allowAgentGeneration: true,
      canvasContext: "<canvas-agent-context>current</canvas-agent-context>",
    })).resolves.toMatchObject({ effectiveStage: "storyboard" });

    expect(chat).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({
      model: "openai:gpt-test",
      temperature: 0,
    }));
    expect(JSON.stringify(chat.mock.calls[0]?.[0])).toContain("做一个香水广告");
    expect(JSON.stringify(chat.mock.calls[0]?.[0])).toContain("canvas-agent-context");
  });

  it("retries one malformed classifier response", async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce(JSON.stringify(decision("script")));
    const resolver = new CanvasAgentIntentResolver(
      { chat } as unknown as LlmPort,
      { getContext: vi.fn(async () => null) } as unknown as SessionRepository,
    );

    await expect(resolver.resolve({
      sessionId: "session-1",
      message: "写剧本",
      model: null,
      allowAgentGeneration: false,
      canvasContext: "context",
    })).resolves.toMatchObject({ effectiveStage: "script" });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("limits semantic scope to real project nodes and retains explicit focus", async () => {
    const chat = vi.fn().mockResolvedValue(JSON.stringify({
      ...decision("canvas"),
      scope: { projectWide: false, nodeIds: ["node-by-name", "invented-node"] },
    }));
    const resolver = new CanvasAgentIntentResolver(
      { chat } as unknown as LlmPort,
      { getContext: vi.fn(async () => null) } as unknown as SessionRepository,
    );

    await expect(resolver.resolve({
      sessionId: "session-1",
      message: "调整第三镜",
      model: null,
      allowAgentGeneration: false,
      canvasContext: "context",
      availableNodeIds: ["node-selected", "node-by-name", "node-other"],
      focusNodeIds: ["node-selected"],
    })).resolves.toMatchObject({
      scope: { projectWide: false, nodeIds: ["node-selected", "node-by-name"] },
    });
  });

  it("continues an explicitly offered canvas step when the user replies with a permissive choice", async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        ...decision("discuss"), confidence: "low", needsClarification: true,
      }))
      .mockResolvedValueOnce(JSON.stringify({ stage: "canvas", confidence: "high" }));
    const resolver = new CanvasAgentIntentResolver(
      { chat } as unknown as LlmPort,
      { getContext: vi.fn(async () => ({ messages: [
        { role: "assistant", content: [{ type: "text", text: "回复都行，我会继续搭分镜链路并创建画布节点。" }], timestamp: 1 },
      ] })) } as unknown as SessionRepository,
    );

    await expect(resolver.resolve({
      sessionId: "session-1", message: "都行", model: null, allowAgentGeneration: false, canvasContext: "context",
    })).resolves.toMatchObject({
      requestedStage: "canvas", effectiveStage: "canvas", confidence: "medium",
      allowedStages: ["discuss", "script", "storyboard", "canvas", "review"],
    });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it("keeps the clarification when semantic follow-up resolution is ambiguous", async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        ...decision("discuss"), confidence: "low", needsClarification: true,
      }))
      .mockResolvedValueOnce(JSON.stringify({ stage: null, confidence: "low" }));
    const resolver = new CanvasAgentIntentResolver(
      { chat } as unknown as LlmPort,
      { getContext: vi.fn(async () => ({ messages: [
        { role: "assistant", content: [{ type: "text", text: "我可以写剧本，也可以直接生成视频。你希望哪一个？" }], timestamp: 1 },
      ] })) } as unknown as SessionRepository,
    );

    await expect(resolver.resolve({
      sessionId: "session-1", message: "都行", model: null, allowAgentGeneration: true, canvasContext: "context",
    })).resolves.toMatchObject({ type: "clarification", effectiveStage: "discuss" });
  });

  it("makes a clarification-only policy prohibit every Canvas tool call", () => {
    const context = canvasAgentTurnPolicyContext({
      type: "clarification", objective: "模糊请求", requestedStage: "discuss", effectiveStage: "discuss",
      allowedStages: ["discuss"], generationPermission: "not-requested", confidence: "low", question: "你希望先做什么？",
    });
    expect(context).toContain("Do not call any Canvas tool");
    expect(context).toContain("Reply with the supplied question verbatim");
  });
});

function decision(requestedStage: "discuss" | "script" | "storyboard" | "canvas" | "generate" | "review") {
  return {
    requestedStage,
    objective: "完成当前要求",
    confidence: "high" as const,
    needsClarification: false,
    explicitlyForbidsGeneration: false,
    scope: { projectWide: true, nodeIds: [] },
  };
}
