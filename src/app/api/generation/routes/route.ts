import type { ListGenerationRoutesResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";
import { generationRouteDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

export async function GET() {
  return handleRoute<ListGenerationRoutesResponse>(async () =>
    (await container.generationRunService.listRoutes())
      .filter((route) => route.enabled)
      .map(generationRouteDto),
  );
}
