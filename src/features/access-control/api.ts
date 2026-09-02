import type {
  AccessControlChangePasswordRequest,
  AccessControlLoginRequest,
  AccessControlSessionResponse,
  AccessControlSettingsResponse,
  UpdateAccessControlSettingsRequest,
} from "@/contracts/access-control";
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

function jsonRequest(method: "POST" | "PUT", body?: unknown): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export function loadAccessControlSession() {
  return requestJson<AccessControlSessionResponse>("/api/access-control/session");
}

export function loginAccessControl(input: AccessControlLoginRequest) {
  return requestJson<AccessControlSessionResponse>(
    "/api/access-control/login",
    jsonRequest("POST", input),
  );
}

export function logoutAccessControl() {
  return requestJson<AccessControlSessionResponse>(
    "/api/access-control/logout",
    jsonRequest("POST"),
  );
}

export function changeAccessControlPassword(
  input: AccessControlChangePasswordRequest,
) {
  return requestJson<AccessControlSessionResponse>(
    "/api/access-control/change-password",
    jsonRequest("POST", input),
  );
}

export function loadAccessControlSettings() {
  return requestJson<AccessControlSettingsResponse>(
    "/api/access-control/settings",
  );
}

export function updateAccessControlSettings(
  input: UpdateAccessControlSettingsRequest,
) {
  return requestJson<AccessControlSettingsResponse>(
    "/api/access-control/settings",
    jsonRequest("PUT", input),
  );
}
