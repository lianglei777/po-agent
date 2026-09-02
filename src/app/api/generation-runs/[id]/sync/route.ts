import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<{ synced: boolean }>(async () => {
    const { id } = await context.params;
    const view = await container.generationRunService.getRun(id);
    if (!view) {
      throw new AppError(
        "GENERATION_RUN_NOT_FOUND",
        `Generation run ${id} was not found`,
        404,
      );
    }
    await container.chatTurnService.syncGenerationTurnResult(id);
    return { synced: true };
  });
}
