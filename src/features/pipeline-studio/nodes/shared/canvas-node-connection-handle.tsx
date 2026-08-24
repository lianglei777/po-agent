import { Handle, type HandleProps, Position } from "@xyflow/react";
import { Plus } from "@/components/icons";

export function CanvasNodeConnectionHandle({
  type,
  position,
  label,
  hideWhenEditing = false,
}: {
  type: "source" | "target";
  position: Position;
  label: string;
  hideWhenEditing?: boolean;
}) {
  const offset: HandleProps["style"] = position === Position.Left ? { left: -40 } : { right: -40 };
  return (
    <Handle
      type={type}
      position={position}
      aria-label={label}
      title={label}
      style={offset}
      className={
        "nodrag !flex !size-8 !items-center !justify-center !border !border-[var(--pl-border-strong)] !bg-[var(--pl-surface-elevated)] !text-[var(--pl-text-secondary)] !opacity-0 !shadow-[var(--pl-shadow-card)] transition-[opacity,border-color,color] duration-150 hover:!border-[var(--pl-accent)] hover:!text-[var(--pl-accent)] group-hover:!opacity-100 group-data-[selected=true]:!opacity-100 group-data-[dragging=true]:!opacity-0 " +
        (hideWhenEditing ? "group-data-[editing=true]:!opacity-0" : "")
      }
    >
      <Plus className="pointer-events-none size-3.5" />
    </Handle>
  );
}
