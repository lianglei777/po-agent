import type { ListGenerationProvidersResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";

export const runtime = "nodejs";

export async function GET() {
  return handleRoute<ListGenerationProvidersResponse>(() =>
    container.generationProviderSettingsService.listProviders());
}
