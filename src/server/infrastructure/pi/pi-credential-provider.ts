import {
  type ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";
import { AppError } from "@/server/domain/app-error";
import type { OAuthCallbacks } from "@/server/domain/auth";
import type { CredentialProvider } from "@/server/ports/credential-provider";

export class PiCredentialProvider implements CredentialProvider {
  constructor(private readonly modelRuntime: Promise<ModelRuntime>) {}

  async listOAuthProviders() {
    const runtime = await this.modelRuntime;
    return runtime
      .getProviders()
      .filter((provider) => Boolean(provider.auth.oauth))
      .map(({ id, name }) => ({ id, name }));
  }

  async listApiKeyProviders() {
    const runtime = await this.modelRuntime;
    const ids = new Set(runtime.getModels().map((model) => model.provider));
    return [...ids]
      .filter((id) => Boolean(runtime.getProvider(id)?.auth.apiKey))
      .sort()
      .map((id) => ({ id, name: runtime.getProvider(id)?.name ?? id }));
  }

  async listConfiguredApiKeyProviders() {
    const providers = await this.listApiKeyProviders();
    const configured = [];
    for (const provider of providers) {
      const status = await this.getApiKeyStatus(provider.id);
      if (status.configured) {
        configured.push({
          ...provider,
          configured: true as const,
          source: status.source,
          label: status.label,
        });
      }
    }
    return configured;
  }

  async getApiKeyStatus(provider: string) {
    return (await this.modelRuntime).getProviderAuthStatus(provider);
  }

  async setApiKey(provider: string, apiKey: string): Promise<void> {
    const runtime = await this.modelRuntime;
    const candidate = runtime.getProvider(provider);
    if (!candidate?.auth.apiKey?.login) {
      throw new AppError(
        "MODEL_NOT_FOUND",
        `API Key provider ${provider} was not found`,
        404,
      );
    }
    await runtime.login(provider, "api_key", {
      prompt: async () => apiKey,
      notify: () => {},
    });
  }

  async removeApiKey(provider: string): Promise<void> {
    await (await this.modelRuntime).logout(provider);
  }

  async startOAuth(
    provider: string,
    callbacks: OAuthCallbacks,
    signal: AbortSignal,
  ): Promise<void> {
    const runtime = await this.modelRuntime;
    if (!runtime.getProvider(provider)?.auth.oauth) {
      throw new AppError(
        "OAUTH_PROVIDER_NOT_FOUND",
        `OAuth provider ${provider} was not found`,
        404,
      );
    }

    await runtime.login(provider, "oauth", {
      signal,
      notify: (event) => emitAuthEvent(callbacks, event),
      prompt: (prompt) => requestAuthInput(callbacks, provider, prompt),
    });
    callbacks.emit({ type: "complete" });
  }

  async logout(provider: string): Promise<void> {
    await (await this.modelRuntime).logout(provider);
  }
}

function emitAuthEvent(callbacks: OAuthCallbacks, event: AuthEvent): void {
  switch (event.type) {
    case "auth_url":
      callbacks.emit({
        type: "auth",
        url: event.url,
        instructions: event.instructions,
      });
      break;
    case "device_code":
      callbacks.emit({
        type: "device_code",
        userCode: event.userCode,
        verificationUri: event.verificationUri,
        intervalSeconds: event.intervalSeconds,
        expiresInSeconds: event.expiresInSeconds,
      });
      break;
    case "progress":
    case "info":
      callbacks.emit({ type: "progress", message: event.message });
      break;
  }
}

function requestAuthInput(
  callbacks: OAuthCallbacks,
  provider: string,
  prompt: AuthPrompt,
): Promise<string> {
  const request = callbacks.requestInput({
    provider,
    message: prompt.message,
    placeholder: "placeholder" in prompt ? prompt.placeholder : undefined,
    options:
      prompt.type === "select"
        ? prompt.options.map(({ id, label }) => ({ id, label }))
        : undefined,
  });
  return prompt.signal ? rejectOnAbort(request, prompt.signal) : request;
}

function rejectOnAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

