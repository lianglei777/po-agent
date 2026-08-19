"use client";

import { useCallback } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Node,
  type Edge,
  type NodeMouseHandler,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { pipelineNodeTypes } from "./pipeline-node-types";
import type { Connection } from "@xyflow/react";

export type PipelineCanvasProps = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onNodeDragStop: (_: unknown, node: Node) => void;
  onNodeDragStart?: () => void;
  onNodeContextMenu?: (event: React.MouseEvent, node: Node) => void;
  onInit?: (instance: unknown) => void;
  onConnect?: (connection: Connection) => void;
  onNodeDelete?: (nodeId: string) => void;
};

// 无限画布主组件。使用 React Flow (@xyflow/react)。
// 节点和边的数据由父组件 (ProjectDetailView) 管理。
export function PipelineCanvas({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onNodesChange,
  onEdgesChange,
  onNodeDragStop,
  onNodeDragStart,
  onNodeContextMenu,
  onInit,
  onConnect,
  onNodeDelete,
}: PipelineCanvasProps) {
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div className="h-full w-full" data-testid="pipeline-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={pipelineNodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodesDelete={(nodes) => nodes.forEach((n) => onNodeDelete?.(n.id))}
        fitView
        proOptions={{ hideAttribution: true }}
        colorMode="system"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--pl-border-strong)"
        />
        <Controls
          className="!border !border-[var(--pl-border)] !bg-[var(--pl-surface)] !shadow-[var(--pl-shadow-card)]"
          showInteractive={false}
        />
        <MiniMap
          className="!border !border-[var(--pl-border)] !bg-[var(--pl-surface)]"
          maskColor="var(--pl-surface-subtle)"
          style={{ borderRadius: "8px" }}
        />
      </ReactFlow>
    </div>
  );
}
