import type { GenerationRoute } from "@/server/domain/generation";
import { runningHubInputSchema } from "./runninghub-input-schemas";

export const RUNNINGHUB_PROVIDER_ID = "runninghub";
export const RUNNINGHUB_CREDENTIAL_REF = "runninghub:default";

export function createRunningHubRoutes(
  now = new Date().toISOString(),
): GenerationRoute[] {
  return [
    route({
      id: "runninghub-seedream-v5-pro-text-to-image",
      name: "Seedream v5 Pro 文生图片",
      product: "Seedream v5 Pro",
      capability: "text-to-image",
      operation: "seedream-v5-pro-text-to-image",
      defaults: { resolution: "2k", outputFormat: "png" },
      now,
    }),
    route({
      id: "runninghub-seedream-v5-pro-image-to-image",
      name: "Seedream v5 Pro 图生图片",
      product: "Seedream v5 Pro",
      capability: "image-to-image",
      operation: "seedream-v5-pro-image-to-image",
      defaults: { resolution: "2k", outputFormat: "png" },
      now,
    }),
    route({
      id: "runninghub-seedance-2-text-to-video",
      name: "Seedance 2.0 文生视频",
      product: "Seedance 2.0",
      capability: "text-to-video",
      operation: "seedance-2-text-to-video",
      defaults: videoDefaults({ webSearch: false }),
      now,
    }),
    route({
      id: "runninghub-seedance-2-image-to-video",
      name: "Seedance 2.0 图生视频",
      product: "Seedance 2.0",
      capability: "image-to-video",
      operation: "seedance-2-image-to-video",
      defaults: videoDefaults({
        realPersonMode: true,
        conversionSlots: ["all"],
      }),
      now,
    }),
    route({
      id: "runninghub-seedance-2-multimodal-video",
      name: "Seedance 2.0 多模态视频",
      product: "Seedance 2.0",
      capability: "multimodal-to-video",
      operation: "seedance-2-multimodal-video",
      defaults: videoDefaults({
        realPersonMode: true,
        conversionSlots: ["all"],
      }),
      now,
    }),
    route({
      id: "runninghub-seedance-2-5-text-to-video",
      name: "Seedance 2.5 文生视频",
      product: "Seedance 2.5",
      capability: "text-to-video",
      operation: "seedance-2-5-text-to-video",
      defaults: videoDefaults25({ webSearch: false }),
      now,
    }),
    route({
      id: "runninghub-seedance-2-5-image-to-video",
      name: "Seedance 2.5 图生视频",
      product: "Seedance 2.5",
      capability: "image-to-video",
      operation: "seedance-2-5-image-to-video",
      defaults: videoDefaults25({
        realPersonMode: true,
        conversionSlots: ["all"],
      }),
      now,
    }),
    route({
      id: "runninghub-seedance-2-5-multimodal-video",
      name: "Seedance 2.5 多模态视频",
      product: "Seedance 2.5",
      capability: "multimodal-to-video",
      operation: "seedance-2-5-multimodal-video",
      defaults: videoDefaults25({
        realPersonMode: true,
        conversionSlots: ["all"],
      }),
      now,
    }),
  ];
}

function route(input: {
  id: string;
  name: string;
  product: string;
  capability: GenerationRoute["capability"];
  operation: string;
  defaults: GenerationRoute["defaults"];
  now: string;
}): GenerationRoute {
  return {
    id: input.id,
    name: input.name,
    product: input.product,
    capability: input.capability,
    providerId: RUNNINGHUB_PROVIDER_ID,
    providerOperation: input.operation,
    enabled: false,
    isDefault: true,
    // Schema 取消展示层级字段后需要提升版本，确保已持久化 Route 获得最新公开契约。
    revision: 4,
    defaults: input.defaults,
    inputSchema: runningHubInputSchema(input.capability, input.operation),
    adapterConfig: {},
    credentialRef: RUNNINGHUB_CREDENTIAL_REF,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function videoDefaults(
  extra: GenerationRoute["defaults"],
): GenerationRoute["defaults"] {
  return {
    resolution: "720p",
    durationSeconds: 5,
    generateAudio: true,
    aspectRatio: "adaptive",
    returnLastFrame: false,
    seed: -1,
    ...extra,
  };
}

// Seedance 2.5 新增 bitrateMode 与 outputFormat 参数
function videoDefaults25(
  extra: GenerationRoute["defaults"],
): GenerationRoute["defaults"] {
  return {
    ...videoDefaults({}),
    bitrateMode: "standard",
    outputFormat: "mp4",
    ...extra,
  };
}
