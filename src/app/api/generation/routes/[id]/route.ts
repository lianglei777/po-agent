import type { GenerationRouteDto, UpdateGenerationEnabledRequest } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { generationRouteDto } from "@/server/transport/http/generation-response-mapper";
import { asObject, requiredBoolean } from "@/server/transport/http/validators";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/generation/routes/[id]">) {
  return handleRoute<GenerationRouteDto>(async () => {
    const { id } = await context.params;
    const body = asObject(await readJson(request));
    const input: UpdateGenerationEnabledRequest = {
      enabled: requiredBoolean(body, "enabled"),
    };
    return generationRouteDto(await container.generationRunService.setRouteEnabled(id, input.enabled));
  });
}
