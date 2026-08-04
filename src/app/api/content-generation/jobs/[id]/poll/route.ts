import type { PollContentGenerationJobResponse } from "@/contracts/content-generation";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  return handleRoute<PollContentGenerationJobResponse>(async () => {
    const { id } = await context.params;
    return container.contentGenerationService.pollJob(id);
  });
}
