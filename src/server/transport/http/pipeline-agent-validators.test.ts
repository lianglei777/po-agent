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
      referencedNodeIds: ["node-1", "node-1"],
      mentionedNodeIds: ["node-2"],
    })).toEqual({
      turnId: "turn-123",
      message: "分析这些节点",
      canvasRevision: 4,
      referencedNodeIds: ["node-1"],
      mentionedNodeIds: ["node-2"],
    });
  });

  it("maps the legacy selected node field to confirmed references", () => {
    expect(parsePipelineAgentTurnRequest({
      turnId: "turn-123",
      message: "分析",
      canvasRevision: 4,
      selectedNodeIds: ["node-1"],
    }).referencedNodeIds).toEqual(["node-1"]);
  });

  it("accepts a reference-only turn but rejects an entirely empty turn", () => {
    expect(parsePipelineAgentTurnRequest({
      turnId: "turn-123",
      message: "",
      canvasRevision: 4,
      referencedNodeIds: ["node-1"],
    }).message).toBe("");
    expect(() => parsePipelineAgentTurnRequest({
      turnId: "turn-123",
      message: "",
      canvasRevision: 4,
      referencedNodeIds: [],
    })).toThrow("message or at least one referenced node");
  });

  it("derives confirmed references from the rich document and ignores pending atoms", () => {
    const result = parsePipelineAgentTurnRequest({
      turnId: "turn-123",
      message: "调整 @正式节点",
      canvasRevision: 4,
      referencedNodeIds: ["stale-client-id"],
      document: {
        schemaVersion: 1,
        format: "tiptap-json",
        plainText: "调整 @正式节点",
        content: { type: "doc", content: [{ type: "paragraph", content: [
          { type: "resourceReference", attrs: { referenceId: "ref-1", sourceType: "canvas-node", sourceId: "node-1", mediaType: "image", label: "正式节点", role: "reference" } },
          { type: "resourceReference", attrs: { referenceId: "pending-1", sourceType: "canvas-node", sourceId: "node-2", mediaType: "image", label: "候选节点", role: "reference", pending: true } },
        ] }] },
      },
    });
    expect(result.referencedNodeIds).toEqual(["node-1"]);
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
