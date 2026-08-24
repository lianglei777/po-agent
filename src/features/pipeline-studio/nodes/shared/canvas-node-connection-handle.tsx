import { Handle, type HandleProps, Position } from "@xyflow/react";
import { Plus } from "@/components/icons";

type HorizontalHandlePosition = Position.Left | Position.Right;

export function getCanvasNodeBoundaryHandleStyle(position: HorizontalHandlePosition): HandleProps["style"] {
  // Handle 本体贴住节点边界供 React Flow 计算锚点，只偏移内部的加号按钮。
  return position === Position.Left
    ? { left: 0, transform: "translate(0, -50%)" }
    : { right: 0, transform: "translate(0, -50%)" };
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
  const visualOffset = position === Position.Left ? "-translate-x-[22px]" : "translate-x-[22px]";

  return (
    <Handle
      type={type}
      position={position}
      aria-label={label}
      title={label}
      style={getCanvasNodeBoundaryHandleStyle(position)}
      className={
        "nodrag group/connection-handle !flex !size-2 !items-center !justify-center !overflow-visible !border-0 !bg-transparent !opacity-0 transition-opacity duration-150 group-hover:!opacity-100 group-data-[selected=true]:!opacity-100 group-data-[dragging=true]:!opacity-0 " +
        (hideWhenEditing ? "group-data-[editing=true]:!opacity-0" : "")
      }
    >
      <span
        className={
          "flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] text-[var(--pl-text-secondary)] shadow-[var(--pl-shadow-card)] transition-[border-color,color] duration-150 group-hover/connection-handle:border-[var(--pl-accent)] group-hover/connection-handle:text-[var(--pl-accent)] " +
          visualOffset
        }
      >
        <Plus className="pointer-events-none size-3.5" />
      </span>
    </Handle>
  );
}
