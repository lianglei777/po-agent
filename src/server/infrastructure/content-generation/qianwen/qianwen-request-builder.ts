import type { JsonValue } from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import type { GenerationInput, PreparedGenerationAsset } from "@/server/domain/generation";
import {
  QIANWEN_WAN_3_IMAGE_TO_VIDEO_OPERATION,
  QIANWEN_WAN_3_MULTIMODAL_VIDEO_OPERATION,
  QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION,
  type QianwenExecutionConfig,
} from "./qianwen-catalog";

export function resolveQianwenExecutionConfig(
  operation: string,
  value: JsonValue,
): QianwenExecutionConfig {
  const record = objectValue(value);
  if (
    ![QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION,QIANWEN_WAN_3_IMAGE_TO_VIDEO_OPERATION,QIANWEN_WAN_3_MULTIMODAL_VIDEO_OPERATION].includes(operation as never) ||
    record.protocol !== "dashscope-media-v1" ||
    record.operation !== operation ||
    record.endpointId !== "video-synthesis" ||
    record.vendorModel !== "wan3.0-video" ||
    record.requestProfile !== "wan-3-video-v1" ||
    record.resultProfile !== "video-url-v1" ||
    record.pollIntervalMs !== 15_000 ||
    !Array.isArray(record.assetBindings)
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
  assets: PreparedGenerationAsset[] = [],
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
  const media = config.assetBindings.flatMap((binding) =>
    ordered(assets, binding.slot)
      .slice(0, binding.cardinality === "first" ? 1 : undefined)
      .map((asset) => ({ type: binding.mediaType, url: assetUrl(asset, config.vendorModel) })),
  );
  return {
    model: config.vendorModel,
    input: { prompt: generation.prompt, ...(media.length ? { media } : {}) },
    parameters: vendorParameters,
  };
}

function ordered(assets: PreparedGenerationAsset[], slot: string) {
  return assets.map((asset,index)=>({asset,index})).filter(({asset})=>asset.slot===slot)
    .sort((a,b)=>(a.asset.order??a.index)-(b.asset.order??b.index)).map(({asset})=>asset);
}
function assetUrl(asset: PreparedGenerationAsset, model: string): string {
  const reference=objectValue(asset.reference);
  if(reference.kind!=="dashscope-oss"||typeof reference.url!=="string"||reference.vendorModel!==model||!reference.url.startsWith("oss://dashscope-instant/")){
    throw new AppError("GENERATION_PROVIDER_PROTOCOL_ERROR","Qianwen prepared asset is invalid for the frozen model",500);
  }
  return reference.url;
}

function objectValue(value: JsonValue): Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
