import type { AssistantMessage, JsonValue } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { AppError } from "@/server/domain/app-error";
import type {
  CanvasAssetAnalysisContent,
  CanvasAssetSuggestedRole,
} from "@/server/domain/pipeline";
import type { CanvasAssetAnalyzer } from "@/server/ports/canvas-asset-analyzer";
import { normalizePiModelBaseUrl } from "./pi-model-base-url";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const SYSTEM_PROMPT = `You analyze a reference image for a visual production canvas.
Describe only visible evidence. Keep each list concise. Do not identify a real person.
Suggest how the image can be used in generation. Return one JSON object and no markdown.
Schema:
{"summary":"string","subjects":["string"],"composition":"string or null","materials":["string"],"style":"string or null","lighting":"string or null","visibleText":["string"],"brandElements":["string"],"suggestedRoles":["subject|scene|style|first-frame|last-frame|negative-reference"]}`;

export class PiCanvasAssetAnalyzer implements CanvasAssetAnalyzer {
  constructor(private readonly runtimePromise: Promise<ModelRuntime>) {}

  async validateVisionModel(input: { provider: string; modelId: string }): Promise<void> {
    const runtime = await this.runtimePromise;
    const model = runtime.getModel(input.provider, input.modelId);
    if (!model) throw new AppError("MODEL_NOT_FOUND", "The selected Canvas Agent model is unavailable", 409);
    if (!model.input.includes("image")) {
      throw new AppError(
        "PIPELINE_AGENT_MODEL_VISION_REQUIRED",
        "The selected Canvas Agent model does not support image input; choose a vision-capable model",
        409,
        { provider: input.provider, modelId: input.modelId },
      );
    }
  }

  async analyzeImage(input: Parameters<CanvasAssetAnalyzer["analyzeImage"]>[0]) {
    if (!input.data.byteLength || input.data.byteLength > MAX_IMAGE_BYTES) {
      throw new AppError(
        "FILE_TOO_LARGE",
        "Canvas image analysis accepts files between 1 byte and 20 MiB",
        413,
      );
    }
    if (!SUPPORTED_IMAGE_TYPES.has(input.mimeType.toLowerCase())) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Canvas image analysis supports JPEG, PNG, WebP, and GIF files",
        400,
      );
    }
    const runtime = await this.runtimePromise;
    const configured = runtime.getModel(input.provider, input.modelId);
    if (!configured) {
      throw new AppError("MODEL_NOT_FOUND", "The selected Canvas Agent model is unavailable", 409);
    }
    if (!configured.input.includes("image")) {
      throw new AppError(
        "PIPELINE_AGENT_MODEL_VISION_REQUIRED",
        "The selected Canvas Agent model does not support image input; choose a vision-capable model",
        409,
        { provider: input.provider, modelId: input.modelId },
      );
    }
    const model = normalizePiModelBaseUrl(configured);
    const content = [
      { type: "text" as const, text: `Analyze the attached canvas asset named ${JSON.stringify(input.name)}.` },
      { type: "image" as const, data: Buffer.from(input.data).toString("base64"), mimeType: input.mimeType },
    ];
    const first = await runtime.completeSimple(model, {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", timestamp: Date.now(), content }],
    }, { maxTokens: 1_500 });
    assertSuccessful(first);
    const parsed = parseAnalysis(messageText(first));
    if (parsed) return parsed;

    // 部分兼容模型会把 JSON 包进说明文字；仅在协议失败时追加一次纠正请求，避免重复图片分析成本。
    const repaired = await runtime.completeSimple(model, {
      systemPrompt: `${SYSTEM_PROMPT}\nYour previous response was invalid. Return one compact JSON object only.`,
      messages: [
        { role: "user", timestamp: Date.now(), content },
        first,
        { role: "user", timestamp: Date.now(), content: "Return the corrected JSON only." },
      ],
    }, { maxTokens: 1_500 });
    assertSuccessful(repaired);
    const result = parseAnalysis(messageText(repaired));
    if (!result) {
      throw new AppError("PIPELINE_LLM_FAILED", "The vision model returned an invalid asset analysis", 502);
    }
    return result;
  }

  async analyzeVideoFrames(input: Parameters<CanvasAssetAnalyzer["analyzeVideoFrames"]>[0]) {
    if (!input.frames.length || input.frames.length > 6) {
      throw new AppError("VALIDATION_ERROR", "Video analysis requires 1 to 6 sampled frames", 400);
    }
    const totalBytes = input.frames.reduce((sum, frame) => sum + frame.data.byteLength, 0);
    if (totalBytes > MAX_IMAGE_BYTES) {
      throw new AppError("FILE_TOO_LARGE", "Sampled video frames exceed the 20 MiB analysis limit", 413);
    }
    const runtime = await this.runtimePromise;
    const configured = runtime.getModel(input.provider, input.modelId);
    if (!configured) throw new AppError("MODEL_NOT_FOUND", "The selected Canvas Agent model is unavailable", 409);
    if (!configured.input.includes("image")) {
      throw new AppError(
        "PIPELINE_AGENT_MODEL_VISION_REQUIRED",
        "The selected Canvas Agent model does not support image input; choose a vision-capable model",
        409,
        { provider: input.provider, modelId: input.modelId },
      );
    }
    const content = [
      { type: "text" as const, text: `Analyze these ordered sampled frames from video ${JSON.stringify(input.name)}. Summarize visible subjects, shot progression, camera or subject motion, likely cuts, composition, style, lighting, text, brand elements, and useful reference roles. When you observe a visible issue or a meaningful change, include the relevant sampled timestamp or approximate interval in the summary so later review can locate it.` },
      ...input.frames.flatMap((frame) => [
        { type: "text" as const, text: `Frame at ${frame.timestampSeconds.toFixed(2)} seconds:` },
        { type: "image" as const, data: Buffer.from(frame.data).toString("base64"), mimeType: frame.mimeType },
      ]),
    ];
    const response = await runtime.completeSimple(normalizePiModelBaseUrl(configured), {
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: "user", timestamp: Date.now(), content }],
    }, { maxTokens: 1_800 });
    assertSuccessful(response);
    const result = parseAnalysis(messageText(response));
    if (!result) throw new AppError("PIPELINE_LLM_FAILED", "The vision model returned an invalid video analysis", 502);
    return {
      ...result,
      technicalMetadata: {
        sampledFrameCount: input.frames.length,
        sampledAtSeconds: input.frames.map((frame) => frame.timestampSeconds).join(", "),
      },
    };
  }
}

function assertSuccessful(message: AssistantMessage): void {
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    throw new AppError("PIPELINE_LLM_FAILED", message.errorMessage ?? "Canvas asset analysis failed", 502);
  }
}

export function parseCanvasAssetAnalysis(text: string): CanvasAssetAnalysisContent | null {
  return parseAnalysis(text);
}

function parseAnalysis(text: string): CanvasAssetAnalysisContent | null {
  for (const candidate of jsonObjectCandidates(text).reverse()) {
    let value: JsonValue;
    try {
      value = JSON.parse(candidate) as JsonValue;
    } catch {
      continue;
    }
    if (!isRecord(value) || typeof value.summary !== "string" || !value.summary.trim()) continue;
    return {
      summary: value.summary.trim().slice(0, 2_000),
      subjects: stringList(value.subjects),
      composition: nullableString(value.composition),
      materials: stringList(value.materials),
      style: nullableString(value.style),
      lighting: nullableString(value.lighting),
      visibleText: stringList(value.visibleText),
      brandElements: stringList(value.brandElements),
      suggestedRoles: stringList(value.suggestedRoles).filter(isSuggestedRole),
      technicalMetadata: {},
    };
  }
  return null;
}

function messageText(message: AssistantMessage): string {
  return message.content.flatMap((block) => {
    if (block.type === "text") return [block.text];
    if (block.type === "thinking") return [block.thinking];
    if (block.type === "toolCall") return [JSON.stringify(block.arguments)];
    return [];
  }).join("\n");
}

function stringList(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 500)).filter(Boolean).slice(0, 20);
}

function nullableString(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1_000) : null;
}

function isSuggestedRole(value: string): value is CanvasAssetSuggestedRole {
  return value === "subject" || value === "scene" || value === "style" ||
    value === "first-frame" || value === "last-frame" || value === "negative-reference";
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonObjectCandidates(text: string): string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) candidates.push(text.slice(start, index + 1));
    }
  }
  return candidates;
}
