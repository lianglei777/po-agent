import type {
  ContentGenerationApi,
  ContentGenerationJob,
  ContentGenerationSession,
  ListContentGenerationApisResponse,
  ListContentGenerationJobsResponse,
  SaveContentGenerationApiRequest,
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
  files: File[],
) {
  const body = new FormData();
  body.append("prompt", prompt);
  files.forEach((file) => body.append("files", file));
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
