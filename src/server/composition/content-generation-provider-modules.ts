import type { GenerationRoute } from "@/server/domain/generation";
import { runningHubProviderModule } from "@/server/infrastructure/content-generation/runninghub/runninghub-provider-module";
import type { GenerationProvider } from "@/server/ports/generation-provider";

export interface GenerationProviderModule {
  providerId: string;
  createProvider(): GenerationProvider;
  createRoutes(now?: string): GenerationRoute[];
}

const PROVIDER_MODULES = [
  runningHubProviderModule,
] satisfies GenerationProviderModule[];

export function createGenerationProviders(): GenerationProvider[] {
  return PROVIDER_MODULES.map((module) => module.createProvider());
}

export function createGenerationRoutes(now?: string): GenerationRoute[] {
  return PROVIDER_MODULES.flatMap((module) => module.createRoutes(now));
}
