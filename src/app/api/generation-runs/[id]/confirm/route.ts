import type { GetGenerationRunResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";
import { parseConfirmGenerationRun } from "@/server/transport/http/generation-validators";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<GetGenerationRunResponse>(async () => {
    const { id } = await context.params;
    const input = parseConfirmGenerationRun(await readJson(request));
    return generationRunViewDto(
      await container.generationRunService.confirmRun(id, input),
    );
  });
}
