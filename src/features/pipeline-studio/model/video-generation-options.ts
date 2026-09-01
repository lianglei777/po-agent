import type { GenerationCapability, GenerationRouteDto } from "@/contracts/generation";

export type VideoGenerationCapability = Extract<GenerationCapability, `${string}-to-video`>;

export function videoGenerationRoutes(routes: GenerationRouteDto[]): GenerationRouteDto[] {
  return routes.filter((route) => route.enabled && route.capability.endsWith("-to-video"));
}

export function selectInitialVideoGenerationRoute(
  routes: GenerationRouteDto[],
  preferredRouteId: string | undefined,
  inferredCapability: VideoGenerationCapability,
): GenerationRouteDto | undefined {
  return routes.find((route) => route.id === preferredRouteId)
    ?? routes.find((route) => route.isDefault && route.capability === inferredCapability)
    ?? routes.find((route) => route.capability === inferredCapability)
    ?? routes.find((route) => route.isDefault)
    ?? routes[0];
}
