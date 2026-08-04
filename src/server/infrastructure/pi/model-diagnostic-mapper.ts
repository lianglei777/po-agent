import { getCompatFields } from "@/contracts/model-compat";
import type {
  ModelDiagnostic,
  ModelDiagnosticCode,
  ModelDiagnosticPatch,
} from "@/server/domain/model-diagnostic";

export function mapModelDiagnostic(input: {
  api?: string;
  compat?: Record<string, unknown>;
  errorMessage?: string;
  provider?: string;
  model?: string;
}): ModelDiagnostic {
  const raw = input.errorMessage?.trim() || "Unknown model error";
  const code = classify(raw);
  return {
    code,
    summary: summaryFor(code),
    technicalMessage: redactSecrets(raw),
    provider: input.provider,
    model: input.model,
    retryable:
      code === "MODEL_RATE_LIMITED" ||
      code === "MODEL_TIMEOUT" ||
      code === "MODEL_UNAVAILABLE",
    suggestedPatch: compatibilityPatch(input.api, input.compat, raw),
  };
}

function compatibilityPatch(
  api: string | undefined,
  compat: Record<string, unknown> | undefined,
  message: string,
): ModelDiagnosticPatch | undefined {
  const candidate =
    api === "openai-completions"
      ? openAICompletionsPatch(message)
      : api === "anthropic-messages" || api === "anthropic-ark"
        ? anthropicMessagesPatch(message)
        : undefined;
  if (!candidate || !api) return undefined;
  const field = Object.keys(candidate.changes)[0]?.replace(/^compat\./, "");
  if (!field || !getCompatFields(api).some((item) => item.key === field)) {
    return undefined;
  }
  if (compat?.[field] !== undefined) return undefined;
  return { scope: "model", api, ...candidate };
}

function openAICompletionsPatch(
  message: string,
): Pick<ModelDiagnosticPatch, "changes" | "reason"> | undefined {
  if (
    /unknown variant [`'"]?developer|developer role|unsupported.*developer/i.test(
      message,
    )
  ) {
    return {
      changes: { "compat.supportsDeveloperRole": false },
      reason: "The endpoint accepts system messages instead of developer messages.",
    };
  }
  if (/reasoning_effort/i.test(message) && /not supported|unknown|invalid/i.test(message)) {
    return {
      changes: { "compat.supportsReasoningEffort": false },
      reason: "The endpoint does not accept the reasoning_effort parameter.",
    };
  }
  if (/max_completion_tokens/i.test(message) && /not supported|unknown|invalid/i.test(message)) {
    return {
      changes: { "compat.maxTokensField": "max_tokens" },
      reason: "The endpoint expects max_tokens.",
    };
  }
  if (/stream_options|include_usage/i.test(message) && /not supported|unsupported|unknown|invalid/i.test(message)) {
    return {
      changes: { "compat.supportsUsageInStreaming": false },
      reason: "The endpoint does not support streaming usage options.",
    };
  }
  if (/\bstrict\b/i.test(message) && /not allowed|not supported|unsupported|unknown|invalid/i.test(message)) {
    return {
      changes: { "compat.supportsStrictMode": false },
      reason: "The endpoint rejects strict tool definitions.",
    };
  }
  if (/tool result/i.test(message) && /\bname\b/i.test(message)) {
    return {
      changes: { "compat.requiresToolResultName": true },
      reason: "The endpoint requires a name on tool result messages.",
    };
  }
  return undefined;
}

function anthropicMessagesPatch(
  message: string,
): Pick<ModelDiagnosticPatch, "changes" | "reason"> | undefined {
  if (/cache_control/i.test(message) && /\btool/i.test(message)) {
    return {
      changes: { "compat.supportsCacheControlOnTools": false },
      reason: "The endpoint does not accept cache_control on tool definitions.",
    };
  }
  if (/eager_input_streaming/i.test(message)) {
    return {
      changes: { "compat.supportsEagerToolInputStreaming": false },
      reason: "The endpoint does not support eager tool input streaming.",
    };
  }
  return undefined;
}

function classify(message: string): ModelDiagnosticCode {
  if (/\b(401|403)\b|invalid api key|unauthori[sz]ed|authentication/i.test(message)) {
    return "MODEL_AUTH_FAILED";
  }
  if (/\b404\b|model not found|unknown model/i.test(message)) {
    return "MODEL_NOT_FOUND";
  }
  if (/\b429\b|rate limit|too many requests/i.test(message)) {
    return "MODEL_RATE_LIMITED";
  }
  if (/timed? out|timeout/i.test(message)) return "MODEL_TIMEOUT";
  if (/\b(502|503|504)\b|service unavailable|overloaded/i.test(message)) {
    return "MODEL_UNAVAILABLE";
  }
  if (/no assistant response|no text output|response invalid/i.test(message)) {
    return "MODEL_RESPONSE_INVALID";
  }
  if (
    /\b400\b|deserialize|invalid request|unsupported|unknown field|not allowed/i.test(
      message,
    )
  ) {
    return "MODEL_PROTOCOL_ERROR";
  }
  return "MODEL_REQUEST_FAILED";
}

function summaryFor(code: ModelDiagnosticCode): string {
  switch (code) {
    case "MODEL_AUTH_FAILED":
      return "The model service rejected the configured credentials.";
    case "MODEL_NOT_FOUND":
      return "The configured model was not found.";
    case "MODEL_RATE_LIMITED":
      return "The model service rate limit was reached.";
    case "MODEL_TIMEOUT":
      return "The model request timed out.";
    case "MODEL_UNAVAILABLE":
      return "The model service is temporarily unavailable.";
    case "MODEL_PROTOCOL_ERROR":
      return "The model service rejected the request format.";
    case "MODEL_RESPONSE_INVALID":
      return "The model returned an invalid or empty response.";
    default:
      return "The model request failed.";
  }
}

function redactSecrets(message: string): string {
  return message
    .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(
      /((?:api[_-]?key|token|secret)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(/([?&](?:api[_-]?key|token|secret)=)[^&\s]+/gi, "$1[REDACTED]");
}
