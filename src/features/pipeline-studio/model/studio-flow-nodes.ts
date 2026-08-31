import type { Node } from "@xyflow/react";
import type { CanvasNode } from "@/contracts/pipeline";

export type StudioFlowNodeData = { canvasNode: CanvasNode } & Record<string, unknown>;
export type StudioFlowNode = Node<StudioFlowNodeData, "studio">;

export function reconcileStudioFlowNodes(
  currentNodes: StudioFlowNode[],
  canvasNodes: CanvasNode[],
  options: {
    selectedNodeIds: string[];
    editingNodeId: string | null;
    interactionMode: "select" | "pan";
  },
): StudioFlowNode[] {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  const selectedNodeIds = new Set(options.selectedNodeIds);

  return canvasNodes.map((canvasNode) => {
    const current = currentById.get(canvasNode.id);

    return {
      // 保留 React Flow 写入的 measured/dragging 等交互字段，避免业务状态刷新让拖拽节点退回未初始化状态。
      ...current,
      id: canvasNode.id,
      type: "studio",
      position: { x: canvasNode.positionX, y: canvasNode.positionY },
      data: { canvasNode },
      selected: selectedNodeIds.has(canvasNode.id),
      draggable: options.interactionMode === "select" && options.editingNodeId !== canvasNode.id,
      style: { width: canvasNode.width ?? 320, height: canvasNode.height ?? 220 },
    };
  });
}
