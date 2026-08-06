import type {
  ContentGenerationApi,
  ContentGenerationDocumentationResponse,
  ContentGenerationJob,
  ContentGenerationSession,
  ContentGenerationProvider,
  ListContentGenerationProvidersResponse,
  ListContentGenerationApisResponse,
  ListContentGenerationJobsResponse,
  SaveContentGenerationApiRequest,
  SaveContentGenerationProviderRequest,
  JsonValue,
} from "@/contracts/content-generation";
import type { ApiErrorResponse, SuccessResponse } from "@/contracts/common";
import type {
  CreateGenerationRunRequest,
  CreateGenerationRunResponse,
  GenerationAssetUploadResponse,
  GenerationCredentialStatusResponse,
  GenerationRunViewDto,
  ListGenerationRoutesResponse,
  ListGenerationRunsResponse,
} from "@/contracts/generation";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    const failure = data as ApiErrorResponse;
    throw new Error(failure.error?.message ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export function loadContentGenerationApis() {
  return requestJson<ListContentGenerationApisResponse>("/api/content-generation/apis");
}

export function loadContentGenerationProviders() {
  return requestJson<ListContentGenerationProvidersResponse>("/api/content-generation/providers");
}

export function loadContentGenerationDocumentation(catalogId: string) {
  return requestJson<ContentGenerationDocumentationResponse>(
    `/api/content-generation/documentation/${encodeURIComponent(catalogId)}`,
  );
}

export function saveContentGenerationProvider(input: SaveContentGenerationProviderRequest) {
  return requestJson<ContentGenerationProvider>("/api/content-generation/providers", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then(async (provider) => {
    if (input.type === "runninghub" && input.apiKey?.trim()) {
      await saveRunningHubGenerationCredential(input.apiKey);
    }
    return provider;
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

export function deleteContentGenerationProvider(id: string) {
  return requestJson<SuccessResponse>(
    `/api/content-generation/providers?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function saveContentGenerationApi(input: SaveContentGenerationApiRequest) {
  return requestJson<ContentGenerationApi>("/api/content-generation/apis", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function deleteContentGenerationApi(id: string) {
  return requestJson<SuccessResponse>(
    `/api/content-generation/apis?id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

export function createContentGenerationSession(cwd: string, apiId: string) {
  return requestJson<ContentGenerationSession>("/api/content-generation/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cwd, apiId }),
  });
}

export function loadContentGenerationJobs(sessionId: string) {
  return requestJson<ListContentGenerationJobsResponse>(
    `/api/content-generation/sessions/${encodeURIComponent(sessionId)}/jobs`,
  );
}

export function createContentGenerationJob(
  sessionId: string,
  prompt: string,
  parameters: Record<string, JsonValue>,
  assets: Array<{ slot: string; file: File }>,
) {
  const body = new FormData();
  body.append("prompt", prompt);
  body.append("parameters", JSON.stringify(parameters));
  assets.forEach(({ file, slot }) => {
    body.append("files", file);
    body.append("fileSlots", slot);
  });
  return requestJson<ContentGenerationJob>(
    `/api/content-generation/sessions/${encodeURIComponent(sessionId)}/jobs`,
    { method: "POST", body },
  );
}

export function pollContentGenerationJob(jobId: string) {
  return requestJson<ContentGenerationJob>(
    `/api/content-generation/jobs/${encodeURIComponent(jobId)}/poll`,
    { method: "POST" },
  );
}

export function loadGenerationRoutes() {
  return requestJson<ListGenerationRoutesResponse>("/api/generation/routes");
}

export function loadGenerationRuns(sessionId: string) {
  return requestJson<ListGenerationRunsResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/generation-runs`,
  );
}

export function loadGenerationRun(runId: string) {
  return requestJson<GenerationRunViewDto>(
    `/api/generation-runs/${encodeURIComponent(runId)}`,
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
