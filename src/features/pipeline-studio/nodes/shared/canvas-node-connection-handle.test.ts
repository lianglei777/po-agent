import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { getCanvasNodeBoundaryHandleStyle } from "./canvas-node-connection-handle";

describe("getCanvasNodeBoundaryHandleStyle", () => {
  it("keeps the left edge endpoint on the node boundary", () => {
    expect(getCanvasNodeBoundaryHandleStyle(Position.Left)).toEqual({
      left: 0,
      transform: "translate(0, -50%)",
    });
  });

  it("keeps the right edge endpoint on the node boundary", () => {
    expect(getCanvasNodeBoundaryHandleStyle(Position.Right)).toEqual({
      right: 0,
      transform: "translate(0, -50%)",
    });
  });
});
