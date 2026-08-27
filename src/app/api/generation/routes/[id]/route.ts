import type { GenerationRouteDto } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { AppError } from "@/server/domain/app-error";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { generationRouteDto } from "@/server/transport/http/generation-response-mapper";
import { updateGenerationRouteRequest } from "@/server/transport/http/generation-route-validator";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/generation/routes/[id]">) {
  return handleRoute<GenerationRouteDto>(async () => {
    const { id } = await context.params;
    const input = updateGenerationRouteRequest(await readJson(request));
    const route = input.enabled === undefined
      ? await container.generationRunService.getRoute(id)
      : await container.generationRunService.setRouteEnabled(id, input.enabled);
    if (!route) {
      throw new AppError("GENERATION_ROUTE_NOT_FOUND", "Generation route was not found", 404);
    }
    return generationRouteDto(input.isDefault
      ? await container.generationRunService.setDefaultRoute(id)
      : route);
  });
}
