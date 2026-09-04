import { describe, expect, it } from "vitest";
import { pipelineAgentCanvasContextReady, pipelineAgentIsRunning } from "./pipeline-agent-state";

describe("pipelineAgentIsRunning", () => {
  it("does not confuse a loaded Runtime with an active turn", () => {
    expect(pipelineAgentIsRunning({ running: true })).toBe(false);
    expect(pipelineAgentIsRunning({
      running: true,
      state: {
        sessionId: "session-1",
        sessionFile: "session.jsonl",
        isStreaming: false,
        isCompacting: false,
        autoRetryEnabled: false,
        contextUsage: null,
        systemPrompt: "",
        thinkingLevel: "off",
      },
    })).toBe(false);
  });

  it("uses the Runtime streaming state", () => {
    expect(pipelineAgentIsRunning({
      running: true,
      state: {
        sessionId: "session-1",
        sessionFile: "session.jsonl",
        isStreaming: true,
        isCompacting: false,
        autoRetryEnabled: false,
        contextUsage: null,
        systemPrompt: "",
        thinkingLevel: "off",
      },
    })).toBe(true);
  });
});

describe("pipelineAgentCanvasContextReady", () => {
  it("waits until every local canvas mutation is persisted", () => {
    expect(pipelineAgentCanvasContextReady("saving", 0)).toBe(false);
    expect(pipelineAgentCanvasContextReady("idle", 1)).toBe(false);
    expect(pipelineAgentCanvasContextReady("error", 1)).toBe(false);
    expect(pipelineAgentCanvasContextReady("saved", 0)).toBe(true);
  });
});
