import { describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import {
  getCanvasNodeBoundaryHandleStyle,
  getCanvasNodeTargetDropZoneStyle,
} from "./canvas-node-connection-handle";

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

  it("uses the whole node as the input drop zone while preserving a left-side edge anchor", () => {
    expect(getCanvasNodeTargetDropZoneStyle()).toEqual({
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      transform: "none",
    });
  });
});
