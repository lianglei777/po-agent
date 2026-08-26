import type { CanvasMediaType } from "@/contracts/pipeline";

export function canvasNodeDragHandle(type: CanvasMediaType | undefined) {
  return type === "audio" ? ".pipeline-node-drag-handle" : undefined;
}

export function imageNodePresentation(input: {
  selected: boolean;
  composerActive: boolean;
  dragging: boolean;
  hasImage: boolean;
}) {
  return {
    showToolbar: input.selected && input.hasImage && !input.dragging,
    showComposer: input.composerActive && !input.dragging,
    showUploadAction: input.selected && !input.hasImage && !input.dragging,
  };
}

export function videoNodeToolbarPresentation(input: {
  selected: boolean;
  dragging: boolean;
  mediaDeferred: boolean;
  hasVideo: boolean;
  hasHistory: boolean;
}) {
  return {
    showToolbar: input.selected
      && !input.dragging
      && !input.mediaDeferred
      && (input.hasVideo || input.hasHistory),
    showGenerateAction: input.hasVideo,
  };
}
