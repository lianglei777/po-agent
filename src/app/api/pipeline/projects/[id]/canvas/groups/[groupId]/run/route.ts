import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; groupId: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<{ groupRunId: string; nodeCount: number }>(async () => {
    const { id, groupId } = await context.params;
    return container.canvasStudioService.runGroup({ projectId: id, groupId });
  });
}
