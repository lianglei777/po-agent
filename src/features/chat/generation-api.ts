import type {
  ComposerGenerationMode,
  CreateGenerationRunRequest,
  CreateGenerationRunResponse,
  GenerationAssetUploadResponse,
  GenerationComposerOptionsResponse,
  GenerationRunViewDto,
  ListGenerationRunsResponse,
  PlanGenerationTurnResponse,
  ConfirmGenerationRunRequest,
} from "@/contracts/generation";
import type { ApiErrorResponse } from "@/contracts/common";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    const failure = data as ApiErrorResponse;
    throw new Error(failure.error?.message ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export function loadGenerationComposerOptions() {
  return requestJson<GenerationComposerOptionsResponse>("/api/generation/composer-options");
}

export function planGenerationTurn(input: {
  message: string;
  sessionId?: string;
  model: { provider: string; modelId: string };
  mode: Exclude<ComposerGenerationMode, { type: "chat" }>;
  assets: Array<{ mediaType: "image" | "video" | "audio"; mimeType: string }>;
}) {
  return requestJson<PlanGenerationTurnResponse>("/api/generation/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function uploadChatGenerationAsset(sessionId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  return requestJson<GenerationAssetUploadResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/generation-assets`,
    { method: "POST", body },
  );
}

export function createChatGenerationRun(sessionId: string, input: CreateGenerationRunRequest) {
  return requestJson<CreateGenerationRunResponse>(
    `/api/sessions/${encodeURIComponent(sessionId)}/generation-runs`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
}

export function loadChatGenerationRun(runId: string) {
  return requestJson<GenerationRunViewDto>(`/api/generation-runs/${encodeURIComponent(runId)}`);
}

export function loadChatGenerationRuns(sessionId: string) {
  return requestJson<ListGenerationRunsResponse>(`/api/sessions/${encodeURIComponent(sessionId)}/generation-runs`);
}

export function cancelChatGenerationRun(runId: string) {
  return requestJson<GenerationRunViewDto>(`/api/generation-runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
}

export function syncGenerationRunResult(runId: string) {
  return requestJson<{ synced: boolean }>(`/api/generation-runs/${encodeURIComponent(runId)}/sync`, { method: "POST" });
}

export function confirmChatGenerationRun(
  runId: string,
  input: ConfirmGenerationRunRequest,
) {
  return requestJson<GenerationRunViewDto>(
    `/api/generation-runs/${encodeURIComponent(runId)}/confirm`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}
