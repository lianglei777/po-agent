import { describe, expect, it } from "vitest";
import type { CanvasNode } from "@/contracts/pipeline";
import { downstreamImpact, nodeDataWithCreativeSpec } from "./creative-spec";

describe("creative spec editing", () => {
  it("updates visible text together with a structured asset spec", () => {
    const data = nodeDataWithCreativeSpec({ type: "text", name: "old", action: "text_generate" }, {
      schemaVersion: 1, kind: "asset", assetType: "character", identityKey: "lin-ye", canonicalName: "林野",
      aliases: ["小林"], visualDescription: "黑色短发，深蓝夹克", continuityFacts: ["左手佩戴旧手表"], sourceNodeIds: [],
    });
    expect(data.name).toBe("林野");
    expect(data.textDocument?.plainText).toContain("左手佩戴旧手表");
    expect(data.creativeSpec?.kind).toBe("asset");
  });

  it("collects every downstream node across semantic and reference edges once", () => {
    const nodes = [node("a"), node("b"), node("c")];
    expect(downstreamImpact("a", nodes, [
      { sourceNodeId: "a", targetNodeId: "b" },
      { sourceNodeId: "b", targetNodeId: "c" },
      { sourceNodeId: "a", targetNodeId: "c" },
    ]).map((candidate) => candidate.id)).toEqual(["b", "c"]);
  });
});

function node(id: string): CanvasNode {
  return { id, projectId: "project", type: "text", entityId: id, positionX: 0, positionY: 0, width: 100, height: 100,
    data: { type: "text", name: id, action: "text_generate" }, createdAt: "", updatedAt: "" };
}
