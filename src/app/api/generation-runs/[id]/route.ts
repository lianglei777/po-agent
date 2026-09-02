import type { GetGenerationRunResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { protectedRoute } from "@/app/api/_route";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<GetGenerationRunResponse>(async () => {
    const { id } = await context.params;
    const view = await container.generationRunService.getRun(id);
    if (!view) {
      throw new AppError(
        "GENERATION_RUN_NOT_FOUND",
        `Generation run ${id} was not found`,
        404,
      );
    }
    return generationRunViewDto(view);
  });
}
