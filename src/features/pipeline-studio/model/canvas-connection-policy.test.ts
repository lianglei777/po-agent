import { describe, expect, it } from "vitest";
import type { CanvasEdge, CanvasNode } from "@/contracts/pipeline";
import {
  canvasConnectionProblem,
  canvasNodeHasContent,
  connectedCanvasEdgeIds,
  connectedCanvasReferences,
} from "./canvas-connection-policy";

describe("canvas connection policy", () => {
  it("only accepts a new edge when the target has no content and no cycle is introduced", () => {
    const empty = node("empty", "image");
    const filled = node("filled", "image", { url: ["/image.png"] });
    const text = node("text", "text", { content: ["source"] });
    expect(canvasConnectionProblem([filled, empty], [], filled.id, empty.id)).toBeNull();
    expect(canvasConnectionProblem([empty, filled], [], empty.id, filled.id)).toBe("target-has-content");
    expect(canvasConnectionProblem([filled, empty, text], [edge("a", filled.id, empty.id)], empty.id, filled.id)).toBe("target-has-content");
    expect(canvasConnectionProblem([filled, empty, text], [edge("a", empty.id, text.id)], text.id, empty.id)).toBe("cycle");
  });

  it("treats text and media payloads as node content", () => {
    expect(canvasNodeHasContent(node("empty", "text", { content: ["  "] }))).toBe(false);
    expect(canvasNodeHasContent(node("text", "text", { content: ["hello"] }))).toBe(true);
    expect(canvasNodeHasContent(node("image", "image", { artifactIds: ["artifact"] }))).toBe(true);
  });

  it("creates stable direct-upstream references in edge order, including empty sources", () => {
    const image = node("image", "image");
    const text = node("text", "text");
    const target = node("target", "video");
    expect(connectedCanvasReferences(target.id, [image, text, target], [
      edge("image-edge", image.id, target.id),
      edge("text-edge", text.id, target.id),
    ])).toEqual([
      expect.objectContaining({ referenceId: "edge:image-edge", sourceId: image.id, mediaType: "image" }),
      expect.objectContaining({ referenceId: "edge:text-edge", sourceId: text.id, mediaType: "text" }),
    ]);
  });

  it("finds every edge incident to the selected nodes", () => {
    const edges = [
      edge("incoming", "outside-a", "selected"),
      edge("outgoing", "selected", "outside-b"),
      edge("unrelated", "outside-a", "outside-b"),
    ];
    expect([...connectedCanvasEdgeIds(["selected"], edges)]).toEqual(["incoming", "outgoing"]);
    expect([...connectedCanvasEdgeIds([], edges)]).toEqual([]);
  });
});

function node(id: string, type: "text" | "image" | "video", data: Record<string, unknown> = {}): CanvasNode {
  return {
    id,
    projectId: "project",
    type,
    entityId: id,
    positionX: 0,
    positionY: 0,
    width: 100,
    height: 100,
    data: { type, name: id, action: `${type}_generate`, ...data },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function edge(id: string, sourceNodeId: string, targetNodeId: string): CanvasEdge {
  return { id, projectId: "project", sourceNodeId, targetNodeId, edgeType: "references" };
}
