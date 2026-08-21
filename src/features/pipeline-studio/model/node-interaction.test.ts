import { describe, expect, it } from "vitest";
import { canvasNodeDragHandle, imageNodePresentation } from "./node-interaction";

describe("canvas node interaction", () => {
  it("allows text and image nodes to be dragged from their non-control body", () => {
    expect(canvasNodeDragHandle("text")).toBeUndefined();
    expect(canvasNodeDragHandle("image")).toBeUndefined();
    expect(canvasNodeDragHandle("video")).toBe(".pipeline-node-drag-handle");
  });

  it("shows the image toolbar only for a selected still image", () => {
    expect(imageNodePresentation({ selected: true, dragging: false, hasImage: true })).toEqual({
      showToolbar: true,
      showComposer: false,
      showUploadAction: false,
    });
    expect(imageNodePresentation({ selected: true, dragging: true, hasImage: true }).showToolbar).toBe(false);
    expect(imageNodePresentation({ selected: false, dragging: false, hasImage: true }).showToolbar).toBe(false);
  });

  it("shows the composer only for a selected empty image node that is not moving", () => {
    expect(imageNodePresentation({ selected: true, dragging: false, hasImage: false })).toEqual({
      showToolbar: false,
      showComposer: true,
      showUploadAction: true,
    });
    expect(imageNodePresentation({ selected: true, dragging: true, hasImage: false }).showComposer).toBe(false);
  });
});
