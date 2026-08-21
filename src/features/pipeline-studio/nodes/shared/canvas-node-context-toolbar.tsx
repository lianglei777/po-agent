import { Button, Tooltip } from "antd";
import type { ReactNode } from "react";

export function CanvasNodeContextToolbar({ children, offset = 14 }: { children: ReactNode; offset?: number }) {
  return (
    <div
      className="nodrag nowheel absolute bottom-[calc(100%+14px)] left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-2xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] p-1.5 shadow-[var(--pl-shadow-hover)]"
      style={{ bottom: `calc(100% + ${offset}px)` }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function CanvasNodeToolbarButton({
  label,
  icon,
  onClick,
  danger = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Tooltip title={label}>
      <Button
        type="text"
        danger={danger}
        aria-label={label}
        icon={icon}
        onClick={onClick}
        className="!h-9 !px-3"
      >
        {label}
      </Button>
    </Tooltip>
  );
}
