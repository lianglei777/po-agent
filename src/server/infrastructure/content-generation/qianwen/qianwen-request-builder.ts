import type { JsonValue } from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import type { GenerationInput, PreparedGenerationAsset } from "@/server/domain/generation";
import {
  QIANWEN_WAN_3_IMAGE_TO_VIDEO_OPERATION,
  QIANWEN_WAN_3_MULTIMODAL_VIDEO_OPERATION,
  QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION,
  QIANWEN_Z_IMAGE_TEXT_TO_IMAGE_OPERATION,
  QIANWEN_WAN_2_6_TEXT_TO_IMAGE_OPERATION,
  type QianwenExecutionConfig,
} from "./qianwen-catalog";

export function resolveQianwenExecutionConfig(
  operation: string,
  value: JsonValue,
): QianwenExecutionConfig {
  const record = objectValue(value);
  if (
    record.protocol !== "dashscope-media-v1" ||
    record.operation !== operation ||
    !validProfile(operation,record)
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
  if(config.requestProfile==="messages-text-image-v1"){
    const imageParameters:Record<string,JsonValue>={size:parameters.size??(config.vendorModel==="z-image-turbo"?"1024*1536":"1280*1280"),prompt_extend:parameters.promptExtend??(config.vendorModel!=="z-image-turbo")};
    if(config.vendorModel==="wan2.6-t2i"){imageParameters.negative_prompt=parameters.negativePrompt??"";imageParameters.n=parameters.imageCount??1;imageParameters.watermark=parameters.watermark??false;}
    if(parameters.seed!==undefined&&parameters.seed!==null)imageParameters.seed=parameters.seed;
    return{model:config.vendorModel,input:{messages:[{role:"user",content:[{text:generation.prompt}]}]},parameters:imageParameters};
  }
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

function validProfile(operation:string,record:Record<string,JsonValue>):boolean{
  if(!Array.isArray(record.assetBindings))return false;
  if([QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION,QIANWEN_WAN_3_IMAGE_TO_VIDEO_OPERATION,QIANWEN_WAN_3_MULTIMODAL_VIDEO_OPERATION].includes(operation as never))return record.endpointId==="video-synthesis"&&record.vendorModel==="wan3.0-video"&&record.requestProfile==="wan-3-video-v1"&&record.resultProfile==="video-url-v1"&&record.pollIntervalMs===15_000&&record.submitMode==="async-task";
  if(operation===QIANWEN_Z_IMAGE_TEXT_TO_IMAGE_OPERATION)return record.endpointId==="multimodal-generation"&&record.vendorModel==="z-image-turbo"&&record.requestProfile==="messages-text-image-v1"&&record.resultProfile==="choices-content-image-v1"&&record.submitMode==="sync";
  if(operation===QIANWEN_WAN_2_6_TEXT_TO_IMAGE_OPERATION)return record.endpointId==="image-generation"&&record.vendorModel==="wan2.6-t2i"&&record.requestProfile==="messages-text-image-v1"&&record.resultProfile==="choices-content-image-v1"&&record.submitMode==="async-task"&&record.pollIntervalMs===5_000;
  return false;
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
