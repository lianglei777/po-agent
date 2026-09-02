import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";
import type { AssetListResponse } from "@/contracts/pipeline";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context) {
  return protectedRoute<AssetListResponse>(async () => {
    const { id } = await context.params;
    const assets = await container.scriptAnalysisService.extractEntities(id);
    return { assets };
  });
}
