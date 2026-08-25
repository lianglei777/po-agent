"use client";

import { useViewport } from "@xyflow/react";
import type { CSSProperties, ReactNode } from "react";

export function InlineCanvasNodeComposer({ children, widthClass }: { children: ReactNode; widthClass: string }) {
  const { zoom } = useViewport();
  const safeZoom = Math.max(zoom, 0.05);
  const style: CSSProperties = {
    top: `calc(100% + ${14 / safeZoom}px)`,
    transform: `translateX(-50%) scale(${1 / safeZoom})`,
    transformOrigin: "top center",
  };

  return (
    <div
      className={`nodrag nowheel absolute left-1/2 z-30 ${widthClass}`}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}
