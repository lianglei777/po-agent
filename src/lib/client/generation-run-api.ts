import type {
  ConfirmGenerationRunRequest,
  GenerationRunViewDto,
} from "@/contracts/generation";
import type { ApiErrorResponse } from "@/contracts/common";

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

export function loadGenerationRun(runId: string) {
  return requestJson<GenerationRunViewDto>(
    `/api/generation-runs/${encodeURIComponent(runId)}`,
  );
}

export function confirmGenerationRun(
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

export function cancelGenerationRunReview(runId: string) {
  return requestJson<GenerationRunViewDto>(
    `/api/generation-runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  );
}
