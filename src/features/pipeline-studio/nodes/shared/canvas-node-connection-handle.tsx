import { Handle, type HandleProps, Position } from "@xyflow/react";
import { Plus } from "@/components/icons";

type HorizontalHandlePosition = Position.Left | Position.Right;

export function getCanvasNodeBoundaryHandleStyle(position: HorizontalHandlePosition): HandleProps["style"] {
  // Handle 本体贴住节点边界供 React Flow 计算锚点，只偏移内部的加号按钮。
  return position === Position.Left
    ? { left: 0, transform: "translate(0, -50%)" }
    : { right: 0, transform: "translate(0, -50%)" };
}

export function getCanvasNodeTargetDropZoneStyle(): HandleProps["style"] {
  // 输入 Handle 覆盖整个节点以扩大落点，但 Position.Left 仍让边固定锚定到左侧中点。
  return { top: 0, left: 0, width: "100%", height: "100%", transform: "none" };
}

export function CanvasNodeConnectionHandle({
  type,
  position,
  label,
  hideWhenEditing = false,
}: {
  type: "source" | "target";
  position: HorizontalHandlePosition;
  label: string;
  hideWhenEditing?: boolean;
}) {
  const isTarget = type === "target";
  const visualPosition = position === Position.Left
    ? "left-[-14px]"
    : "right-[-14px]";

  if (isTarget) {
    return (
      <Handle
        type="target"
        position={position}
        aria-label={label}
        title={label}
        isConnectableStart={false}
        style={getCanvasNodeTargetDropZoneStyle()}
        className={
          "canvas-node-connection-drop-zone nodrag !z-20 !block !overflow-visible !border-0 !bg-transparent !opacity-100 " +
          (hideWhenEditing ? "group-data-[editing=true]:!pointer-events-none" : "")
        }
      >
        <ConnectionTargetFeedback />
        <span
          className={
            `canvas-node-connection-handle__visual absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] text-[var(--pl-text-secondary)] opacity-0 shadow-[var(--pl-shadow-card)] transition-[border-color,color,opacity] duration-150 group-hover:opacity-100 group-data-[selected=true]:opacity-100 ${visualPosition} ` +
            (hideWhenEditing ? "group-data-[editing=true]:!opacity-0" : "")
          }
        >
          <Plus className="pointer-events-none size-3.5" />
        </span>
      </Handle>
    );
  }

  return (
    <Handle
      type="source"
      position={position}
      aria-label={label}
      title={label}
      style={getCanvasNodeBoundaryHandleStyle(position)}
      className={
        "nodrag group/connection-handle !flex !size-8 !items-center !justify-center !overflow-visible !border-0 !bg-transparent !opacity-100 group-data-[dragging=true]:!pointer-events-none " +
        (hideWhenEditing ? "group-data-[editing=true]:!pointer-events-none group-data-[editing=true]:!opacity-0" : "")
      }
    >
      <span
        className={
          `canvas-node-connection-handle__visual absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] text-[var(--pl-text-secondary)] opacity-0 shadow-[var(--pl-shadow-card)] transition-[border-color,color,opacity] duration-150 group-hover:opacity-100 group-data-[selected=true]:opacity-100 group-data-[dragging=true]:!opacity-0 ${visualPosition} ` +
          (hideWhenEditing ? "group-data-[editing=true]:!opacity-0" : "")
        }
      >
        <Plus className="pointer-events-none size-3.5" />
      </span>
    </Handle>
  );
}

function ConnectionTargetFeedback() {
  return (
    <svg
      className="canvas-node-connection-target-feedback pointer-events-none absolute inset-0 size-full overflow-visible"
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <rect className="canvas-node-connection-target-feedback__frame" x="1.5" y="1.5" width="97" height="97" rx="4" />
    </svg>
  );
}
