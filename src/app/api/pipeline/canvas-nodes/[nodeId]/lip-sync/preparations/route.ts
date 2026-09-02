import type { CreateLipSyncPreparationResponse } from "@/contracts/pipeline";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";
type Context = { params: Promise<{ nodeId: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<CreateLipSyncPreparationResponse>(async () => {
    const { nodeId } = await context.params;
    return { preparation: await container.canvasStudioService.createLipSyncPreparation(nodeId) };
  });
}
