import type {
  AgentSettingsResponse,
  UpdateAgentSettingsRequest,
} from "@/contracts/agent-settings";
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

export function loadAgentSettings() {
  return requestJson<AgentSettingsResponse>("/api/agent-settings");
}

export function updateAgentSettings(input: UpdateAgentSettingsRequest) {
  return requestJson<AgentSettingsResponse>("/api/agent-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
