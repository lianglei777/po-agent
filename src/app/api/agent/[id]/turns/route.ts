import type { AgentTurnSnapshotResponse } from "@/contracts/agent";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  return protectedRoute<AgentTurnSnapshotResponse>(async () => {
    const { id } = await context.params;
    return container.chatTurnService.getSnapshot(id);
  });
}
