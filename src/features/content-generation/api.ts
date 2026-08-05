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
  });
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
