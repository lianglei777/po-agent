import type { GenerationRoute } from "@/server/domain/generation";
import type { GenerationRepository } from "@/server/ports/generation-repository";

export async function seedGenerationRoutes(
  repository: GenerationRepository,
  routes: GenerationRoute[],
): Promise<void> {
  for (const route of routes) {
    const existing = await repository.getRoute(route.id);
    if (existing && existing.revision >= route.revision) continue;
    // Route 版本升级只能更新系统契约，不能覆盖用户已经选择的启用和默认状态。
    await repository.upsertRoute(existing
      ? { ...route, enabled: existing.enabled, isDefault: existing.isDefault }
      : route);
  }
}
