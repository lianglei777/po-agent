import type {
  CreateGenerationRunResponse,
  ListGenerationRunsResponse,
} from "@/contracts/generation";
import { container } from "@/server/composition/container";
import {
  handleRoute,
  readJson,
} from "@/server/transport/http/api-response";
import { parseCreateGenerationRun } from "@/server/transport/http/generation-validators";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return handleRoute<ListGenerationRunsResponse>(async () => {
    const { id } = await context.params;
    const views = await container.generationRunService.listRuns(id);
    return views.map(generationRunViewDto);
  });
}

export async function POST(request: Request, context: Context) {
  return handleRoute<CreateGenerationRunResponse>(async () => {
    const { id } = await context.params;
    const input = parseCreateGenerationRun(await readJson(request));
    const view = await container.generationRunService.createRun({
      ...input,
      sessionId: id,
      source: input.source ?? "direct-ui",
    });
    return {
      created: view.created,
      ...generationRunViewDto(view),
    };
  });
}
