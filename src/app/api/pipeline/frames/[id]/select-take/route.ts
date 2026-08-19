import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<{ success: true }>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as { runId: string };
    if (!body.runId) {
      throw new AppError("VALIDATION_ERROR", "runId is required", 400);
    }
    await container.videoGenerationService.selectFinalTake(id, body.runId);
    return { success: true };
  });
}
