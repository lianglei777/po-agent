import { applyNodeChanges } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import type { CanvasNode } from "@/contracts/pipeline";
import { reconcileStudioFlowNodes } from "./studio-flow-nodes";

const canvasNode: CanvasNode = {
  id: "node-1",
  projectId: "project-1",
  type: "text",
  entityId: "entity-1",
  positionX: 10,
  positionY: 20,
  width: 320,
  height: 220,
  data: { type: "text", name: "Text", action: "text_generate", content: [""] },
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
};

describe("studio flow node reconciliation", () => {
  it("keeps audio nodes draggable from every non-control surface like other standard nodes", () => {
    const audioNode: CanvasNode = {
      ...canvasNode,
      id: "audio-node-1",
      type: "audio",
      entityId: "audio-entity-1",
      data: { type: "audio", name: "Audio", action: "audio_reference", content: [] },
    };

    const [flowNode] = reconcileStudioFlowNodes([], [audioNode], {
      selectedNodeIds: [audioNode.id],
      editingNodeId: null,
      interactionMode: "select",
    });

    expect(flowNode).toMatchObject({
      id: audioNode.id,
      draggable: true,
      selected: true,
    });
    expect(flowNode.dragHandle).toBeUndefined();
  });

  it("preserves React Flow measurements when canvas state updates during a drag", () => {
    const initial = reconcileStudioFlowNodes([], [canvasNode], {
      selectedNodeIds: [],
      editingNodeId: null,
      interactionMode: "select",
    });
    const initialized = applyNodeChanges([{
      id: canvasNode.id,
      type: "dimensions",
      dimensions: { width: 320, height: 220 },
    }], initial);
    const dragging = applyNodeChanges([{
      id: canvasNode.id,
      type: "position",
      position: { x: 40, y: 50 },
      dragging: true,
    }], initialized);

    const reconciled = reconcileStudioFlowNodes(dragging, [{
      ...canvasNode,
      positionX: 40,
      positionY: 50,
    }], {
      selectedNodeIds: [canvasNode.id],
      editingNodeId: null,
      interactionMode: "select",
    });

    expect(reconciled[0]).toMatchObject({
      position: { x: 40, y: 50 },
      measured: { width: 320, height: 220 },
      dragging: true,
      selected: true,
    });
  });
});
