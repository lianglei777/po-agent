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
      capability: "text-to-image",
      operation: "seedream-v5-pro-text-to-image",
      defaults: { resolution: "2k", outputFormat: "png" },
      now,
    }),
    route({
      id: "runninghub-seedream-v5-pro-image-to-image",
      name: "Seedream v5 Pro 图生图片",
      capability: "image-to-image",
      operation: "seedream-v5-pro-image-to-image",
      defaults: { resolution: "2k", outputFormat: "png" },
      now,
    }),
    route({
      id: "runninghub-seedance-2-text-to-video",
      name: "Seedance 2.0 文生视频",
      capability: "text-to-video",
      operation: "seedance-2-text-to-video",
      defaults: videoDefaults({ webSearch: false }),
      now,
    }),
    route({
      id: "runninghub-seedance-2-image-to-video",
      name: "Seedance 2.0 图生视频",
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
      capability: "multimodal-to-video",
      operation: "seedance-2-multimodal-video",
      defaults: videoDefaults({
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
  capability: GenerationRoute["capability"];
  operation: string;
  defaults: GenerationRoute["defaults"];
  now: string;
}): GenerationRoute {
  return {
    id: input.id,
    name: input.name,
    capability: input.capability,
    providerId: RUNNINGHUB_PROVIDER_ID,
    providerOperation: input.operation,
    enabled: true,
    isDefault: true,
    revision: 2,
    defaults: input.defaults,
    inputSchema: runningHubInputSchema(input.capability),
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
