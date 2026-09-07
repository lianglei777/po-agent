import { describe, expect, it } from "vitest";
import {
  EMPTY_PIPELINE_AGENT_REFERENCES,
  clearPipelineAgentReferences,
  commitPipelineAgentSelection,
  dismissPipelineAgentSelection,
  observePipelineAgentSelection,
  removePipelineAgentReference,
} from "./pipeline-agent-references";

describe("pipeline agent node references", () => {
  it("keeps a canvas selection pending until the composer receives the next interaction", () => {
    const pending = observePipelineAgentSelection(EMPTY_PIPELINE_AGENT_REFERENCES, ["one", "two"]);
    expect(pending.pendingNodeIds).toEqual(["one", "two"]);
    expect(commitPipelineAgentSelection(pending)).toMatchObject({
      pendingNodeIds: [],
      referencedNodeIds: ["one", "two"],
    });
    expect(dismissPipelineAgentSelection(pending)).toMatchObject({
      pendingNodeIds: [],
      referencedNodeIds: [],
    });
  });

  it("deduplicates committed nodes and does not revive a removed reference without a new selection", () => {
    const committed = commitPipelineAgentSelection(observePipelineAgentSelection(
      EMPTY_PIPELINE_AGENT_REFERENCES,
      ["one"],
    ));
    const removed = removePipelineAgentReference(committed, "one");
    expect(observePipelineAgentSelection(removed, ["one"])).toBe(removed);
    expect(commitPipelineAgentSelection(observePipelineAgentSelection(committed, ["one", "two"])).referencedNodeIds)
      .toEqual(["one", "two"]);
  });

  it("clears a sent turn without treating the unchanged canvas selection as new", () => {
    const committed = commitPipelineAgentSelection(observePipelineAgentSelection(
      EMPTY_PIPELINE_AGENT_REFERENCES,
      ["one"],
    ));
    expect(clearPipelineAgentReferences(committed)).toEqual({
      pendingNodeIds: [],
      referencedNodeIds: [],
      selectionNodeIds: ["one"],
    });
  });
});
