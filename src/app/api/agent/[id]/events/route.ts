import type { AgentEvent } from "@/contracts/agent";
import { container } from "@/server/composition/container";
import { createSseResponse } from "@/server/transport/sse/sse-stream";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return protectedRoute(async () => {
    const { id } = await context.params;
    return createSseResponse<AgentEvent>({
      request,
      eventName: "agent",
      initial: { type: "connected", sessionId: id },
      subscribe: (emit) => container.agentService.subscribe(id, emit),
    });
  });
}

