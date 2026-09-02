import type { ListGenerationRoutesResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";
import { generationRouteDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

export async function GET() {
  return protectedRoute<ListGenerationRoutesResponse>(async () =>
    (await container.generationRunService.listRoutes())
      .map(generationRouteDto),
  );
}
