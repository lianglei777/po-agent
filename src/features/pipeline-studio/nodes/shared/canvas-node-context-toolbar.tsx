import { Button, Tooltip } from "antd";
import { NodeToolbar, Position } from "@xyflow/react";
import type { ReactNode } from "react";

export function CanvasNodeContextToolbar({ children, offset = 14 }: { children: ReactNode; offset?: number }) {
  return (
    <NodeToolbar
      // Portal 会跟随节点位置并抵消画布 zoom，保证工具栏始终保持屏幕空间尺寸。
      isVisible
      position={Position.Top}
      offset={offset}
      align="center"
      className="nodrag nowheel flex items-center gap-1 whitespace-nowrap rounded-xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] p-1 shadow-[var(--pl-shadow-hover)]"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </NodeToolbar>
  );
}

export function CanvasNodeToolbarButton({
  label,
  icon,
  onClick,
  danger = false,
  disabled = false,
  disabledReason,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const button = (
    <Button
      type="text"
      danger={danger}
      disabled={disabled}
      aria-label={label}
      icon={icon}
      onClick={onClick}
      className="!h-9 !px-3"
    >
      {label}
    </Button>
  );
  return (
    <Tooltip title={disabled && disabledReason ? disabledReason : label}>
      {disabled ? <span className="inline-flex">{button}</span> : button}
    </Tooltip>
  );
}
