import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as { mode: "i2v" | "r2v"; projectId: string };
    if (!body.mode || !body.projectId) {
      throw new AppError("VALIDATION_ERROR", "mode and projectId are required", 400);
    }
    const runId = body.mode === "i2v"
      ? await container.videoGenerationService.generateI2V(body.projectId, id)
      : await container.videoGenerationService.generateR2V(body.projectId, id);
    return { runId };
  });
}
