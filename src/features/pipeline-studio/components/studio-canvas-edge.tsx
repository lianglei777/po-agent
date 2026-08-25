"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BaseEdge, EdgeToolbar, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { Tooltip } from "antd";
import { Scissors } from "@/components/icons";

export type StudioCanvasEdgeData = {
  onDelete: (edgeId: string) => void;
  onSelect: (edgeId: string) => void;
  connectionLabel: string;
  removeLabel: string;
  highlightFlow: boolean;
};

export type StudioCanvasEdge = Edge<StudioCanvasEdgeData, "studio">;

const HOVER_LEAVE_DELAY_MS = 160;

export function StudioCanvasEdgeComponent({
  id,
  data,
  selected,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
}: EdgeProps<StudioCanvasEdge>) {
  const [hovered, setHovered] = useState(false);
  const [edgeFocused, setEdgeFocused] = useState(false);
  const [toolbarFocused, setToolbarFocused] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [edgePath, toolbarX, toolbarY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const interactive = hovered || edgeFocused || toolbarFocused || selected;
  const flowActive = interactive || Boolean(data?.highlightFlow);

  const cancelScheduledLeave = useCallback(() => {
    if (leaveTimerRef.current === null) return;
    clearTimeout(leaveTimerRef.current);
    leaveTimerRef.current = null;
  }, []);

  const showToolbar = useCallback(() => {
    cancelScheduledLeave();
    setHovered(true);
  }, [cancelScheduledLeave]);

  const scheduleToolbarHide = useCallback(() => {
    cancelScheduledLeave();
    // 给指针留出从 SVG 连线移动到 HTML 工具栏的时间，避免剪刀按钮闪烁消失。
    leaveTimerRef.current = setTimeout(() => {
      setHovered(false);
      leaveTimerRef.current = null;
    }, HOVER_LEAVE_DELAY_MS);
  }, [cancelScheduledLeave]);

  useEffect(() => () => cancelScheduledLeave(), [cancelScheduledLeave]);

  return (
    <>
      <g
        role="group"
        tabIndex={0}
        aria-label={data?.connectionLabel}
        className={`pipeline-studio-edge${flowActive ? " is-active" : ""}`}
        onPointerEnter={showToolbar}
        onPointerLeave={scheduleToolbarHide}
        onClick={(event) => {
          event.stopPropagation();
          data?.onSelect(id);
        }}
        onFocus={() => setEdgeFocused(true)}
        onBlur={() => setEdgeFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            data?.onSelect(id);
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            event.stopPropagation();
            data?.onDelete(id);
          }
        }}
      >
        <BaseEdge
          id={id}
          path={edgePath}
          interactionWidth={28}
          className="pipeline-studio-edge__base"
        />
        <path
          aria-hidden="true"
          d={edgePath}
          pathLength={100}
          className="pipeline-studio-edge__flow"
        />
        <circle
          aria-hidden="true"
          cx={sourceX}
          cy={sourceY}
          r={3}
          className="pipeline-studio-edge__source"
        />
        <circle
          aria-hidden="true"
          cx={targetX}
          cy={targetY}
          r={3}
          className="pipeline-studio-edge__target"
        />
      </g>

      <EdgeToolbar
        edgeId={id}
        x={toolbarX}
        y={toolbarY}
        isVisible={interactive}
        className="nodrag nopan pipeline-studio-edge-toolbar"
        onPointerEnter={showToolbar}
        onPointerLeave={scheduleToolbarHide}
        onFocus={() => setToolbarFocused(true)}
        onBlur={() => setToolbarFocused(false)}
      >
        <Tooltip title={data?.removeLabel} placement="top">
          <button
            type="button"
            aria-label={data?.removeLabel}
            className="pipeline-studio-edge-toolbar__button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              data?.onDelete(id);
            }}
          >
            <Scissors aria-hidden="true" />
          </button>
        </Tooltip>
      </EdgeToolbar>
    </>
  );
}
