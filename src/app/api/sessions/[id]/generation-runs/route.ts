import type {
  CreateGenerationRunResponse,
  ListGenerationRunsResponse,
} from "@/contracts/generation";
import { container } from "@/server/composition/container";
import {
  protectedRoute,
  readJson,
} from "@/app/api/_route";
import { parseCreateGenerationRun } from "@/server/transport/http/generation-validators";
import { generationRunViewDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<ListGenerationRunsResponse>(async () => {
    const { id } = await context.params;
    const views = await container.generationRunService.listRuns(id);
    return views.map(generationRunViewDto);
  });
}

export async function POST(request: Request, context: Context) {
  return protectedRoute<CreateGenerationRunResponse>(async () => {
    const { id } = await context.params;
    const input = parseCreateGenerationRun(await readJson(request));
    const create = input.reviewFirst
      ? container.generationRunService.prepareRun.bind(container.generationRunService)
      : container.generationRunService.createRun.bind(container.generationRunService);
    // “执行前确认”只准备 Run，不创建 Provider Job，避免确认前产生外部调用和费用。
    const view = await create({
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
