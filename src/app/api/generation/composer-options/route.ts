import type { GenerationComposerOptionsResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";
import { generationRouteDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

export async function GET() {
  return handleRoute<GenerationComposerOptionsResponse>(async () => {
    const routes = await container.generationRunService.listRoutes();
    const providerIds = [...new Set(routes.map((route) => route.providerId))];
    const providers = new Map(
      await Promise.all(providerIds.map(async (providerId) => {
        const settings = await container.generationProviderSettingsService
          .getProviderSettings(providerId);
        return [providerId, {
          enabled: settings.enabled,
          hasCredential: await container.generationProviderSettingsService
            .hasUsableCredential(providerId),
        }] as const;
      })),
    );
    return {
      routes: routes
        .filter((route) =>
          route.enabled &&
          providers.get(route.providerId)?.enabled &&
          providers.get(route.providerId)?.hasCredential,
        )
        .map(generationRouteDto),
    };
  });
}
