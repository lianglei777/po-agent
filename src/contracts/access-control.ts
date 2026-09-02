export const ACCESS_CONTROL_SESSION_STATES = [
  "development-bypass",
  "disabled",
  "login-required",
  "password-change-required",
  "authenticated",
] as const;

export type AccessControlSessionState =
  (typeof ACCESS_CONTROL_SESSION_STATES)[number];

export interface AccessControlSessionResponse {
  state: AccessControlSessionState;
}

export interface AccessControlSettingsResponse {
  enabled: boolean;
  developmentBypass: boolean;
}

export interface AccessControlLoginRequest {
  password: string;
}

export interface AccessControlChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateAccessControlSettingsRequest {
  enabled: boolean;
  currentPassword: string;
}
