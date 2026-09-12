import type { ApiErrorResponse } from "@/contracts/common";
import type {
  GenerationCredentialStatusResponse,
  GenerationProviderSettingsDto,
  ListGenerationProvidersResponse,
  GenerationRouteDto,
  ListGenerationRoutesResponse,
} from "@/contracts/generation";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const isJson = response.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("application/json");
  if (!isJson) {
    throw new Error(`Request failed (${response.status})`);
  }

  let data: T | ApiErrorResponse;
  try {
    data = (await response.json()) as T | ApiErrorResponse;
  } catch {
    throw new Error(`Invalid JSON response (${response.status})`);
  }
  if (!response.ok) {
    const failure = data as ApiErrorResponse;
    throw new Error(
      failure.error?.message ?? `Request failed (${response.status})`,
    );
  }
  return data as T;
}

export function loadGenerationRoutes() {
  return requestJson<ListGenerationRoutesResponse>("/api/generation/routes");
}

export function loadGenerationProviders() {
  return requestJson<ListGenerationProvidersResponse>(
    "/api/generation/providers",
  );
}
export function updateGenerationProviderSettings(
  providerId: string,
  enabled: boolean,
) {
  return requestJson<GenerationProviderSettingsDto>(`/api/generation/providers/${encodeURIComponent(providerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export function updateGenerationRoute(
  routeId: string,
  update: { enabled?: boolean; isDefault?: boolean },
) {
  return requestJson<GenerationRouteDto>(`/api/generation/routes/${encodeURIComponent(routeId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(update),
  });
}

export function saveGenerationProviderCredential(
  providerId: string,
  apiKey: string,
) {
  return requestJson<GenerationCredentialStatusResponse>(
    `/api/generation/credentials/${encodeURIComponent(providerId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    },
  );
}

export function deleteGenerationProviderCredential(providerId: string) {
  return requestJson<GenerationCredentialStatusResponse>(
    `/api/generation/credentials/${encodeURIComponent(providerId)}`,
    { method: "DELETE" },
  );
}
