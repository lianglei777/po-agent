import type {
  GenerationProviderDescriptorDto,
  GenerationRouteDto,
} from "@/contracts/generation";

export type ContentGenerationSettingsSelection =
  | { type: "provider"; providerId: string }
  | { type: "route"; routeId: string };

export function contentGenerationSelectionKey(
  selection: ContentGenerationSettingsSelection | null,
) {
  if (!selection) return null;
  return selection.type === "provider"
    ? `provider:${selection.providerId}`
    : `route:${selection.routeId}`;
}

export function contentGenerationSelectionFromKey(
  key: string,
): ContentGenerationSettingsSelection | null {
  if (key.startsWith("provider:")) {
    return { type: "provider", providerId: key.slice("provider:".length) };
  }
  if (key.startsWith("route:")) {
    return { type: "route", routeId: key.slice("route:".length) };
  }
  return null;
}

export function reconcileContentGenerationSelection(
  providers: GenerationProviderDescriptorDto[],
  routes: GenerationRouteDto[],
  requested: ContentGenerationSettingsSelection | null,
): ContentGenerationSettingsSelection | null {
  if (requested?.type === "provider" && providers.some((provider) => provider.providerId === requested.providerId)) {
    return requested;
  }
  if (requested?.type === "route" && routes.some((route) => route.id === requested.routeId)) {
    return requested;
  }
  return providers[0] ? { type: "provider", providerId: providers[0].providerId } : null;
}

// Catalog 顺序是产品呈现的一部分，分组时保持 Provider 返回的原始顺序。
export function groupGenerationRoutesByProduct(routes: GenerationRouteDto[]) {
  const groups: { product: string; routes: GenerationRouteDto[] }[] = [];
  for (const route of routes) {
    const existing = groups.find((group) => group.product === route.product);
    if (existing) existing.routes.push(route);
    else groups.push({ product: route.product, routes: [route] });
  }
  return groups;
}
