export const MODEL_API_PROTOCOLS = [
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "anthropic-ark",
] as const;

export type ModelApiProtocol = (typeof MODEL_API_PROTOCOLS)[number];

export type CompatFieldDefinition =
  | { key: string; kind: "boolean"; defaultValue?: boolean }
  | { key: string; kind: "enum"; values: readonly string[] }
  | { key: string; kind: "object" };

const OPENAI_COMPLETIONS_FIELDS = [
  { key: "supportsStore", kind: "boolean" },
  { key: "supportsDeveloperRole", kind: "boolean", defaultValue: false },
  { key: "supportsReasoningEffort", kind: "boolean" },
  { key: "supportsUsageInStreaming", kind: "boolean" },
  {
    key: "maxTokensField",
    kind: "enum",
    values: ["max_completion_tokens", "max_tokens"],
  },
  { key: "requiresToolResultName", kind: "boolean" },
  { key: "requiresAssistantAfterToolResult", kind: "boolean" },
  { key: "requiresThinkingAsText", kind: "boolean" },
  {
    key: "requiresReasoningContentOnAssistantMessages",
    kind: "boolean",
  },
  {
    key: "thinkingFormat",
    kind: "enum",
    values: [
      "openai",
      "openrouter",
      "deepseek",
      "together",
      "zai",
      "qwen",
      "qwen-chat-template",
    ],
  },
  { key: "openRouterRouting", kind: "object" },
  { key: "vercelGatewayRouting", kind: "object" },
  { key: "zaiToolStream", kind: "boolean" },
  { key: "supportsStrictMode", kind: "boolean" },
  { key: "cacheControlFormat", kind: "enum", values: ["anthropic"] },
  { key: "sendSessionAffinityHeaders", kind: "boolean" },
  { key: "supportsLongCacheRetention", kind: "boolean" },
] as const satisfies readonly CompatFieldDefinition[];

const OPENAI_RESPONSES_FIELDS = [
  { key: "sendSessionIdHeader", kind: "boolean" },
  { key: "supportsLongCacheRetention", kind: "boolean" },
] as const satisfies readonly CompatFieldDefinition[];

const ANTHROPIC_MESSAGES_FIELDS = [
  { key: "supportsEagerToolInputStreaming", kind: "boolean" },
  { key: "supportsLongCacheRetention", kind: "boolean" },
  { key: "sendSessionAffinityHeaders", kind: "boolean" },
  { key: "supportsCacheControlOnTools", kind: "boolean" },
  { key: "forceAdaptiveThinking", kind: "boolean" },
] as const satisfies readonly CompatFieldDefinition[];

const EMPTY_FIELDS: readonly CompatFieldDefinition[] = [];

export function isModelApiProtocol(value: unknown): value is ModelApiProtocol {
  return (
    typeof value === "string" &&
    MODEL_API_PROTOCOLS.includes(value as ModelApiProtocol)
  );
}

export function getCompatFields(
  api: ModelApiProtocol | string | undefined,
): readonly CompatFieldDefinition[] {
  if (api === "openai-completions") return OPENAI_COMPLETIONS_FIELDS;
  if (api === "openai-responses") return OPENAI_RESPONSES_FIELDS;
  if (api === "anthropic-messages" || api === "anthropic-ark")
    return ANTHROPIC_MESSAGES_FIELDS;
  return EMPTY_FIELDS;
}

// 将发现层协议映射为 pi-ai SDK 可识别的聊天协议
export function getChatApi(api: string | undefined): string | undefined {
  if (api === "anthropic-ark") return "anthropic-messages";
  return api;
}

export function getEffectiveApi(
  providerApi: string | undefined,
  modelApi: string | undefined,
): string | undefined {
  return modelApi ?? providerApi;
}

export function sanitizeCompat(
  api: string | undefined,
  value: unknown,
): Record<string, unknown> | undefined {
  const output: Record<string, unknown> = {};
  if (isRecord(value)) {
    for (const field of getCompatFields(api)) {
      const fieldValue = value[field.key];
      if (field.kind === "boolean" && typeof fieldValue === "boolean") {
        output[field.key] = fieldValue;
      } else if (
        field.kind === "enum" &&
        typeof fieldValue === "string" &&
        field.values.includes(fieldValue)
      ) {
        output[field.key] = fieldValue;
      } else if (field.kind === "object" && isRecord(fieldValue)) {
        output[field.key] = fieldValue;
      }
    }
  }
  // 带显式默认值的布尔字段：未设置时落盘为默认值（如 supportsDeveloperRole 默认 false）
  for (const field of getCompatFields(api)) {
    if (
      field.kind === "boolean" &&
      field.defaultValue !== undefined &&
      output[field.key] === undefined
    ) {
      output[field.key] = field.defaultValue;
    }
  }
  return Object.keys(output).length ? output : undefined;
}

export function sanitizeModelsConfig(
  value: Record<string, unknown>,
  options: { strictApi?: boolean } = {},
): Record<string, unknown> {
  const providersValue = value.providers;
  if (!isRecord(providersValue)) {
    return { ...value, providers: {} };
  }

  const providers: Record<string, unknown> = {};
  for (const [providerName, providerValue] of Object.entries(providersValue)) {
    if (!isRecord(providerValue)) continue;
    const providerApi = readApi(providerValue.api, options.strictApi);
    const provider = { ...providerValue };
    setOptional(provider, "compat", sanitizeCompat(providerApi, provider.compat));

    if (Array.isArray(provider.models)) {
      provider.models = provider.models.flatMap((modelValue) => {
        if (!isRecord(modelValue)) return [];
        const modelApi = readApi(modelValue.api, options.strictApi);
        const model = { ...modelValue };
        // anthropic-ark 仅用于模型发现；聊天层需要 pi-ai 可识别的 anthropic-messages
        if (modelApi === undefined && providerApi === "anthropic-ark") {
          model.api = "anthropic-messages";
        }
        setOptional(
          model,
          "compat",
          sanitizeCompat(getEffectiveApi(providerApi, modelApi), model.compat),
        );
        return [model];
      });
    }
    providers[providerName] = provider;
  }

  return { ...value, providers };
}

function readApi(
  value: unknown,
  strictApi: boolean | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  if (isModelApiProtocol(value)) return value;
  if (strictApi) throw new Error(`Unsupported API protocol: ${String(value)}`);
  return typeof value === "string" ? value : undefined;
}

function setOptional(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
