import type { GenerationRoute } from "@/server/domain/generation";
import type { GenerationRepository } from "@/server/ports/generation-repository";

export async function seedGenerationRoutes(
  repository: GenerationRepository,
  routes: GenerationRoute[],
): Promise<void> {
  for (const route of routes) {
    const existing = await repository.getRoute(route.id);
    if (existing && existing.revision >= route.revision) continue;
    await repository.upsertRoute(existing ? { ...route, enabled: existing.enabled } : route);
  }
}
