import type { GenerationRouteDto } from "@/contracts/generation";

export function imageGenerationRoutes(routes: GenerationRouteDto[]): GenerationRouteDto[] {
  return routes.filter((route) => route.capability === "text-to-image");
}

export function selectImageGenerationRoute(
  routes: GenerationRouteDto[],
  preferredRouteId?: string,
): GenerationRouteDto | undefined {
  return routes.find((route) => route.id === preferredRouteId)
    ?? routes.find((route) => route.isDefault)
    ?? routes[0];
}

export function imagePromptProblem(
  route: GenerationRouteDto | undefined,
  prompt: string,
): "required" | "too-short" | "too-long" | null {
  const trimmed = prompt.trim();
  if (!trimmed) return "required";
  const minimum = route?.inputSchema.prompt.minLength;
  const maximum = route?.inputSchema.prompt.maxLength;
  if (minimum !== undefined && trimmed.length < minimum) return "too-short";
  if (maximum !== undefined && trimmed.length > maximum) return "too-long";
  return null;
}
