import type { ApiErrorResponse } from "@/contracts/common";
import type {
  CreateGenerationRunRequest,
  CreateGenerationRunResponse,
  GenerationAssetUploadResponse,
  GenerationCredentialStatusResponse,
  GenerationProviderSettingsDto,
  GenerationRouteDto,
  GenerationRunViewDto,
  ListGenerationRoutesResponse,
  ListGenerationRunsResponse,
} from "@/contracts/generation";

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

export function loadGenerationRoutes() {
  return requestJson<ListGenerationRoutesResponse>("/api/generation/routes");
}

export function loadRunningHubGenerationCredential() {
  return requestJson<GenerationCredentialStatusResponse>(
    "/api/generation/credentials/runninghub",
  );
}

export function loadRunningHubGenerationSettings() {
  return requestJson<GenerationProviderSettingsDto>("/api/generation/providers/runninghub");
}

export function updateRunningHubGenerationSettings(enabled: boolean) {
  return requestJson<GenerationProviderSettingsDto>("/api/generation/providers/runninghub", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export function updateGenerationRoute(routeId: string, enabled: boolean) {
  return requestJson<GenerationRouteDto>(`/api/generation/routes/${encodeURIComponent(routeId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

export function saveRunningHubGenerationCredential(apiKey: string) {
  return requestJson<GenerationCredentialStatusResponse>(
    "/api/generation/credentials/runninghub",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    },
  );
}

export function deleteRunningHubGenerationCredential() {
  return requestJson<GenerationCredentialStatusResponse>(
    "/api/generation/credentials/runninghub",
    { method: "DELETE" },
  );
}

export function loadGenerationRuns(sessionId: string) {
  return requestJson<ListGenerationRunsResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/generation-runs`,
  );
}

export function uploadGenerationAsset(sessionId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return requestJson<GenerationAssetUploadResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/generation-assets`,
    { method: "POST", body },
  );
}

export function createGenerationRun(
  sessionId: string,
  input: CreateGenerationRunRequest,
) {
  return requestJson<CreateGenerationRunResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/generation-runs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export function cancelGenerationRun(runId: string) {
  return requestJson<GenerationRunViewDto>(
    `/api/generation-runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  );
}

export function retryGenerationRun(runId: string, idempotencyKey: string) {
  return requestJson<CreateGenerationRunResponse>(
    `/api/generation-runs/${encodeURIComponent(runId)}/retry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey }),
    },
  );
}
