export const IMAGE_NODE_SIZE_LIMITS = {
  minWidth: 120,
  minHeight: 120,
  maxWidth: 1400,
  maxHeight: 1200,
} as const;

export function calculateImageNodeSize(input: {
  naturalWidth: number;
  naturalHeight: number;
  currentWidth: number;
}): { width: number; height: number } | null {
  if (input.naturalWidth <= 0 || input.naturalHeight <= 0 || input.currentWidth <= 0) return null;

  const ratio = input.naturalWidth / input.naturalHeight;
  let width = Math.max(input.currentWidth, IMAGE_NODE_SIZE_LIMITS.minWidth);
  let height = width / ratio;

  if (height < IMAGE_NODE_SIZE_LIMITS.minHeight) {
    height = IMAGE_NODE_SIZE_LIMITS.minHeight;
    width = height * ratio;
  }

  const maxScale = Math.min(
    1,
    IMAGE_NODE_SIZE_LIMITS.maxWidth / width,
    IMAGE_NODE_SIZE_LIMITS.maxHeight / height,
  );
  width *= maxScale;
  height *= maxScale;

  return { width: roundDimension(width), height: roundDimension(height) };
}

function roundDimension(value: number): number {
  return Math.round(value * 10) / 10;
}
