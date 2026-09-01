import type { GenerationRouteDto } from "@/contracts/generation";

export function audioGenerationRoutes(routes: GenerationRouteDto[]): GenerationRouteDto[] {
  return routes.filter((route) => route.enabled && route.capability === "video-to-audio");
}

export function selectAudioGenerationRoute(
  routes: GenerationRouteDto[],
  preferredRouteId?: string,
): GenerationRouteDto | undefined {
  return routes.find((route) => route.id === preferredRouteId)
    ?? routes.find((route) => route.isDefault)
    ?? routes[0];
}
