import type { CanvasMediaType } from "@/contracts/pipeline";

export function canvasNodeDragHandle(type: CanvasMediaType | undefined) {
  return type === "video" || type === "audio" ? ".pipeline-node-drag-handle" : undefined;
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
