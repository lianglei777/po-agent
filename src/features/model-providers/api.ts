import type {
  ApiKeyProvider,
  ApiKeyProviderInfo,
  ModelsJson,
  ProviderEntry,
} from "./types";
import type {
  ApiKeyStatusResponse,
  LogoutOAuthResponse,
  OAuthInputRequest,
  OAuthInputResponse,
  RemoveApiKeyResponse,
  SaveApiKeyRequest,
  SaveApiKeyResponse,
} from "@/contracts/auth";
import type { ApiErrorResponse } from "@/contracts/common";
import { sanitizeModelsConfig } from "@/contracts/model-compat";
import type {
  ModelDiscoveryRequest,
  ModelDiscoveryResponse,
  ModelsConfigBootstrapResponse,
  ModelTestRequest,
  ModelTestResponse,
  SaveModelsConfigRequest,
  SaveModelsConfigResponse,
} from "@/contracts/models";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    const failure = data as ApiErrorResponse;
    throw new Error(
      failure.error?.message ?? `Request failed (${response.status})`,
    );
  }
  return data as T;
}

export function normalizeModelsConfig(value: unknown): ModelsJson {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { providers: {} };
  }
  const config = value as ModelsJson;
  return {
    ...config,
    providers:
      config.providers &&
      typeof config.providers === "object" &&
      !Array.isArray(config.providers)
        ? config.providers
        : {},
  };
}

export async function loadApiKeyProvider(
  provider: ApiKeyProviderInfo,
  modelCount = 0,
): Promise<ApiKeyProvider> {
  try {
    const status = await requestJson<ApiKeyStatusResponse>(
      `/api/auth/api-key/${encodeURIComponent(provider.id)}`,
    );
    return { ...provider, ...status, modelCount };
  } catch {
    return { ...provider, configured: false, modelCount };
  }
}

export async function loadModelsConfigData() {
  const data = await requestJson<ModelsConfigBootstrapResponse>(
    "/api/models-config/bootstrap",
  );
  return {
    config: normalizeModelsConfig(data.config),
    oauthProviders: data.oauthProviders,
    apiKeyProviders: data.apiKeyProviders,
  };
}

export function saveModelsConfig(config: ModelsJson, signal?: AbortSignal) {
  const body = sanitizeModelsConfig(
    config as Record<string, unknown>,
  ) satisfies SaveModelsConfigRequest;
  return requestJson<SaveModelsConfigResponse>("/api/models-config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export function discoverModelsConfig(input: {
  providerName: string;
  provider: ProviderEntry;
}) {
  const body: ModelDiscoveryRequest = input;
  return requestJson<ModelDiscoveryResponse>("/api/models-config/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function testModelConfig(input: {
  provider: string;
  modelId: string;
  config: ModelsJson;
  timeoutMs?: number;
}) {
  const body: ModelTestRequest = {
    ...input,
    config: input.config as Record<string, unknown>,
  };
  return requestJson<ModelTestResponse>("/api/models-config/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function saveApiKey(providerId: string, apiKey: string) {
  const body: SaveApiKeyRequest = { apiKey };
  return requestJson<SaveApiKeyResponse>(
    `/api/auth/api-key/${encodeURIComponent(providerId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function removeApiKey(providerId: string) {
  return requestJson<RemoveApiKeyResponse>(
    `/api/auth/api-key/${encodeURIComponent(providerId)}`,
    { method: "DELETE" },
  );
}

export function submitOAuthInput(
  providerId: string,
  token: string,
  value: string,
) {
  const body: OAuthInputRequest = { token, value };
  return requestJson<OAuthInputResponse>(
    `/api/auth/login/${encodeURIComponent(providerId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export function logoutOAuth(providerId: string) {
  return requestJson<LogoutOAuthResponse>(
    `/api/auth/logout/${encodeURIComponent(providerId)}`,
    { method: "POST" },
  );
}
