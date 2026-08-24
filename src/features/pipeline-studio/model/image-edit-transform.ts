export interface ImageEditTransform {
  quarterTurns: 0 | 1 | 2 | 3;
  flipHorizontal: boolean;
  flipVertical: boolean;
}

export const EMPTY_IMAGE_EDIT_TRANSFORM: ImageEditTransform = {
  quarterTurns: 0,
  flipHorizontal: false,
  flipVertical: false,
};

export function rotateImagePreview(
  transform: ImageEditTransform,
  direction: "left" | "right",
): ImageEditTransform {
  const delta = direction === "right" ? 1 : 3;
  return { ...transform, quarterTurns: ((transform.quarterTurns + delta) % 4) as ImageEditTransform["quarterTurns"] };
}

export function flipImagePreview(
  transform: ImageEditTransform,
  axis: "horizontal" | "vertical",
): ImageEditTransform {
  return axis === "horizontal"
    ? { ...transform, flipHorizontal: !transform.flipHorizontal }
    : { ...transform, flipVertical: !transform.flipVertical };
}

export function imagePreviewTransformCss(
  transform: ImageEditTransform,
  frame: { width: number; height: number },
): string {
  const rotatedSideways = transform.quarterTurns % 2 === 1;
  // 节点容器在 C1-A 期间保持原尺寸，横竖方向互换时缩放预览，避免旋转后的图片被容器裁掉。
  const fitScale = rotatedSideways && frame.width > 0 && frame.height > 0
    ? Math.min(frame.width / frame.height, frame.height / frame.width)
    : 1;
  const scaleX = transform.flipHorizontal ? -1 : 1;
  const scaleY = transform.flipVertical ? -1 : 1;
  return `scaleX(${scaleX}) scaleY(${scaleY}) rotate(${transform.quarterTurns * 90}deg) scale(${fitScale})`;
}

export function imagePreviewChanged(transform: ImageEditTransform): boolean {
  return transform.quarterTurns !== 0 || transform.flipHorizontal || transform.flipVertical;
}
