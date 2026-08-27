import type { GenerationRoute } from "@/server/domain/generation";
import { runningHubInputSchema } from "./runninghub-input-schemas";
import { runningHubRoutePresentation } from "./runninghub-route-presentations";

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
      isDefault: false,
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
      isDefault: false,
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
      isDefault: false,
      now,
    }),
    route({
      id: "runninghub-minimax-hailuo-h3-text-to-video",
      name: "MiniMax Hailuo H3 文生视频",
      product: "MiniMax Hailuo H3",
      capability: "text-to-video",
      operation: "minimax-hailuo-h3-text-to-video",
      defaults: { resolution: "768P", durationSeconds: 5, watermark: false },
      isDefault: false,
      revision: 1,
      now,
    }),
    route({
      id: "runninghub-minimax-hailuo-h3-image-to-video",
      name: "MiniMax Hailuo H3 图生视频",
      product: "MiniMax Hailuo H3",
      capability: "image-to-video",
      operation: "minimax-hailuo-h3-image-to-video",
      defaults: { resolution: "768P", durationSeconds: 5, watermark: false },
      isDefault: false,
      revision: 1,
      now,
    }),
    route({
      id: "runninghub-minimax-hailuo-h3-multimodal-video",
      name: "MiniMax Hailuo H3 多模态视频",
      product: "MiniMax Hailuo H3",
      capability: "multimodal-to-video",
      operation: "minimax-hailuo-h3-multimodal-video",
      defaults: { resolution: "768P", durationSeconds: 5, aspectRatio: "adaptive", watermark: false },
      isDefault: false,
      revision: 1,
      now,
    }),
    route({
      id: "runninghub-pixverse-v6-text-to-video",
      name: "PixVerse V6 文生视频",
      product: "PixVerse V6",
      capability: "text-to-video",
      operation: "pixverse-v6-text-to-video",
      defaults: { resolution: "720p", durationSeconds: 5, generateAudio: true, aspectRatio: "16:9" },
      isDefault: false,
      revision: 1,
      now,
    }),
    route({
      id: "runninghub-pixverse-v6-image-to-video",
      name: "PixVerse V6 图生视频",
      product: "PixVerse V6",
      capability: "image-to-video",
      operation: "pixverse-v6-image-to-video",
      defaults: { resolution: "720p", durationSeconds: 5, generateAudio: true },
      isDefault: false,
      revision: 1,
      now,
    }),
    route({
      id: "runninghub-wan-2-7-text-to-video",
      name: "Wan 2.7 文生视频",
      product: "Wan 2.7",
      capability: "text-to-video",
      operation: "wan-2-7-text-to-video",
      defaults: wan27Defaults(true),
      isDefault: false,
      revision: 1,
      now,
    }),
    route({
      id: "runninghub-wan-2-7-image-to-video",
      name: "Wan 2.7 图生视频",
      product: "Wan 2.7",
      capability: "image-to-video",
      operation: "wan-2-7-image-to-video",
      defaults: wan27Defaults(false),
      isDefault: false,
      revision: 1,
      now,
    }),
    route({
      id: "runninghub-wan-2-7-reference-to-video",
      name: "Wan 2.7 参考生视频",
      product: "Wan 2.7",
      capability: "multimodal-to-video",
      operation: "wan-2-7-reference-to-video",
      defaults: wan27Defaults(true),
      isDefault: false,
      revision: 1,
      now,
    }),
    route({
      id: "runninghub-wan-3-image-to-video",
      name: "Wan 3.0 图生视频",
      product: "Wan 3.0",
      capability: "image-to-video",
      operation: "wan-3-image-to-video",
      defaults: wan3Defaults(),
      isDefault: false,
      revision: 1,
      now,
    }),
    route({
      id: "runninghub-wan-3-reference-to-video",
      name: "Wan 3.0 参考生视频",
      product: "Wan 3.0",
      capability: "multimodal-to-video",
      operation: "wan-3-reference-to-video",
      defaults: wan3Defaults("1080P"),
      isDefault: false,
      revision: 7,
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
  isDefault?: boolean;
  revision?: number;
  now: string;
}): GenerationRoute {
  const presentation = runningHubRoutePresentation(input.operation);
  return {
    id: input.id,
    name: input.name,
    description: presentation.description,
    tags: presentation.tags,
    product: input.product,
    capability: input.capability,
    providerId: RUNNINGHUB_PROVIDER_ID,
    providerOperation: input.operation,
    enabled: false,
    isDefault: input.isDefault ?? true,
    // Prompt 最小长度属于付费执行前校验契约，提升版本以更新已持久化 Route，同时保留用户启用状态。
    revision: Math.max(input.revision ?? 5, 6),
    defaults: input.defaults,
    inputSchema: runningHubInputSchema(input.capability, input.operation),
    adapterConfig: {},
    credentialRef: RUNNINGHUB_CREDENTIAL_REF,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function wan27Defaults(withAspectRatio: boolean): GenerationRoute["defaults"] {
  return {
    resolution: "720P",
    durationSeconds: 5,
    ...(withAspectRatio ? { aspectRatio: "16:9" } : {}),
    promptExtend: false,
  };
}

function wan3Defaults(resolution = "720P"): GenerationRoute["defaults"] {
  return {
    resolution,
    durationSeconds: "auto",
    aspectRatio: "adaptive",
    generateAudio: true,
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
