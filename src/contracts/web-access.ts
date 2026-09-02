export const WEB_SEARCH_PROVIDER_IDS = [
  "brave",
  "tavily",
  "exa",
  "duckduckgo",
] as const;

export type WebSearchProviderId = (typeof WEB_SEARCH_PROVIDER_IDS)[number];

export const WEB_SEARCH_FALLBACK_KINDS = [
  "transient",
  "quota",
  "network",
  "invalid-response",
] as const;

export type WebSearchFallbackKind = (typeof WEB_SEARCH_FALLBACK_KINDS)[number];

export interface WebSearchProviderSettings {
  id: WebSearchProviderId;
  enabled: boolean;
  apiKey: string;
}

export interface WebAccessSettingsResponse {
  enabled: boolean;
  providers: WebSearchProviderSettings[];
  fallbackOn: WebSearchFallbackKind[];
}

export type UpdateWebAccessSettingsRequest = WebAccessSettingsResponse;
