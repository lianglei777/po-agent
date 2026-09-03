import { describe, expect, it } from "vitest";
import { audioNodePresentation, imageNodePresentation, videoNodeToolbarPresentation } from "./node-interaction";

describe("canvas node interaction", () => {
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
      composerActive: true,
      dragging: false,
      mediaDeferred: false,
      hasVideo: false,
      hasHistory: true,
    })).toEqual({ showToolbar: true, showGenerateAction: false, showComposer: true });
    expect(videoNodeToolbarPresentation({
      selected: true,
      composerActive: true,
      dragging: false,
      mediaDeferred: false,
      hasVideo: false,
      hasHistory: false,
    }).showToolbar).toBe(false);
  });

  it("keeps the video composer available after a video has content", () => {
    expect(videoNodeToolbarPresentation({
      selected: true,
      composerActive: true,
      dragging: false,
      mediaDeferred: false,
      hasVideo: true,
      hasHistory: true,
    }).showComposer).toBe(true);
  });

  it("shows audio asset actions only for one selected stable node", () => {
    expect(audioNodePresentation({ selected: true, dragging: false, mediaDeferred: false, hasAudio: true }))
      .toEqual({ showToolbar: true, showUploadAction: false, analyzeWaveform: true });
    expect(audioNodePresentation({ selected: true, dragging: false, mediaDeferred: false, hasAudio: false }))
      .toEqual({ showToolbar: false, showUploadAction: true, analyzeWaveform: false });
    expect(audioNodePresentation({ selected: true, dragging: true, mediaDeferred: false, hasAudio: true }).showToolbar)
      .toBe(false);
    expect(audioNodePresentation({ selected: true, dragging: false, mediaDeferred: true, hasAudio: true }).showToolbar)
      .toBe(false);
    expect(audioNodePresentation({ selected: false, dragging: false, mediaDeferred: false, hasAudio: true }).analyzeWaveform)
      .toBe(false);
  });
});
