import type { Api, Model } from "@earendil-works/pi-ai";

export function normalizePiModelBaseUrl<TApi extends Api>(
  model: Model<TApi>,
): Model<TApi> {
  if (model.api !== "anthropic-messages") return model;

  const normalized = normalizeAnthropicBaseUrl(model.baseUrl);
  return normalized === model.baseUrl
    ? model
    : { ...model, baseUrl: normalized };
}

export function normalizeAnthropicBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/u, "");
  // Anthropic SDK 会自行追加 /v1/messages；兼容代理常复用已含 /v1 的 OpenAI 地址。
  return trimmed.replace(/\/v\d+(?:beta\d*)?$/iu, "");
}
