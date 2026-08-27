import type { GenerationRoute } from "@/server/domain/generation";
import { runningHubProviderModule } from "@/server/infrastructure/content-generation/runninghub/runninghub-provider-module";
import { qianwenProviderModule } from "@/server/infrastructure/content-generation/qianwen/qianwen-provider-module";
import type { GenerationProvider } from "@/server/ports/generation-provider";
import type { GenerationProviderDescriptor } from "@/server/ports/generation-provider-directory";
import type { GenerationWorkerProviderPolicy } from "@/server/application/content-generation/generation-worker";

export interface GenerationProviderModule extends GenerationProviderDescriptor {
  createProvider(): GenerationProvider;
  createRoutes(now?: string): GenerationRoute[];
  workerPolicy: GenerationWorkerProviderPolicy;
}

const PROVIDER_MODULES = [
  runningHubProviderModule,
  qianwenProviderModule,
] satisfies GenerationProviderModule[];

export function createGenerationProviders(): GenerationProvider[] {
  return PROVIDER_MODULES.map((module) => module.createProvider());
}

export function createGenerationRoutes(now?: string): GenerationRoute[] {
  return PROVIDER_MODULES.flatMap((module) => module.createRoutes(now));
}

export function createGenerationProviderDescriptors(): GenerationProviderDescriptor[] {
  return PROVIDER_MODULES.map(({ providerId, displayName, credential }) => ({
    providerId,
    displayName,
    credential,
  }));
}

export function createGenerationWorkerPolicies():Record<string,GenerationWorkerProviderPolicy> {
  return Object.fromEntries(PROVIDER_MODULES.map(module=>[module.providerId,module.workerPolicy]));
}
