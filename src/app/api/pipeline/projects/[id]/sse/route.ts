import { container } from "@/server/composition/container";
import { createSseResponse } from "@/server/transport/sse/sse-stream";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  return protectedRoute(async () => {
    const { id } = await context.params;
    return createSseResponse<unknown>({
      request,
      subscribe: (emit) => container.pipelineSse.subscribe(id, emit),
    });
  });
}
