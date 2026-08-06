import { AppError } from "@/server/domain/app-error";
import type {
  GenerationCapability,
  GenerationRoute,
} from "@/server/domain/generation";
import type { GenerationRepository } from "@/server/ports/generation-repository";

export class GenerationRouter {
  constructor(private readonly repository: GenerationRepository) {}

  async resolve(input: {
    capability: GenerationCapability;
    routeId?: string;
  }): Promise<GenerationRoute> {
    const route = input.routeId
      ? await this.repository.getRoute(input.routeId)
      : await this.repository.findDefaultRoute(input.capability);
    if (!route || !route.enabled || route.capability !== input.capability) {
      throw new AppError(
        "GENERATION_ROUTE_UNAVAILABLE",
        `No enabled generation route is available for ${input.capability}`,
        409,
      );
    }
    return route;
  }
}
