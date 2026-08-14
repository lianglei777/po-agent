import type { GenerationComposerOptionsResponse } from "@/contracts/generation";
import { container } from "@/server/composition/container";
import { handleRoute } from "@/server/transport/http/api-response";
import { generationRouteDto } from "@/server/transport/http/generation-response-mapper";

export const runtime = "nodejs";

export async function GET() {
  return handleRoute<GenerationComposerOptionsResponse>(async () => {
    const routes = await container.generationRunService.listRoutes();
    const providerIds = [...new Set(routes.map((route) => route.providerId))];
    const settings = new Map(
      await Promise.all(providerIds.map(async (providerId) => [
        providerId,
        await container.generationRunService.getProviderSettings(providerId),
      ] as const)),
    );
    // 当前凭据存储按供应商引用；新增供应商时在组合层注册其 credential ref。
    const credentialAvailable = new Map<string, boolean>([[
      "runninghub",
      await container.generationCredentialStore.hasCredential("runninghub:default"),
    ]]);
    return {
      routes: routes
        .filter((route) =>
          route.enabled &&
          settings.get(route.providerId)?.enabled &&
          credentialAvailable.get(route.providerId) === true,
        )
        .map(generationRouteDto),
    };
  });
}
