import type { CanvasNode } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<{ node: CanvasNode }>(async () => {
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION_ERROR", "file is required", 400);
    const positionX = Number(form.get("positionX") ?? 0);
    const positionY = Number(form.get("positionY") ?? 0);
    const node = await container.canvasStudioService.upload({
      projectId: id,
      name: file.name,
      contentType: file.type,
      data: new Uint8Array(await file.arrayBuffer()),
      positionX: Number.isFinite(positionX) ? positionX : 0,
      positionY: Number.isFinite(positionY) ? positionY : 0,
    });
    return { node };
  });
}
