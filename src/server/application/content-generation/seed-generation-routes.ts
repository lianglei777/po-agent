import type { GenerationRoute } from "@/server/domain/generation";
import type { GenerationRepository } from "@/server/ports/generation-repository";

export async function seedGenerationRoutes(
  repository: GenerationRepository,
  routes: GenerationRoute[],
): Promise<void> {
  for (const route of routes) {
    const existing = await repository.getRoute(route.id);
    const presentationChanged = existing?.navigationLabel !== route.navigationLabel;
    if (
      existing
      && !existing.retiredAt
      && existing.revision >= route.revision
      && !presentationChanged
    ) continue;
    // Route 版本升级只能更新系统契约，不能覆盖用户已经选择的启用和默认状态。
    await repository.upsertRoute(existing
      ? {
          ...route,
          enabled: existing.retiredAt ? route.enabled : existing.enabled,
          isDefault: existing.retiredAt ? route.isDefault : existing.isDefault,
          retiredAt: undefined,
        }
      : route);
  }

  const providerIds = [...new Set(routes.map((route) => route.providerId))];
  if (providerIds.length === 0) return;
  // 目录下线只做逻辑退役，保留 Route 记录供历史任务和运行中任务继续解析。
  await repository.retireRoutesMissingFromCatalog({
    providerIds,
    activeRouteIds: routes.map((route) => route.id),
    retiredAt: routes.reduce(
      (latest, route) => route.updatedAt > latest ? route.updatedAt : latest,
      routes[0]?.updatedAt ?? new Date().toISOString(),
    ),
  });
}
