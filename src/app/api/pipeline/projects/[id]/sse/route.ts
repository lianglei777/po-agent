import { container } from "@/server/composition/container";
import { createSseResponse } from "@/server/transport/sse/sse-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return createSseResponse<unknown>({
    request,
    subscribe: (emit) => container.pipelineSse.subscribe(id, emit),
  });
}
