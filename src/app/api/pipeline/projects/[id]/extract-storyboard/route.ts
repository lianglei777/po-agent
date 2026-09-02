import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";
import type { FrameListResponse } from "@/contracts/pipeline";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<FrameListResponse>(async () => {
    const { id } = await context.params;
    const frames = await container.storyboardService.extractFrames(id);
    return { frames };
  });
}
