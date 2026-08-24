"use client";

import { useEffect, useRef } from "react";
import { NodeResizeControl } from "@xyflow/react";
import { useCanvasStore } from "../../state/canvas-store";

export function CanvasNodeResizeControl({
  nodeId,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  keepAspectRatio = false,
}: {
  nodeId: string;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  keepAspectRatio?: boolean;
}) {
  const updateNodeSizeLive = useCanvasStore((state) => state.updateNodeSizeLive);
  const commitNodeSize = useCanvasStore((state) => state.commitNodeSize);
  const originRef = useRef<{ width: number; height: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const latestRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const preview = (size: { width: number; height: number }) => {
    latestRef.current = size;
    if (frameRef.current !== null) return;
    // React Flow 高频 resize 每帧只同步一次，结束后再统一写历史与持久化队列。
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const latest = latestRef.current;
      if (latest) updateNodeSizeLive(nodeId, latest);
    });
  };

  return (
    <NodeResizeControl
      position="bottom-right"
      minWidth={minWidth}
      minHeight={minHeight}
      maxWidth={maxWidth}
      maxHeight={maxHeight}
      keepAspectRatio={keepAspectRatio}
      className="nodrag group/resize !-bottom-1.5 !-right-1.5 !flex !size-8 !cursor-nwse-resize !items-center !justify-center !border-0 !bg-transparent"
      onResizeStart={(_, params) => {
        originRef.current = { width: params.width, height: params.height };
      }}
      onResize={(_, params) => preview({ width: params.width, height: params.height })}
      onResizeEnd={(_, params) => {
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
        const finalSize = { width: params.width, height: params.height };
        updateNodeSizeLive(nodeId, finalSize);
        const previous = originRef.current;
        if (previous) commitNodeSize(nodeId, previous);
        originRef.current = null;
      }}
    >
      <span
        aria-hidden="true"
        className="size-4 rounded-br-[10px] border-b-2 border-r-2 border-[var(--pl-text-secondary)] opacity-0 transition-[opacity,border-color] duration-150 group-hover/resize:opacity-100 group-hover/resize:border-[var(--pl-text)]"
      />
    </NodeResizeControl>
  );
}
