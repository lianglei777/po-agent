import { AppError } from "@/server/domain/app-error";
import type {
  GenerationProviderDescriptor,
  GenerationProviderDirectory,
} from "@/server/ports/generation-provider-directory";

export class StaticGenerationProviderDirectory
  implements GenerationProviderDirectory
{
  private readonly providers: Map<string, GenerationProviderDescriptor>;

  constructor(descriptors: GenerationProviderDescriptor[]) {
    this.providers = new Map();
    for (const descriptor of descriptors) {
      if (this.providers.has(descriptor.providerId)) {
        throw new AppError(
          "INTERNAL_ERROR",
          `Duplicate generation provider: ${descriptor.providerId}`,
          500,
        );
      }
      this.providers.set(descriptor.providerId, descriptor);
    }
  }

  list(): GenerationProviderDescriptor[] {
    return [...this.providers.values()];
  }

  get(providerId: string): GenerationProviderDescriptor | undefined {
    return this.providers.get(providerId);
  }
}
