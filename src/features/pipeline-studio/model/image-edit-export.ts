import type { ImageEditTransform } from "./image-edit-transform";

export function transformedImageSize(
  transform: ImageEditTransform,
  source: { width: number; height: number },
) {
  return transform.quarterTurns % 2 === 1
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

export function editedImageFileName(name: string): string {
  const normalized = name.trim().replace(/\.[^.]+$/, "") || "image";
  return `${normalized}-edited.png`;
}

export async function exportTransformedImage(input: {
  sourceUrl: string;
  sourceName: string;
  transform: ImageEditTransform;
}): Promise<File> {
  const response = await fetch(input.sourceUrl);
  if (!response.ok) throw new Error(`Unable to read source image: ${response.status}`);
  const sourceBlob = await response.blob();
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    const output = transformedImageSize(input.transform, { width: bitmap.width, height: bitmap.height });
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");

    // 先按输出画布翻转，再旋转源图，使导出结果与编辑预览中的屏幕方向保持一致。
    context.translate(output.width / 2, output.height / 2);
    context.scale(input.transform.flipHorizontal ? -1 : 1, input.transform.flipVertical ? -1 : 1);
    context.rotate(input.transform.quarterTurns * Math.PI / 2);
    context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);

    const outputBlob = await canvasToBlob(canvas, "image/png");
    return new File([outputBlob], editedImageFileName(input.sourceName), { type: "image/png" });
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, contentType: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to export transformed image"));
    }, contentType);
  });
}
