import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as { projectId: string };
    if (!body.projectId) {
      throw new AppError("VALIDATION_ERROR", "projectId is required", 400);
    }
    const variant = await container.assetGenerationService.generateAssetImage(body.projectId, id);
    return { variantId: variant.id, runId: variant.runId };
  });
}
