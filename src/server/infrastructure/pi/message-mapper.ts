import type {
  AgentMessage,
  AssistantContent,
  ImageContent,
  TextContent,
} from "@/server/domain/message";
import { mapAgentFailure } from "./agent-failure-mapper";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function mapContentBlock(value: unknown): AssistantContent | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  if (value.type === "text" && typeof value.text === "string") {
    return { type: "text", text: value.text };
  }
  if (value.type === "thinking" && typeof value.thinking === "string") {
    return { type: "thinking", thinking: value.thinking };
  }
  if (value.type === "image") {
    const data = typeof value.data === "string" ? value.data : undefined;
    const mimeType =
      typeof value.mimeType === "string" ? value.mimeType : undefined;
    return {
      type: "image",
      source: { type: "base64", data, mediaType: mimeType },
    };
  }
  if (value.type === "toolCall") {
    const toolCallId =
      typeof value.id === "string"
        ? value.id
        : typeof value.toolCallId === "string"
          ? value.toolCallId
          : "";
    const toolName =
      typeof value.name === "string"
        ? value.name
        : typeof value.toolName === "string"
          ? value.toolName
          : "";
    const input = isRecord(value.arguments)
      ? value.arguments
      : isRecord(value.input)
        ? value.input
        : {};
    return { type: "toolCall", toolCallId, toolName, input };
  }
  return null;
}

function mapBasicContent(value: unknown): Array<TextContent | ImageContent> {
  if (typeof value === "string") return [{ type: "text", text: value }];
  if (!Array.isArray(value)) return [];
  return value
    .map(mapContentBlock)
    .filter(
      (block): block is TextContent | ImageContent =>
        block?.type === "text" || block?.type === "image",
    );
}

export function mapPiMessage(value: unknown): AgentMessage {
  if (!isRecord(value) || typeof value.role !== "string") {
    return { role: "user", content: String(value) };
  }

  const timestamp =
    typeof value.timestamp === "number" ? value.timestamp : undefined;

  if (value.role === "assistant") {
    const content = Array.isArray(value.content)
      ? value.content
          .map(mapContentBlock)
          .filter((block): block is AssistantContent => block !== null)
      : [];
    const usage = isRecord(value.usage)
      ? {
          input: numberValue(value.usage.input),
          output: numberValue(value.usage.output),
          cacheRead: numberValue(value.usage.cacheRead),
          cacheWrite: numberValue(value.usage.cacheWrite),
          cost: {
            input: numberValue(
              isRecord(value.usage.cost) ? value.usage.cost.input : 0,
            ),
            output: numberValue(
              isRecord(value.usage.cost) ? value.usage.cost.output : 0,
            ),
            cacheRead: numberValue(
              isRecord(value.usage.cost) ? value.usage.cost.cacheRead : 0,
            ),
            cacheWrite: numberValue(
              isRecord(value.usage.cost) ? value.usage.cost.cacheWrite : 0,
            ),
            total: numberValue(
              isRecord(value.usage.cost) ? value.usage.cost.total : 0,
            ),
          },
        }
      : undefined;
    const errorMessage =
      typeof value.errorMessage === "string" ? value.errorMessage : undefined;
    return {
      role: "assistant",
      content,
      provider: typeof value.provider === "string" ? value.provider : "",
      model: typeof value.model === "string" ? value.model : "",
      stopReason:
        typeof value.stopReason === "string" ? value.stopReason : undefined,
      errorMessage,
      failure:
        value.stopReason === "error" || errorMessage
          ? mapAgentFailure({
              errorMessage,
              provider:
                typeof value.provider === "string" ? value.provider : undefined,
              model: typeof value.model === "string" ? value.model : undefined,
            })
          : undefined,
      timestamp,
      usage,
    };
  }

  if (value.role === "toolResult") {
    return {
      role: "toolResult",
      toolCallId:
        typeof value.toolCallId === "string" ? value.toolCallId : "",
      toolName: typeof value.toolName === "string" ? value.toolName : undefined,
      content: mapBasicContent(value.content),
      details: value.details,
      isError: value.isError === true,
      timestamp,
    };
  }

  if (value.role === "compactionSummary") {
    return {
      role: "compactionSummary",
      summary: String(value.summary ?? ""),
      tokensBefore: numberValue(value.tokensBefore),
      timestamp,
    };
  }
  if (value.role === "branchSummary") {
    return {
      role: "branchSummary",
      summary: String(value.summary ?? ""),
      fromId: String(value.fromId ?? ""),
      timestamp,
    };
  }
  if (value.role === "custom") {
    const content =
      typeof value.content === "string"
        ? value.content
        : mapBasicContent(value.content);
    return {
      role: "custom",
      customType: String(value.customType ?? ""),
      content,
      display: value.display === true,
      details: value.details,
      timestamp,
    };
  }
  if (value.role === "bashExecution") {
    return {
      role: "bashExecution",
      command: String(value.command ?? ""),
      output: String(value.output ?? ""),
      exitCode:
        typeof value.exitCode === "number" ? value.exitCode : undefined,
      cancelled: value.cancelled === true,
      truncated: value.truncated === true,
      fullOutputPath:
        typeof value.fullOutputPath === "string"
          ? value.fullOutputPath
          : undefined,
      excludeFromContext: value.excludeFromContext === true,
      timestamp,
    };
  }

  const content =
    typeof value.content === "string"
      ? value.content
      : mapBasicContent(value.content);
  return { role: "user", content, timestamp };
}

function numberValue(value: unknown): number {
  return typeof value === "number" ? value : 0;
}
