import type { ListGenerationProvidersResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { protectedRoute } from "@/app/api/_route";

export const runtime = "nodejs";

export async function GET() {
  return protectedRoute<ListGenerationProvidersResponse>(() =>
    container.generationProviderSettingsService.listProviders());
}
