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
  composerActive: boolean;
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
    showComposer: input.composerActive && !input.dragging,
  };
}

export function audioNodePresentation(input: {
  selected: boolean;
  dragging: boolean;
  mediaDeferred: boolean;
  hasAudio: boolean;
}) {
  return {
    showToolbar: input.selected && !input.dragging && !input.mediaDeferred && input.hasAudio,
    showUploadAction: input.selected && !input.dragging && !input.hasAudio,
    analyzeWaveform: input.selected && !input.mediaDeferred && input.hasAudio,
  };
}
