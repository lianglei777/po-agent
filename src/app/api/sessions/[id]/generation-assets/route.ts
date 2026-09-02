import type { GenerationAssetUploadResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return protectedRoute<GenerationAssetUploadResponse>(async () => {
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "file must be a multipart file", 400);
    }
    return container.generationAssetService.upload({
      sessionId: id,
      name: file.name,
      contentType: file.type,
      data: new Uint8Array(await file.arrayBuffer()),
    });
  });
}
