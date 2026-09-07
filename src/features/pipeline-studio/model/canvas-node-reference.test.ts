import { describe, expect, it } from "vitest";
import type { CanvasNode } from "@/contracts/pipeline";
import {
  canvasNodeReferenceAttrs,
  describeCanvasNodeReference,
} from "./canvas-node-reference";

describe("canvas node references", () => {
  it("keeps an empty video node referenceable in Agent all-nodes mode", () => {
    const node = canvasNode({ id: "video-1", type: "video", entityId: "empty-video", data: null });

    expect(describeCanvasNodeReference(node, "content-ready").available).toBe(false);
    expect(describeCanvasNodeReference(node, "all-nodes")).toMatchObject({
      sourceId: "video-1",
      mediaType: "video",
      label: "empty-video",
      nodeType: "video",
      available: true,
    });
  });

  it.each(["script", "character", "scene", "prop", "storyboard"] as const)(
    "maps the %s business node to a text reference without dropping its node type",
    (type) => {
      const node = canvasNode({ id: `${type}-1`, type, entityId: `${type}-entity`, data: null });
      expect(canvasNodeReferenceAttrs(node, `ref:${type}`)).toMatchObject({
        sourceId: `${type}-1`,
        mediaType: "text",
        label: `${type}-entity`,
      });
    },
  );

  it("recognizes a video URL as ready content in regular AI composers", () => {
    const node = canvasNode({
      id: "video-2",
      type: "video",
      entityId: "video-entity",
      data: { type: "video", name: "参考视频", action: "reference", url: ["https://example.com/video.mp4"] },
    });
    expect(describeCanvasNodeReference(node, "content-ready").available).toBe(true);
  });
});

function canvasNode(overrides: Pick<CanvasNode, "id" | "type" | "entityId" | "data">): CanvasNode {
  return {
    projectId: "project-1",
    positionX: 0,
    positionY: 0,
    width: null,
    height: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
