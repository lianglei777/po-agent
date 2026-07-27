"use client";

import { useEffect, useRef, useState } from "react";
import { mergeClasses } from "@/lib/utils";

const KEYBOARD_STEP = 10;

type ResizeHandleProps = {
  ariaLabel: string;
  /** 拖拽轴向：x 为左右（默认），y 为上下。 */
  axis?: "x" | "y";
  className?: string;
  direction: 1 | -1;
  max: number;
  min: number;
  onResize: (value: number) => void;
  onResizeEnd?: () => void;
  onResizeStart?: () => void;
  value: number;
};

export function ResizeHandle({
  ariaLabel,
  axis = "x",
  className,
  direction,
  max,
  min,
  onResize,
  onResizeEnd,
  onResizeStart,
  value,
}: ResizeHandleProps) {
  const isVertical = axis === "y";
  const dragRef = useRef<{
    pointerId: number;
    startValue: number;
    startX: number;
    startY: number;
  } | null>(null);
  const previousBodyStyles = useRef<{
    cursor: string;
    userSelect: string;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  function clamp(nextValue: number) {
    return Math.min(max, Math.max(min, nextValue));
  }

  function startBodyResize() {
    previousBodyStyles.current = {
      cursor: document.body.style.cursor,
      userSelect: document.body.style.userSelect,
    };
    document.body.style.cursor = isVertical ? "row-resize" : "col-resize";
    document.body.style.userSelect = "none";
  }

  function stopBodyResize() {
    if (!previousBodyStyles.current) return;
    document.body.style.cursor = previousBodyStyles.current.cursor;
    document.body.style.userSelect = previousBodyStyles.current.userSelect;
    previousBodyStyles.current = null;
  }

  function finishDrag() {
    const wasDragging = dragRef.current !== null;
    dragRef.current = null;
    setDragging(false);
    stopBodyResize();
    if (wasDragging) onResizeEnd?.();
  }

  useEffect(() => stopBodyResize, []);

  return (
    <div
      aria-label={ariaLabel}
      aria-orientation={isVertical ? "horizontal" : "vertical"}
      aria-valuemax={Math.round(max)}
      aria-valuemin={Math.round(min)}
      aria-valuenow={Math.round(value)}
      className={mergeClasses(
        isVertical
          ? "group relative z-20 h-px w-full flex-none cursor-row-resize bg-line-subtle outline-none ring-offset-background before:absolute before:inset-x-0 before:-top-1 before:h-[9px] hover:bg-line-emphasis focus-visible:bg-line-emphasis focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 data-[dragging=true]:bg-line-emphasis"
          : "group relative z-20 w-px flex-none cursor-col-resize bg-line-subtle outline-none ring-offset-background before:absolute before:inset-y-0 before:-left-1 before:w-[9px] hover:bg-line-emphasis focus-visible:bg-line-emphasis focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 data-[dragging=true]:bg-line-emphasis",
        className,
      )}
      data-dragging={dragging || undefined}
      onKeyDown={(event) => {
        let nextValue: number | null = null;

        if (isVertical) {
          if (event.key === "ArrowUp") {
            nextValue = value - KEYBOARD_STEP * direction;
          } else if (event.key === "ArrowDown") {
            nextValue = value + KEYBOARD_STEP * direction;
          } else if (event.key === "Home") {
            nextValue = min;
          } else if (event.key === "End") {
            nextValue = max;
          }
        } else {
          if (event.key === "ArrowLeft") {
            nextValue = value - KEYBOARD_STEP * direction;
          } else if (event.key === "ArrowRight") {
            nextValue = value + KEYBOARD_STEP * direction;
          } else if (event.key === "Home") {
            nextValue = min;
          } else if (event.key === "End") {
            nextValue = max;
          }
        }

        if (nextValue === null) return;
        event.preventDefault();
        onResize(clamp(nextValue));
      }}
      onLostPointerCapture={finishDrag}
      onPointerCancel={finishDrag}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        dragRef.current = {
          pointerId: event.pointerId,
          startValue: value,
          startX: event.clientX,
          startY: event.clientY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        startBodyResize();
        onResizeStart?.();
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const delta = isVertical
          ? event.clientY - drag.startY
          : event.clientX - drag.startX;
        onResize(
          clamp(
            drag.startValue + delta * direction,
          ),
        );
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        finishDrag();
      }}
      role="separator"
      tabIndex={0}
    />
  );
}
