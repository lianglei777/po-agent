import type {
  ListFilesResponse,
  ReadTextFileResponse,
} from "@/contracts/files";
import type { ApiErrorResponse } from "@/contracts/common";
export { rawFileUrl } from "@/lib/raw-file-url";

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

export function loadDirectory(path: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ path, type: "list" });
  return requestJson<ListFilesResponse>(`/api/files/_?${params}`, { signal });
}

export function loadFile(path: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ path, type: "read" });
  return requestJson<ReadTextFileResponse>(`/api/files/_?${params}`, {
    signal,
  });
}
