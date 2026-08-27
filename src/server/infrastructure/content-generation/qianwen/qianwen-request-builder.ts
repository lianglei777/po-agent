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
  if(config.requestProfile==="legacy-prompt-image-v1"){
    return{model:config.vendorModel,input:{prompt:generation.prompt,...(parameters.negativePrompt?{negative_prompt:parameters.negativePrompt}:{})},parameters:{size:parameters.size,n:parameters.imageCount,prompt_extend:parameters.promptExtend,watermark:parameters.watermark,...(parameters.seed!==undefined?{seed:parameters.seed}:{})}};
  }
  const vendorParameters: Record<string, JsonValue> = {
    resolution: parameters.resolution ?? defaultResolution(config.requestProfile),
    duration: parameters.durationSeconds ?? 5,
    watermark: parameters.watermark ?? (config.requestProfile === "happyhorse-video-v1"),
  };
  if (parameters.aspectRatio !== undefined) vendorParameters.ratio = parameters.aspectRatio;
  if (config.requestProfile === "wan-3-video-v1") {
    vendorParameters.ratio ??= "adaptive";
    vendorParameters.audio = parameters.generateAudio ?? true;
    vendorParameters.prompt_extend = parameters.promptExtend ?? true;
  }
  if (config.requestProfile === "wan-2-7-video-v1") {
    vendorParameters.prompt_extend = parameters.promptExtend ?? true;
  }
  if (parameters.seed !== undefined && parameters.seed !== null) {
    vendorParameters.seed = parameters.seed;
  }
  const mediaBindings = config.assetBindings.filter(binding => binding.mediaType !== "audio_url");
  const media = mediaBindings.flatMap((binding) =>
    ordered(assets, binding.slot)
      .slice(0, binding.cardinality === "first" ? 1 : undefined)
      .map((asset) => ({ type: binding.mediaType, url: assetUrl(asset, config.vendorModel) })),
  );
  const audioBinding = config.assetBindings.find(binding => binding.mediaType === "audio_url");
  const audioAsset = audioBinding ? ordered(assets,audioBinding.slot)[0] : undefined;
  const input:Record<string,JsonValue> = {
    prompt: generation.prompt,
    ...(parameters.negativePrompt ? { negative_prompt: parameters.negativePrompt } : {}),
    ...(audioAsset ? { audio_url: assetUrl(audioAsset,config.vendorModel) } : {}),
    ...(media.length ? { media } : {}),
  };
  return {
    model: config.vendorModel,
    input,
    parameters: vendorParameters,
  };
}

function validProfile(operation:string,record:Record<string,JsonValue>):boolean{
  if(!Array.isArray(record.assetBindings))return false;
  if([QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION,QIANWEN_WAN_3_IMAGE_TO_VIDEO_OPERATION,QIANWEN_WAN_3_MULTIMODAL_VIDEO_OPERATION].includes(operation as never))return record.endpointId==="video-synthesis"&&record.vendorModel==="wan3.0-video"&&record.requestProfile==="wan-3-video-v1"&&record.resultProfile==="video-url-v1"&&record.pollIntervalMs===15_000&&record.submitMode==="async-task";
  if(operation===QIANWEN_Z_IMAGE_TEXT_TO_IMAGE_OPERATION)return record.endpointId==="multimodal-generation"&&record.vendorModel==="z-image-turbo"&&record.requestProfile==="messages-text-image-v1"&&record.resultProfile==="choices-content-image-v1"&&record.submitMode==="sync";
  if(operation===QIANWEN_WAN_2_6_TEXT_TO_IMAGE_OPERATION)return record.endpointId==="image-generation"&&record.vendorModel==="wan2.6-t2i"&&record.requestProfile==="messages-text-image-v1"&&record.resultProfile==="choices-content-image-v1"&&record.submitMode==="async-task"&&record.pollIntervalMs===5_000;
  const legacy=LEGACY_IMAGE_PROFILES[operation];
  if(legacy)return record.endpointId==="legacy-image-synthesis"&&record.vendorModel===legacy&&record.requestProfile==="legacy-prompt-image-v1"&&record.resultProfile==="legacy-results-image-v1"&&record.submitMode==="async-task"&&record.pollIntervalMs===5_000;
  const expected=VIDEO_PROFILES[operation];
  if(expected)return record.endpointId==="video-synthesis"&&record.vendorModel===expected.model&&record.requestProfile===expected.profile&&record.resultProfile==="video-url-v1"&&record.submitMode==="async-task"&&record.pollIntervalMs===15_000;
  return false;
}

const VIDEO_PROFILES:Record<string,{model:string;profile:string}>={
  "wan-2-7-text-to-video":{model:"wan2.7-t2v-2026-06-12",profile:"wan-2-7-video-v1"},
  "wan-2-7-image-to-video":{model:"wan2.7-i2v-2026-04-25",profile:"wan-2-7-video-v1"},
  "wan-2-7-reference-to-video":{model:"wan2.7-r2v-2026-06-12",profile:"wan-2-7-video-v1"},
  "happyhorse-text-to-video":{model:"happyhorse-1.1-t2v",profile:"happyhorse-video-v1"},
  "happyhorse-image-to-video":{model:"happyhorse-1.1-i2v",profile:"happyhorse-video-v1"},
  "happyhorse-reference-to-video":{model:"happyhorse-1.1-r2v",profile:"happyhorse-video-v1"},
  "minimax-h3-text-to-video":{model:"MiniMax/MiniMax-H3",profile:"minimax-h3-video-v1"},
  "minimax-h3-image-to-video":{model:"MiniMax/MiniMax-H3",profile:"minimax-h3-video-v1"},
  "minimax-h3-multimodal-video":{model:"MiniMax/MiniMax-H3",profile:"minimax-h3-video-v1"},
};

const LEGACY_IMAGE_PROFILES:Record<string,string>={
  "wan-2-5-text-to-image":"wan2.5-t2i-preview",
  "wan-2-2-plus-text-to-image":"wan2.2-t2i-plus",
  "wan-2-2-flash-text-to-image":"wan2.2-t2i-flash",
  "wanx-2-1-plus-text-to-image":"wanx2.1-t2i-plus",
  "wanx-2-1-turbo-text-to-image":"wanx2.1-t2i-turbo",
  "wanx-2-0-turbo-text-to-image":"wanx2.0-t2i-turbo",
};

function defaultResolution(profile:QianwenExecutionConfig["requestProfile"]):string {
  return profile==="minimax-h3-video-v1"?"768P":"1080P";
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
