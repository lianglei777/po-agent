import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { protectedRoute, readJson } from "@/app/api/_route";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return protectedRoute<{ runId: string }>(async () => {
    const { id } = await context.params;
    const body = (await readJson(request)) as { projectId: string };
    if (!body.projectId) throw new AppError("VALIDATION_ERROR", "projectId is required", 400);
    const runId = await container.storyboardService.generateFrameImage(body.projectId, id);
    return { runId };
  });
}
