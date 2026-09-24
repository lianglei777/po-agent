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

  it("preserves the complete screenplay body when script metadata changes", () => {
    const screenplay = "# 第一集\n\n场景一：雨夜街口\n\n阿宁：你还是来了。";
    const data = nodeDataWithCreativeSpec({
      type: "text", name: "第一集", action: "text_generate", content: [screenplay],
    }, {
      schemaVersion: 1, kind: "script", level: "episode", key: "ep01", title: "第一集（修订）",
      objective: "对白更克制", estimatedDurationSeconds: 60, characters: ["阿宁"], sourceNodeIds: [],
    });

    expect(data.name).toBe("第一集（修订）");
    expect(data.content).toEqual([screenplay]);
    expect(data.textDocument).toBeUndefined();
    expect(data.creativeSpec).toMatchObject({ kind: "script", estimatedDurationSeconds: 60 });
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
