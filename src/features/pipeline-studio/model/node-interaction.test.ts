import { describe, expect, it } from "vitest";
import { canvasNodeDragHandle, imageNodePresentation, videoNodeToolbarPresentation } from "./node-interaction";

describe("canvas node interaction", () => {
  it("allows visual nodes to be dragged from their non-control body", () => {
    expect(canvasNodeDragHandle("text")).toBeUndefined();
    expect(canvasNodeDragHandle("image")).toBeUndefined();
    expect(canvasNodeDragHandle("video")).toBeUndefined();
    expect(canvasNodeDragHandle("audio")).toBe(".pipeline-node-drag-handle");
  });

  it("shows the toolbar and composer for a selected still image", () => {
    expect(imageNodePresentation({ selected: true, composerActive: true, dragging: false, hasImage: true })).toEqual({
      showToolbar: true,
      showComposer: true,
      showUploadAction: false,
    });
    expect(imageNodePresentation({ selected: true, composerActive: true, dragging: true, hasImage: true }).showToolbar).toBe(false);
    expect(imageNodePresentation({ selected: false, composerActive: false, dragging: false, hasImage: true }).showToolbar).toBe(false);
    expect(imageNodePresentation({ selected: true, composerActive: true, dragging: true, hasImage: true }).showComposer).toBe(false);
    expect(imageNodePresentation({ selected: true, composerActive: false, dragging: false, hasImage: true }).showComposer).toBe(false);
  });

  it("shows upload controls only for a selected empty image node that is not moving", () => {
    expect(imageNodePresentation({ selected: true, composerActive: true, dragging: false, hasImage: false })).toEqual({
      showToolbar: false,
      showComposer: true,
      showUploadAction: true,
    });
    expect(imageNodePresentation({ selected: true, composerActive: true, dragging: true, hasImage: false }).showComposer).toBe(false);
  });

  it("keeps video history reachable after an empty node generation fails", () => {
    expect(videoNodeToolbarPresentation({
      selected: true,
      dragging: false,
      mediaDeferred: false,
      hasVideo: false,
      hasHistory: true,
    })).toEqual({ showToolbar: true, showGenerateAction: false });
    expect(videoNodeToolbarPresentation({
      selected: true,
      dragging: false,
      mediaDeferred: false,
      hasVideo: false,
      hasHistory: false,
    }).showToolbar).toBe(false);
  });
});
