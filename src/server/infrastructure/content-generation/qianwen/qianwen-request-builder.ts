import type { JsonValue } from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import type { GenerationInput } from "@/server/domain/generation";
import {
  QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION,
  type QianwenExecutionConfig,
} from "./qianwen-catalog";

export function resolveQianwenExecutionConfig(
  operation: string,
  value: JsonValue,
): QianwenExecutionConfig {
  const record = objectValue(value);
  if (
    operation !== QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION ||
    record.protocol !== "dashscope-media-v1" ||
    record.operation !== operation ||
    record.endpointId !== "video-synthesis" ||
    record.vendorModel !== "wan3.0-video" ||
    record.requestProfile !== "wan-3-text-to-video-v1" ||
    record.resultProfile !== "video-url-v1" ||
    record.pollIntervalMs !== 15_000
  ) {
    throw new AppError(
      "GENERATION_OPERATION_UNSUPPORTED",
      `Qianwen operation is not supported: ${operation}`,
      400,
    );
  }
  return record as unknown as QianwenExecutionConfig;
}

export function buildQianwenRequest(
  config: QianwenExecutionConfig,
  generation: GenerationInput,
): JsonValue {
  const parameters = generation.parameters ?? {};
  const vendorParameters: Record<string, JsonValue> = {
    resolution: parameters.resolution ?? "1080P",
    ratio: parameters.aspectRatio ?? "adaptive",
    duration: parameters.durationSeconds ?? 5,
    audio: parameters.generateAudio ?? true,
    prompt_extend: parameters.promptExtend ?? true,
    watermark: parameters.watermark ?? false,
  };
  if (parameters.seed !== undefined && parameters.seed !== null) {
    vendorParameters.seed = parameters.seed;
  }
  return {
    model: config.vendorModel,
    input: { prompt: generation.prompt },
    parameters: vendorParameters,
  };
}

function objectValue(value: JsonValue): Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
