import { describe, expect, it } from "vitest";
import type { CanvasEdge, CanvasNode, CanvasShotSpec } from "@/contracts/pipeline";
import { buildShotListRows, updateShotDurations } from "./shot-list";

describe("shot list model", () => {
  it("sorts shots by episode and order and reports downstream state", () => {
    const ep2 = shotNode("shot-2", "ep02", 0, 4);
    const ep1b = shotNode("shot-1b", "ep01", 1, 3);
    const ep1a = shotNode("shot-1a", "ep01", 0, 2);
    const video = mediaNode("video-1", { routeId: "video-route" });
    const staleVideo = mediaNode("video-2", { routeId: "video-route" }, true);
    const edges = [edge(ep1a.id, video.id), edge(ep1b.id, staleVideo.id)];

    expect(buildShotListRows([ep2, ep1b, video, ep1a, staleVideo], edges).map((row) => [row.node.id, row.status])).toEqual([
      ["shot-1a", "configured"],
      ["shot-1b", "stale"],
      ["shot-2", "missing"],
    ]);
  });

  it("updates selected durations while preserving the remaining shot spec", () => {
    const first = shotNode("shot-1", "ep01", 0, 2);
    const second = shotNode("shot-2", "ep01", 1, 3);
    const rows = buildShotListRows([first, second], []);

    const updates = updateShotDurations(rows, [second.id], 5.5);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      nodeId: second.id,
      data: { creativeSpec: { kind: "shot", durationSeconds: 5.5, purpose: "镜头 shot-2" } },
    });
    expect(updates[0].data.content?.[0]).toContain("时长：5.5 秒");
  });
});

function shotNode(id: string, episodeKey: string, order: number, durationSeconds: number): CanvasNode {
  const spec: CanvasShotSpec = {
    schemaVersion: 1, kind: "shot", shotKey: id, episodeKey, order, durationSeconds,
    purpose: `镜头 ${id}`, visual: "画面", subjects: [], shotSize: "中景", cameraMovement: "固定",
    blocking: "原地", lighting: "自然光", audio: {}, sourceNodeIds: [],
  };
  return {
    id, projectId: "project-1", type: "text", entityId: `${id}-entity`, positionX: 0, positionY: 0,
    width: 320, height: 220,
    data: { type: "text", name: id, action: "text_generate", params: { prompt: "" }, taskInfo: { status: "idle" }, creativeSpec: spec },
    createdAt: "now", updatedAt: "now",
  };
}

function mediaNode(id: string, params: { routeId?: string }, stale = false): CanvasNode {
  return {
    id, projectId: "project-1", type: "video", entityId: `${id}-entity`, positionX: 0, positionY: 0,
    width: 320, height: 220,
    data: { type: "video", name: id, action: "video_generate", params: { prompt: "", ...params }, taskInfo: { status: "idle" },
      ...(stale ? { generationProvenance: { runId: "run-1", inputFingerprint: "old", stale: true } } : {}) },
    createdAt: "now", updatedAt: "now",
  };
}

function edge(sourceNodeId: string, targetNodeId: string): CanvasEdge {
  return { id: `${sourceNodeId}-${targetNodeId}`, projectId: "project-1", sourceNodeId, targetNodeId,
    edgeType: "derives_from", role: "reference", order: 0, createdAt: "now", updatedAt: "now" };
}
