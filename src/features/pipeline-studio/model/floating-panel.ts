export interface CursorRect {
  left: number;
  top: number;
  bottom: number;
}

export interface FloatingPanelPosition {
  left: number;
  top: number;
  placement: "top" | "bottom";
}

export function resourcePickerPosition(input: {
  cursor: CursorRect;
  viewportWidth: number;
  viewportHeight: number;
  panelWidth: number;
  panelHeight: number;
  margin?: number;
  gap?: number;
}): FloatingPanelPosition {
  const margin = input.margin ?? 10;
  const gap = input.gap ?? 8;
  const maxLeft = Math.max(margin, input.viewportWidth - input.panelWidth - margin);
  const left = clamp(input.cursor.left, margin, maxLeft);
  const hasSpaceAbove = input.cursor.top - gap - input.panelHeight >= margin;

  if (hasSpaceAbove) {
    return {
      left,
      top: input.cursor.top - gap - input.panelHeight,
      placement: "top",
    };
  }

  return {
    left,
    top: clamp(
      input.cursor.bottom + gap,
      margin,
      Math.max(margin, input.viewportHeight - input.panelHeight - margin),
    ),
    placement: "bottom",
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
