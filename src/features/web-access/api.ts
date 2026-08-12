import type {
  UpdateWebAccessSettingsRequest,
  WebAccessSettingsResponse,
} from "@/contracts/web-access";
import type { ApiErrorResponse } from "@/contracts/common";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    throw new Error(
      (data as ApiErrorResponse).error?.message ??
        `Request failed (${response.status})`,
    );
  }
  return data as T;
}

export function loadWebAccessSettings() {
  return requestJson<WebAccessSettingsResponse>("/api/web-access");
}

export function saveWebAccessSettings(
  input: UpdateWebAccessSettingsRequest,
  signal?: AbortSignal,
) {
  return requestJson<WebAccessSettingsResponse>("/api/web-access", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
}
