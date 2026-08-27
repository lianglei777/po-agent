import { AppError } from "@/server/domain/app-error";
import type { GenerationCredentialStore } from "@/server/ports/generation-provider";
import type {
  GenerationProviderDescriptor,
  GenerationProviderDirectory,
} from "@/server/ports/generation-provider-directory";
import type { GenerationRepository } from "@/server/ports/generation-repository";

export class GenerationProviderSettingsService {
  constructor(
    private readonly repository: GenerationRepository,
    private readonly credentials: GenerationCredentialStore,
    private readonly providers: GenerationProviderDirectory,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listProviders() {
    return Promise.all(this.providers.list().map((provider) =>
      this.providerView(provider),
    ));
  }

  async getProvider(providerId: string) {
    return this.providerView(this.requiredProvider(providerId));
  }

  async getProviderSettings(providerId: string) {
    this.requiredProvider(providerId);
    return {
      providerId,
      enabled: await this.repository.isProviderEnabled(providerId),
    };
  }

  async setProviderEnabled(providerId: string, enabled: boolean) {
    this.requiredProvider(providerId);
    await this.repository.setProviderEnabled(
      providerId,
      enabled,
      this.now().toISOString(),
    );
    return { providerId, enabled };
  }

  async getCredentialStatus(providerId: string) {
    const credential = this.requiredCredential(providerId);
    return {
      hasCredential: await this.credentials.hasCredential(
        credential.reference,
      ),
    };
  }

  async setCredential(providerId: string, value: string) {
    const credential = this.requiredCredential(providerId);
    await this.credentials.setCredential(credential.reference, value);
    return {
      hasCredential: await this.credentials.hasCredential(
        credential.reference,
      ),
    };
  }

  async hasUsableCredential(providerId: string): Promise<boolean> {
    const provider = this.requiredProvider(providerId);
    return provider.credential
      ? this.credentials.hasCredential(provider.credential.reference)
      : true;
  }

  private async providerView(provider: GenerationProviderDescriptor) {
    return {
      providerId: provider.providerId,
      displayName: provider.displayName,
      enabled: await this.repository.isProviderEnabled(provider.providerId),
      credential: provider.credential
        ? {
            kind: provider.credential.kind,
            environmentVariable: provider.credential.environmentVariable,
            hasCredential: await this.credentials.hasCredential(
              provider.credential.reference,
            ),
          }
        : undefined,
    };
  }

  private requiredProvider(providerId: string) {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new AppError(
        "GENERATION_PROVIDER_NOT_FOUND",
        "Generation provider was not found",
        404,
      );
    }
    return provider;
  }

  private requiredCredential(providerId: string) {
    const provider = this.requiredProvider(providerId);
    if (!provider.credential) {
      throw new AppError(
        "GENERATION_CREDENTIAL_NOT_SUPPORTED",
        "Generation provider does not accept a stored credential",
        409,
      );
    }
    return provider.credential;
  }
}
