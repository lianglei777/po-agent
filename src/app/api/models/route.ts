import type { ModelsResponse } from "@/contracts/models";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

export async function GET() {
  return protectedRoute<ModelsResponse>(async () => ({
    models: await container.modelService.listAvailable(),
    defaultModel: await container.modelService.getDefault(),
  }));
}

