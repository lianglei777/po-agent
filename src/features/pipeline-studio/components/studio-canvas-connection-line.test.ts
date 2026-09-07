import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import {
  canvasConnectionPointerToFlowPosition,
  studioCanvasConnectionLinePath,
} from "./studio-canvas-connection-line";

describe("studioCanvasConnectionLinePath", () => {
  it("keeps the preview endpoint at the pointer while a target drop zone is active", () => {
    expect(studioCanvasConnectionLinePath({
      fromX: 120,
      fromY: 80,
      fromPosition: Position.Right,
      pointer: { x: 360, y: 215 },
    })).toMatch(/360,215$/);
  });

  it("converts the screen-relative pointer into canvas coordinates before drawing", () => {
    expect(canvasConnectionPointerToFlowPosition(
      { x: 420, y: 260 },
      { x: 120, y: 60, zoom: 2 },
    )).toEqual({ x: 150, y: 100 });
  });
});
