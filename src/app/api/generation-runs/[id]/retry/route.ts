import type { CreateGenerationRunResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute, readJson } from "@/server/transport/http/api-response";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";
import { parseRetryGenerationRun } from "@/server/transport/http/generation-validators";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  return handleRoute<CreateGenerationRunResponse>(async () => {
    const { id } = await context.params;
    const input = parseRetryGenerationRun(await readJson(request));
    const view = await container.generationRunService.retryRun(
      id,
      input.idempotencyKey,
    );
    return { created: view.created, ...generationRunViewDto(view) };
  });
}
