import { describe, expect, it } from "vitest";
import {
  parsePipelineAgentTurnRequest,
  parseUpdatePipelineAgentConversationRequest,
} from "./pipeline-agent-validators";

describe("parseUpdatePipelineAgentConversationRequest", () => {
  it("accepts generation permission and a complete model identity", () => {
    expect(parseUpdatePipelineAgentConversationRequest({ allowAgentGeneration: true }))
      .toEqual({ allowAgentGeneration: true });
    expect(parseUpdatePipelineAgentConversationRequest({ provider: " openai ", modelId: " model " }))
      .toEqual({ provider: "openai", modelId: "model" });
  });

  it("rejects incomplete and empty updates", () => {
    expect(() => parseUpdatePipelineAgentConversationRequest({ provider: "openai" }))
      .toThrow("provided together");
    expect(() => parseUpdatePipelineAgentConversationRequest({}))
      .toThrow("At least one setting");
  });
});

describe("parsePipelineAgentTurnRequest", () => {
  it("normalizes and deduplicates canvas pointers", () => {
    expect(parsePipelineAgentTurnRequest({
      turnId: " turn-123 ",
      message: " 分析这些节点 ",
      canvasRevision: 4,
      selectedNodeIds: ["node-1", "node-1"],
      mentionedNodeIds: ["node-2"],
    })).toEqual({
      turnId: "turn-123",
      message: "分析这些节点",
      canvasRevision: 4,
      selectedNodeIds: ["node-1"],
      mentionedNodeIds: ["node-2"],
    });
  });

  it("rejects invalid revisions and canvas pointers", () => {
    expect(() => parsePipelineAgentTurnRequest({
      turnId: "turn-123",
      message: "分析",
      canvasRevision: -1,
      selectedNodeIds: [],
    })).toThrow("canvasRevision");
  });
});
