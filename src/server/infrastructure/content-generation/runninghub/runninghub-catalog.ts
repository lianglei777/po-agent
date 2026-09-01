import type {
  GenerationAssetSlot,
  GenerationInputSchema,
  GenerationParameterField,
  JsonValue,
} from "@/contracts/generation";
import type {
  GenerationCapability,
  GenerationRoute,
} from "@/server/domain/generation";
import {
  RUNNINGHUB_CREDENTIAL_REF,
  RUNNINGHUB_PROVIDER_ID,
} from "./runninghub-provider-constants";
import { withGenerationParameterPresentation } from "../generation-parameter-presentation";

const MIB = 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime"];
const AUDIO_TYPES = ["audio/mpeg", "audio/wav", "audio/mp4"];

export type RunningHubRequestField =
  | {
      source: "prompt";
      vendorKey: string;
    }
  | {
      source: "parameter";
      key: string;
      vendorKey: string;
      fallback: JsonValue;
      serialize?: "identity" | "string";
      omitWhenEmpty?: boolean;
    }
  | {
      source: "asset";
      key: string;
      vendorKey: string;
      serialize: "first" | "list";
    };

export interface RunningHubExecutionConfig {
  protocol: "runninghub-standard-v1";
  operation: string;
  endpoint: string;
  fields: RunningHubRequestField[];
}

export interface RunningHubOperationDefinition {
  operation: string;
  route: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    product: string;
    capability: GenerationCapability;
    navigationLabel?: string;
    revision: number;
    catalogDefault?: boolean;
    defaultParameterKeys?: string[];
  };
  inputSchema: GenerationInputSchema;
  protocol: {
    version: 1;
    endpoint: string;
    fields: RunningHubRequestField[];
  };
}

const prompt = (): RunningHubRequestField => ({
  source: "prompt",
  vendorKey: "prompt",
});

const parameter = (
  key: string,
  vendorKey = key,
  fallback: JsonValue = null,
  serialize: "identity" | "string" = "identity",
): RunningHubRequestField => ({
  source: "parameter",
  key,
  vendorKey,
  fallback,
  serialize,
});

const asset = (
  key: string,
  vendorKey = key,
  serialize: "first" | "list" = "first",
): RunningHubRequestField => ({ source: "asset", key, vendorKey, serialize });

const COMMON_VIDEO_FIELDS = [
  parameter("resolution", "resolution", "720p"),
  parameter("durationSeconds", "duration", 5, "string"),
  parameter("generateAudio", "generateAudio", true),
  parameter("aspectRatio", "ratio", "adaptive"),
  parameter("returnLastFrame", "returnLastFrame", false),
  parameter("seed", "seed", -1),
];

const COMMON_VIDEO_25_FIELDS = [
  ...COMMON_VIDEO_FIELDS,
  parameter("bitrateMode", "bitrateMode", "standard"),
  parameter("outputFormat", "outputFormat", "mp4"),
];

const MINIMAX_FIELDS = [
  parameter("resolution", "resolution", "768P"),
  parameter("durationSeconds", "duration", 5, "string"),
  parameter("watermark", "aigc_watermark", false),
];

const PIXVERSE_FIELDS = [
  parameter("resolution", "resolution", "720p"),
  parameter("durationSeconds", "duration", 5),
  parameter("generateAudio", "generateAudioSwitch", true),
];

const WAN_27_FIELDS = [
  parameter("negativePrompt", "negativePrompt", null),
  parameter("resolution", "resolution", "720P"),
  parameter("durationSeconds", "duration", 5, "string"),
  parameter("promptExtend", "promptExtend", false),
  parameter("seed", "seed", null),
];

const WAN_3_FIELDS = [
  parameter("resolution", "resolution", "720P"),
  parameter("aspectRatio", "aspectRatio", "adaptive"),
  parameter("durationSeconds", "duration", "auto", "string"),
  parameter("generateAudio", "audio", true),
  parameter("seed", "seed", null),
];

export const RUNNINGHUB_OPERATIONS: RunningHubOperationDefinition[] = validateCatalog([
  defineOperation({
    operation: "seedream-v5-pro-text-to-image",
    route: routeMeta({
      id: "runninghub-seedream-v5-pro-text-to-image",
      name: "Seedream v5 Pro 文生图片",
      description: "纯文本驱动的商用图像生成接口，支持 1024–2048 自定义分辨率、PNG/JPG 输出与多语种文字渲染，适合海报、产品图和信息长图。",
      tags: ["单张输出", "PNG/JPG", "最高2K", "多语种文字"],
      product: "Seedream v5 Pro",
      capability: "text-to-image",
      catalogDefault: true,
      defaultParameterKeys: ["resolution", "outputFormat"],
    }),
    inputSchema: imageSchema(),
    protocol: standard("/openapi/v2/seedream-v5-pro/text-to-image", [
      prompt(),
      parameter("resolution", "resolution", "2k"),
      parameter("width", "width", null),
      parameter("height", "height", null),
      parameter("outputFormat", "outputFormat", "png"),
    ]),
  }),
  defineOperation({
    operation: "seedream-v5-pro-image-to-image",
    route: routeMeta({
      id: "runninghub-seedream-v5-pro-image-to-image",
      name: "Seedream v5 Pro 图生图片",
      description: "多参考图图像编辑接口，单次最多上传 10 张参考图，支持原图结构锁定、局部重绘、风格迁移和透明素材导出，适合人像改风格、产品改版、多素材融合与老照片修复。",
      tags: ["最多10张参考图", "结构锁定", "重绘强度可调", "透明图层导出"],
      product: "Seedream v5 Pro",
      capability: "image-to-image",
      catalogDefault: true,
      defaultParameterKeys: ["resolution", "outputFormat"],
    }),
    inputSchema: {
      ...imageSchema(),
      assets: [mediaSlot("imageUrls", "参考图片", "image", 10, 10 * MIB, IMAGE_TYPES, true)],
    },
    protocol: standard("/openapi/v2/seedream-v5-pro/image-to-image", [
      prompt(),
      asset("imageUrls", "imageUrls", "list"),
      parameter("resolution", "resolution", "2k"),
      parameter("width", "width", null),
      parameter("height", "height", null),
      parameter("outputFormat", "outputFormat", "png"),
    ]),
  }),
  ...seedance20Operations(),
  ...seedance20VariantOperations(),
  ...seedance25Operations(),
  ...minimaxOperations(),
  ...pixVerseOperations(),
  ...wan27Operations(),
  ...wan3Operations(),
]);

export function createRunningHubRoutes(
  now = new Date().toISOString(),
): GenerationRoute[] {
  return RUNNINGHUB_OPERATIONS.map((definition) => ({
    id: definition.route.id,
    name: definition.route.name,
    navigationLabel: definition.route.navigationLabel ?? definition.route.capability,
    description: definition.route.description,
    tags: definition.route.tags,
    product: definition.route.product,
    capability: definition.route.capability,
    providerId: RUNNINGHUB_PROVIDER_ID,
    providerOperation: definition.operation,
    enabled: false,
    isDefault: definition.route.catalogDefault ?? false,
    revision: definition.route.revision,
    defaults: routeDefaults(definition),
    inputSchema: withGenerationParameterPresentation(definition.inputSchema),
    adapterConfig: executionConfig(definition) as unknown as JsonValue,
    credentialRef: RUNNINGHUB_CREDENTIAL_REF,
    createdAt: now,
    updatedAt: now,
  }));
}

export function runningHubExecutionConfigForOperation(
  operation: string,
): RunningHubExecutionConfig | undefined {
  const definition = RUNNINGHUB_OPERATIONS.find((item) => item.operation === operation);
  return definition ? executionConfig(definition) : undefined;
}

function seedance20Operations(): RunningHubOperationDefinition[] {
  return [
    defineOperation({
      operation: "seedance-2-text-to-video",
      route: routeMeta({
        id: "runninghub-seedance-2-text-to-video",
        name: "Seedance 2.0 文生视频",
        description: "Seedance 2.0 文生视频，仅需文本提示词即可生成 4–15 秒高质量视频，支持多种画幅、有声视频和联网搜索增强。",
        tags: ["高品质生成", "纯文本驱动", "4–15秒", "联网增强", "有声视频"],
        product: "Seedance 2.0",
        capability: "text-to-video",
        catalogDefault: true,
      }),
      inputSchema: textToVideoSchema(false),
      protocol: standard("/openapi/v2/rhart-video/sparkvideo-2.0/text-to-video", [
        prompt(), ...COMMON_VIDEO_FIELDS, parameter("webSearch", "webSearch", false),
      ]),
    }),
    defineOperation({
      operation: "seedance-2-image-to-video",
      route: routeMeta({
        id: "runninghub-seedance-2-image-to-video",
        name: "Seedance 2.0 图生视频",
        description: "Seedance 2.0 图生视频，支持首帧和首尾帧两种驱动方式，将静态图片转换为 4–15 秒动态影像，并可生成有声视频。",
        tags: ["高品质生成", "首帧/首尾帧", "4–15秒", "有声视频", "多种画幅"],
        product: "Seedance 2.0",
        capability: "image-to-video",
        catalogDefault: true,
      }),
      inputSchema: imageToVideoSchema(false),
      protocol: standard("/openapi/v2/rhart-video/sparkvideo-2.0/image-to-video", [
        prompt(), ...COMMON_VIDEO_FIELDS,
        asset("firstFrameUrl"), asset("lastFrameUrl"),
        parameter("realPersonMode", "realPersonMode", true),
        parameter("conversionSlots", "conversionSlots", ["all"]),
      ]),
    }),
    defineOperation({
      operation: "seedance-2-multimodal-video",
      route: routeMeta({
        id: "runninghub-seedance-2-multimodal-video",
        name: "Seedance 2.0 多模态视频",
        description: "Seedance 2.0 多模态视频，面向高品质生成，支持文本、图片、视频和音频组合参考，以及视频编辑和续写。",
        tags: ["高品质生成", "多模态参考", "视频编辑与续写", "4–15秒"],
        product: "Seedance 2.0",
        capability: "multimodal-to-video",
        catalogDefault: true,
      }),
      inputSchema: multimodalVideoSchema(false),
      protocol: standard("/openapi/v2/rhart-video/sparkvideo-2.0/multimodal-video", [
        prompt(), ...COMMON_VIDEO_FIELDS,
        asset("imageUrls", "imageUrls", "list"),
        asset("videoUrls", "videoUrls", "list"),
        asset("audioUrls", "audioUrls", "list"),
        parameter("realPersonMode", "realPersonMode", true),
        parameter("conversionSlots", "conversionSlots", ["all"]),
      ]),
    }),
  ];
}

function seedance20VariantOperations(): RunningHubOperationDefinition[] {
  return [
    defineOperation({
      operation: "seedance-2-mini-image-to-video",
      route: routeMeta({
        id: "runninghub-seedance-2-mini-image-to-video",
        name: "Seedance 2.0 Mini 图生视频",
        description: "Seedance 2.0 Mini 图生视频，适合低成本批量将静态图片转为 4–15 秒动态视频，支持首帧或首尾帧、有声视频和高清超分输出。",
        tags: ["高性价比", "批量生产", "首帧/首尾帧", "有声视频", "最高4K超分"],
        product: "Seedance 2.0 Mini",
        capability: "image-to-video",
      }),
      inputSchema: seedance20VariantImageSchema("mini"),
      protocol: standard("/openapi/v2/rhart-video/sparkvideo-2.0/image-to-video", [
        prompt(), ...COMMON_VIDEO_FIELDS,
        asset("firstFrameUrl"), asset("lastFrameUrl"),
        parameter("realPersonMode", "realPersonMode", true),
        parameter("conversionSlots", "conversionSlots", ["all"]),
      ]),
    }),
    defineOperation({
      operation: "seedance-2-fast-image-to-video",
      route: routeMeta({
        id: "runninghub-seedance-2-fast-image-to-video",
        name: "Seedance 2.0 Fast 图生视频",
        description: "Seedance 2.0 Fast 图生视频，侧重生成速度与性价比，支持首帧或首尾帧驱动、4–15 秒时长、有声视频和多种画幅。",
        tags: ["快速生成", "高性价比", "首帧/首尾帧", "有声视频", "多种画幅"],
        product: "Seedance 2.0 Fast",
        capability: "image-to-video",
      }),
      inputSchema: seedance20VariantImageSchema("fast"),
      protocol: standard("/openapi/v2/rhart-video/sparkvideo-2.0-fast/image-to-video", [
        prompt(), ...COMMON_VIDEO_FIELDS,
        asset("firstFrameUrl"), asset("lastFrameUrl"),
        parameter("realPersonMode", "realPersonMode", true),
        parameter("conversionSlots", "conversionSlots", ["all"]),
      ]),
    }),
    defineOperation({
      operation: "seedance-2-mini-multimodal-video",
      route: routeMeta({
        id: "runninghub-seedance-2-mini-multimodal-video",
        name: "Seedance 2.0 Mini 多模态视频",
        description: "Seedance 2.0 Mini 多模态视频，面向高频批量创作，支持图片、视频和音频组合参考，以及视频编辑和续写。",
        tags: ["高性价比", "批量生产", "多模态参考", "视频编辑与续写", "最高4K超分"],
        product: "Seedance 2.0 Mini",
        capability: "multimodal-to-video",
      }),
      inputSchema: seedance20VariantMultimodalSchema("mini"),
      protocol: standard("/openapi/v2/rhart-video/sparkvideo-2.0-mini/multimodal-video", [
        prompt(), ...COMMON_VIDEO_FIELDS,
        asset("imageUrls", "imageUrls", "list"),
        asset("videoUrls", "videoUrls", "list"),
        asset("audioUrls", "audioUrls", "list"),
        parameter("realPersonMode", "realPersonMode", true),
        parameter("conversionSlots", "conversionSlots", ["all"]),
      ]),
    }),
    defineOperation({
      operation: "seedance-2-fast-multimodal-video",
      route: routeMeta({
        id: "runninghub-seedance-2-fast-multimodal-video",
        name: "Seedance 2.0 Fast 多模态视频",
        description: "Seedance 2.0 Fast 多模态视频，侧重快速生成与性价比，支持图片、视频和音频组合参考，以及视频编辑和续写。",
        tags: ["快速生成", "高性价比", "多模态参考", "视频编辑与续写"],
        product: "Seedance 2.0 Fast",
        capability: "multimodal-to-video",
      }),
      inputSchema: seedance20VariantMultimodalSchema("fast"),
      protocol: standard("/openapi/v2/rhart-video/sparkvideo-2.0-fast/multimodal-video", [
        prompt(), ...COMMON_VIDEO_FIELDS,
        asset("imageUrls", "imageUrls", "list"),
        asset("videoUrls", "videoUrls", "list"),
        asset("audioUrls", "audioUrls", "list"),
        parameter("realPersonMode", "realPersonMode", true),
        parameter("conversionSlots", "conversionSlots", ["all"]),
      ]),
    }),
  ];
}

function seedance25Operations(): RunningHubOperationDefinition[] {
  return [
    defineOperation({
      operation: "seedance-2-5-text-to-video",
      route: routeMeta({
        id: "runninghub-seedance-2-5-text-to-video",
        name: "Seedance 2.5 文生视频",
        description: "Seedance 2.5 标准版文生视频，支持原生 480p/720p、高清超分、音画同出以及灵活的画幅和时长，按 Token 计费。",
        tags: ["Token计费", "音画同出", "最高4K超分", "智能时长", "多种画幅"],
        product: "Seedance 2.5",
        capability: "text-to-video",
      }),
      inputSchema: textToVideoSchema(true),
      protocol: standard("/openapi/v2/bytedance/seedance-2.5-token/text-to-video", [
        prompt(), ...COMMON_VIDEO_25_FIELDS, parameter("webSearch", "webSearch", false),
      ]),
    }),
    defineOperation({
      operation: "seedance-2-5-image-to-video",
      route: routeMeta({
        id: "runninghub-seedance-2-5-image-to-video",
        name: "Seedance 2.5 图生视频",
        description: "Seedance 2.5 标准版图生视频，支持首帧或首尾帧驱动、原生 480p/720p、高清超分和音画同出，按 Token 计费。",
        tags: ["Token计费", "首帧/首尾帧", "音画同出", "最高4K超分", "智能时长"],
        product: "Seedance 2.5",
        capability: "image-to-video",
      }),
      inputSchema: imageToVideoSchema(true),
      protocol: standard("/openapi/v2/bytedance/seedance-2.5-token/image-to-video", [
        prompt(), ...COMMON_VIDEO_25_FIELDS,
        asset("firstFrameUrl"), asset("lastFrameUrl"),
        parameter("realPersonMode", "realPersonMode", true),
        parameter("conversionSlots", "conversionSlots", ["all"]),
      ]),
    }),
    defineOperation({
      operation: "seedance-2-5-multimodal-video",
      route: routeMeta({
        id: "runninghub-seedance-2-5-multimodal-video",
        name: "Seedance 2.5 多模态视频",
        description: "Seedance 2.5 标准版多模态视频，支持图片、视频和音频组合参考，也支持 Prompt 与纯音频驱动，按 Token 计费。",
        tags: ["Token计费", "音画同出", "最高4K超分", "智能时长", "多模态参考"],
        product: "Seedance 2.5",
        capability: "multimodal-to-video",
      }),
      inputSchema: multimodalVideoSchema(true),
      protocol: standard("/openapi/v2/bytedance/seedance-2.5-token/multimodal-video", [
        prompt(), ...COMMON_VIDEO_25_FIELDS,
        asset("imageUrls", "imageUrls", "list"),
        asset("videoUrls", "videoUrls", "list"),
        asset("audioUrls", "audioUrls", "list"),
        parameter("realPersonMode", "realPersonMode", true),
        parameter("conversionSlots", "conversionSlots", ["all"]),
      ]),
    }),
  ];
}

function minimaxOperations(): RunningHubOperationDefinition[] {
  const common = {
    product: "MiniMax Hailuo H3",
    tags: ["2K直出", "5–15秒"],
  };
  return [
    defineOperation({
      operation: "minimax-hailuo-h3-text-to-video",
      route: routeMeta({
        id: "runninghub-minimax-hailuo-h3-text-to-video",
        name: "MiniMax Hailuo H3 文生视频",
        description: "MiniMax H3（Hailuo-03）文生视频，支持 2K 直出、5–15 秒时长和多种画幅。",
        tags: ["文生视频", ...common.tags],
        product: common.product,
        capability: "text-to-video",
      }),
      inputSchema: minimaxSchema("text"),
      protocol: standard("/openapi/v2/minimax/hailuo-h3/text-to-video", [
        prompt(), ...MINIMAX_FIELDS, parameter("aspectRatio", "ratio", null),
      ]),
    }),
    defineOperation({
      operation: "minimax-hailuo-h3-image-to-video",
      route: routeMeta({
        id: "runninghub-minimax-hailuo-h3-image-to-video",
        name: "MiniMax Hailuo H3 图生视频",
        description: "MiniMax H3（Hailuo-03）图生视频，支持首帧、尾帧或首尾帧驱动，宽高比由输入图决定，可 2K 直出。",
        tags: ["首帧/尾帧", ...common.tags],
        product: common.product,
        capability: "image-to-video",
      }),
      inputSchema: minimaxSchema("image"),
      protocol: standard("/openapi/v2/minimax/hailuo-h3/image-to-video", [
        prompt(), ...MINIMAX_FIELDS, asset("firstFrameUrl"), asset("lastFrameUrl"),
      ]),
    }),
    defineOperation({
      operation: "minimax-hailuo-h3-multimodal-video",
      route: routeMeta({
        id: "runninghub-minimax-hailuo-h3-multimodal-video",
        name: "MiniMax Hailuo H3 多模态视频",
        description: "MiniMax H3（Hailuo-03）多模态参考生视频，支持文本与参考图、参考视频、参考音频组合驱动，可 2K 直出。",
        tags: ["图/视/音参考", ...common.tags],
        product: common.product,
        capability: "multimodal-to-video",
      }),
      inputSchema: minimaxSchema("multimodal"),
      protocol: standard("/openapi/v2/minimax/hailuo-h3/multimodal-to-video", [
        prompt(), ...MINIMAX_FIELDS,
        asset("imageUrls", "imageUrls", "list"),
        asset("videoUrls", "videoUrls", "list"),
        asset("audioUrls", "audioUrls", "list"),
        parameter("aspectRatio", "ratio", "adaptive"),
      ]),
    }),
  ];
}

function pixVerseOperations(): RunningHubOperationDefinition[] {
  return [
    defineOperation({
      operation: "pixverse-v6-text-to-video",
      route: routeMeta({
        id: "runninghub-pixverse-v6-text-to-video",
        name: "PixVerse V6 文生视频",
        description: "PixVerse V6 文生视频支持 360p 至 1080p、1–15 秒时长和八种画幅；Thinking 模式可优化复杂描述，并可同步生成音频。",
        tags: ["电影级画质", "1–15秒", "最高1080p", "Thinking模式", "同步音频"],
        product: "PixVerse V6",
        capability: "text-to-video",
      }),
      inputSchema: pixVerseSchema("text"),
      protocol: standard("/openapi/v2/pixverse-v6/text-to-video", [
        prompt(), ...PIXVERSE_FIELDS, parameter("aspectRatio", "aspectRatio", null),
      ]),
    }),
    defineOperation({
      operation: "pixverse-v6-image-to-video",
      route: routeMeta({
        id: "runninghub-pixverse-v6-image-to-video",
        name: "PixVerse V6 图生视频",
        description: "PixVerse V6 图生视频可保持参考图片的主体外观与构图，生成自然流畅的视频，支持提示增强、Thinking 模式和同步音频。",
        tags: ["图片精准控制", "自然运动", "1–15秒", "最高1080p", "Thinking模式"],
        product: "PixVerse V6",
        capability: "image-to-video",
      }),
      inputSchema: pixVerseSchema("image"),
      protocol: standard("/openapi/v2/pixverse-v6/image-to-video", [
        prompt(), ...PIXVERSE_FIELDS, asset("firstFrameUrl", "imageUrl"),
      ]),
    }),
  ];
}

function wan27Operations(): RunningHubOperationDefinition[] {
  return [
    defineOperation({
      operation: "wan-2-7-text-to-video",
      route: routeMeta({
        id: "runninghub-wan-2-7-text-to-video",
        name: "Wan 2.7 文生视频",
        description: "Wan 2.7 文生视频可将自然语言转为动态稳定的高清影像，支持音频节奏、负向提示词和智能提示词扩展。",
        tags: ["电影级画质", "音频节奏", "720P/1080P", "负向提示词", "提示词扩展"],
        product: "Wan 2.7",
        capability: "text-to-video",
      }),
      inputSchema: wan27Schema("text"),
      protocol: standard("/openapi/v2/alibaba/wan-2.7/text-to-video", [
        prompt(), ...WAN_27_FIELDS, asset("audioUrls", "audioUrl"),
        parameter("aspectRatio", "aspectRatio", "16:9"),
      ]),
    }),
    defineOperation({
      operation: "wan-2-7-image-to-video",
      route: routeMeta({
        id: "runninghub-wan-2-7-image-to-video",
        name: "Wan 2.7 图生视频",
        description: "Wan 2.7 图生视频支持单张首帧或首尾双帧控制，结合文本生成平滑过渡的高清画面，并支持音频驱动与负向提示词。",
        tags: ["首帧/首尾帧", "声画同步", "720P/1080P", "负向提示词", "最长15秒"],
        product: "Wan 2.7",
        capability: "image-to-video",
      }),
      inputSchema: wan27Schema("image"),
      protocol: standard("/openapi/v2/alibaba/wan-2.7/image-to-video", [
        prompt(), ...WAN_27_FIELDS,
        asset("firstFrameUrl", "firstImageUrl"), asset("lastFrameUrl", "lastImageUrl"),
        asset("audioUrls", "audioUrl"),
      ]),
    }),
    defineOperation({
      operation: "wan-2-7-reference-to-video",
      route: routeMeta({
        id: "runninghub-wan-2-7-reference-to-video",
        name: "Wan 2.7 参考生视频",
        description: "Wan 2.7 参考生视频可混合输入图片和视频，在新场景中保持角色、道具与视觉风格一致，支持最多 5 个参考素材。",
        tags: ["1–5个参考素材", "角色一致性", "多模态参考", "720P/1080P", "负向提示词"],
        product: "Wan 2.7",
        capability: "multimodal-to-video",
        navigationLabel: "reference-to-video",
      }),
      inputSchema: wan27Schema("reference"),
      protocol: standard("/openapi/v2/alibaba/wan-2.7/reference-to-video", [
        prompt(), ...WAN_27_FIELDS,
        asset("imageUrls", "imageUrls", "list"), asset("videoUrls", "videoUrls", "list"),
        asset("audioUrls", "audioUrl"), parameter("aspectRatio", "aspectRatio", "16:9"),
      ]),
    }),
  ];
}

function wan3Operations(): RunningHubOperationDefinition[] {
  return [
    defineOperation({
      operation: "wan-3-image-to-video",
      route: routeMeta({
        id: "runninghub-wan-3-image-to-video",
        name: "Wan 3.0 图生视频",
        description: "Wan 3.0 图生视频支持首帧和首尾帧控制，原生最长 30 秒，可选智能时长、多个分辨率、自适应画幅和有声输出。",
        tags: ["首帧/首尾帧", "最长30秒", "智能时长", "最高1080P", "有声输出"],
        product: "Wan 3.0",
        capability: "image-to-video",
      }),
      inputSchema: wan3Schema("image"),
      protocol: standard("/openapi/v2/alibaba/wan-3.0/image-to-video", [
        prompt(), ...WAN_3_FIELDS, asset("firstFrameUrl"), asset("lastFrameUrl"),
      ]),
    }),
    defineOperation({
      operation: "wan-3-reference-to-video",
      route: routeMeta({
        id: "runninghub-wan-3-reference-to-video",
        name: "Wan 3.0 参考生视频",
        description: "Wan 3.0 参考生视频支持图片、视频、音频、文档和网页组合参考，提供长时生成、深度思考和有声输出。",
        tags: ["全能多模态", "最长30秒", "智能时长", "文档/网页解析", "有声输出"],
        product: "Wan 3.0",
        capability: "multimodal-to-video",
        navigationLabel: "reference-to-video",
      }),
      inputSchema: wan3Schema("reference"),
      protocol: standard("/openapi/v2/alibaba/wan-3.0/reference-to-video", [
        prompt(), ...WAN_3_FIELDS,
        asset("imageUrls", "imageUrls", "list"), asset("videoUrls", "videoUrls", "list"),
        asset("audioUrls", "audioUrls", "list"),
        parameter("fileUrl", "fileUrl", null), parameter("linkUrl", "linkUrl", null),
      ]),
    }),
  ];
}

function imageSchema(): GenerationInputSchema {
  return {
    prompt: { required: true, minLength: 5, maxLength: 5_000 },
    parameters: [
      selectField("resolution", "分辨率", ["1k", "2k"], "2k"),
      selectField("outputFormat", "输出格式", ["png", "jpeg"], "png"),
      numberField("width", "宽度", 1024, 240, 8192),
      numberField("height", "高度", 1024, 240, 8192),
    ],
  };
}

function textToVideoSchema(version25: boolean): GenerationInputSchema {
  return {
    prompt: { required: true, maxLength: 20_480 },
    parameters: [
      ...videoFields(version25),
      booleanField("webSearch", "联网搜索增强", false),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
  };
}

function imageToVideoSchema(version25: boolean): GenerationInputSchema {
  return {
    prompt: { required: false, maxLength: 20_480 },
    parameters: [
      ...videoFields(version25, version25 ? ["adaptive"] : undefined),
      booleanField("realPersonMode", "真人模式", true),
      multiSelectField("conversionSlots", "素材资产化范围", [
        ["全部首尾帧", "all"], ["首帧", "firstFrameUrl"], ["尾帧", "lastFrameUrl"],
      ]),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
    assets: [
      mediaSlot("firstFrameUrl", "首帧图片", "image", 1, 30 * MIB, IMAGE_TYPES, true),
      mediaSlot("lastFrameUrl", "尾帧图片", "image", 1, 30 * MIB, IMAGE_TYPES),
    ],
  };
}

function multimodalVideoSchema(version25: boolean): GenerationInputSchema {
  const imageCount = version25 ? 30 : 9;
  const mediaCount = version25 ? 10 : 3;
  const referenceOptions: Array<[string, string]> = [
    ["全部素材", "all"],
    ...Array.from({ length: imageCount }, (_, index) => [`图片 ${index + 1}`, `image${index + 1}`] as [string, string]),
    ...Array.from({ length: mediaCount }, (_, index) => [`视频 ${index + 1}`, `video${index + 1}`] as [string, string]),
  ];
  return {
    prompt: { required: true, maxLength: 20_480 },
    parameters: [
      ...videoFields(version25),
      booleanField("realPersonMode", "真人模式", true),
      multiSelectField("conversionSlots", "素材资产化范围", referenceOptions),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
    assets: [
      mediaSlot("imageUrls", "参考图片", "image", imageCount, version25 ? 50 * MIB : 30 * MIB, IMAGE_TYPES),
      mediaSlot("videoUrls", "参考视频", "video", mediaCount, 50 * MIB, VIDEO_TYPES),
      mediaSlot("audioUrls", "参考音频", "audio", mediaCount, 50 * MIB, AUDIO_TYPES),
    ],
  };
}

function seedance20VariantImageSchema(variant: "mini" | "fast"): GenerationInputSchema {
  const resolutions = variant === "mini"
    ? ["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"]
    : ["480p", "720p", "1080p", "2k", "4k"];
  return {
    prompt: { required: false, maxLength: 20_480 },
    parameters: [
      ...seedance20VariantVideoFields(resolutions),
      booleanField("realPersonMode", "真人模式", true),
      multiSelectField("conversionSlots", "素材资产化范围", [
        ["全部首尾帧", "all"], ["首帧", "firstFrameUrl"], ["尾帧", "lastFrameUrl"],
      ]),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
    assets: [
      mediaSlot("firstFrameUrl", "首帧图片", "image", 1, 30 * MIB, IMAGE_TYPES, true),
      mediaSlot("lastFrameUrl", "尾帧图片", "image", 1, 30 * MIB, IMAGE_TYPES),
    ],
  };
}

function seedance20VariantMultimodalSchema(variant: "mini" | "fast"): GenerationInputSchema {
  const referenceOptions: Array<[string, string]> = [
    ["全部素材", "all"],
    ...Array.from({ length: 9 }, (_, index) => [`图片 ${index + 1}`, `image${index + 1}`] as [string, string]),
    ...Array.from({ length: 3 }, (_, index) => [`视频 ${index + 1}`, `video${index + 1}`] as [string, string]),
  ];
  return {
    prompt: { required: true, maxLength: 20_480 },
    parameters: [
      ...seedance20VariantVideoFields(["480p", "720p", "1080p", "2k", "4k"]),
      booleanField("realPersonMode", "真人模式", true),
      multiSelectField("conversionSlots", "素材资产化范围", referenceOptions),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
    assets: [
      mediaSlot("imageUrls", "参考图片", "image", 9, 30 * MIB, IMAGE_TYPES),
      mediaSlot("videoUrls", "参考视频", "video", 3, 50 * MIB, VIDEO_TYPES),
      mediaSlot("audioUrls", "参考音频", "audio", 3, (variant === "mini" ? 50 : 15) * MIB, AUDIO_TYPES),
    ],
  };
}

function seedance20VariantVideoFields(resolutions: string[]): GenerationParameterField[] {
  const durations = [-1, ...Array.from({ length: 12 }, (_, index) => index + 4)];
  return [
    selectField("resolution", "分辨率", resolutions, "720p"),
    {
      key: "durationSeconds", label: "时长", type: "select", required: true, defaultValue: 5,
      options: durations.map((value) => ({ label: value === -1 ? "智能时长" : String(value), value })),
    },
    selectField("aspectRatio", "画面比例", ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], "adaptive"),
    booleanField("generateAudio", "生成音频", true),
  ];
}

function minimaxSchema(mode: "text" | "image" | "multimodal"): GenerationInputSchema {
  const fields = [
    selectField("resolution", "分辨率", ["768P", "2K"], "768P"),
    durationField(5, 15, 5),
    ...(mode === "text"
      ? [optionalSelectField("aspectRatio", "画面比例", ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"])]
      : mode === "multimodal"
        ? [optionalSelectField("aspectRatio", "画面比例", ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], "adaptive")]
        : []),
    booleanField("watermark", "AIGC 水印", false),
  ];
  if (mode === "text") return { prompt: { required: true, maxLength: 20_480 }, parameters: fields };
  if (mode === "image") {
    return {
      prompt: { required: true, maxLength: 20_480 }, parameters: fields,
      assets: [
        mediaSlot("firstFrameUrl", "首帧图片", "image", 1, 30 * MIB, IMAGE_TYPES),
        mediaSlot("lastFrameUrl", "尾帧图片", "image", 1, 30 * MIB, IMAGE_TYPES),
      ],
      constraints: [{ kind: "at-least-one-asset", slots: ["firstFrameUrl", "lastFrameUrl"] }],
    };
  }
  return {
    prompt: { required: true, maxLength: 20_480 }, parameters: fields,
    assets: [
      mediaSlot("imageUrls", "参考图片", "image", 9, 30 * MIB, IMAGE_TYPES),
      mediaSlot("videoUrls", "参考视频", "video", 3, 50 * MIB, VIDEO_TYPES),
      mediaSlot("audioUrls", "参考音频", "audio", 3, 15 * MIB, ["audio/mpeg", "audio/wav"]),
    ],
  };
}

function pixVerseSchema(mode: "text" | "image"): GenerationInputSchema {
  return {
    prompt: { required: true, maxLength: 20_480 },
    parameters: [
      selectField("resolution", "分辨率", ["360p", "540p", "720p", "1080p"], "720p"),
      durationField(1, 15, 5),
      booleanField("generateAudio", "生成音频", true),
      ...(mode === "text"
        ? [optionalSelectField("aspectRatio", "画面比例", ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"], "16:9")]
        : []),
    ],
    ...(mode === "image" ? {
      assets: [mediaSlot("firstFrameUrl", "参考图片", "image", 1, 10 * MIB, IMAGE_TYPES, true)],
    } : {}),
  };
}

function wan27Schema(mode: "text" | "image" | "reference"): GenerationInputSchema {
  const withRatio = mode !== "image";
  const fields = [
    textField("negativePrompt", "负面提示词", 500),
    selectField("resolution", "分辨率", ["720P", "1080P"], "720P"),
    durationField(2, mode === "reference" ? 10 : 15, 5),
    ...(withRatio ? [selectField("aspectRatio", "画面比例", ["16:9", "9:16", "1:1", "4:3", "3:4"], "16:9")] : []),
    booleanField("promptExtend", "提示词智能改写", false),
    optionalSeedField(),
  ];
  if (mode === "text") {
    return {
      prompt: { required: true, maxLength: 5_000 }, parameters: fields,
      assets: [mediaSlot("audioUrls", "背景音频", "audio", 1, 15 * MIB, AUDIO_TYPES)],
    };
  }
  if (mode === "image") {
    return {
      prompt: { required: false, maxLength: 5_000 }, parameters: fields,
      assets: [
        mediaSlot("firstFrameUrl", "首帧图片", "image", 1, 20 * MIB, IMAGE_TYPES, true),
        mediaSlot("lastFrameUrl", "尾帧图片", "image", 1, 20 * MIB, IMAGE_TYPES),
        mediaSlot("audioUrls", "背景音频", "audio", 1, 15 * MIB, AUDIO_TYPES),
      ],
    };
  }
  return {
    prompt: { required: true, maxLength: 5_000 }, parameters: fields,
    assets: [
      mediaSlot("imageUrls", "参考图片", "image", 5, 20 * MIB, IMAGE_TYPES),
      // 当前文件存储为内存缓冲链路，先使用项目安全上限 50 MiB。
      mediaSlot("videoUrls", "参考视频", "video", 5, 50 * MIB, VIDEO_TYPES),
      mediaSlot("audioUrls", "参考音频", "audio", 1, 15 * MIB, AUDIO_TYPES),
    ],
  };
}

function wan3Schema(mode: "image" | "reference"): GenerationInputSchema {
  const parameters = [
    selectField(
      "resolution",
      "分辨率",
      ["480P", "720P", "1080P"],
      mode === "reference" ? "1080P" : "720P",
    ),
    selectField("aspectRatio", "画面比例", ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], "adaptive"),
    selectField("durationSeconds", "时长", ["auto", ...Array.from({ length: 29 }, (_, index) => index + 2)], "auto"),
    booleanField("generateAudio", "生成音轨", true),
    optionalSeedField(),
  ];
  if (mode === "image") {
    return {
      prompt: { required: false, maxLength: 20_480 }, parameters,
      assets: [
        mediaSlot("firstFrameUrl", "首帧图片", "image", 1, 20 * MIB, IMAGE_TYPES, true),
        mediaSlot("lastFrameUrl", "尾帧图片", "image", 1, 20 * MIB, IMAGE_TYPES),
      ],
    };
  }
  return {
    prompt: { required: true, maxLength: 20_480 },
    parameters: [...parameters, urlField("fileUrl", "文档 URL"), urlField("linkUrl", "网页 URL")],
    assets: [
      mediaSlot("imageUrls", "参考图片", "image", 10, 20 * MIB, IMAGE_TYPES),
      mediaSlot("videoUrls", "参考视频", "video", 5, 50 * MIB, VIDEO_TYPES),
      mediaSlot("audioUrls", "参考音频", "audio", 5, 15 * MIB, AUDIO_TYPES),
    ],
    constraints: [{ kind: "mutually-exclusive-parameters", keys: ["fileUrl", "linkUrl"] }],
  };
}

function videoFields(
  version25: boolean,
  ratioValues?: string[],
): GenerationParameterField[] {
  if (!version25) {
    return [
      selectField("resolution", "分辨率", ["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"], "720p"),
      selectField("durationSeconds", "时长", Array.from({ length: 12 }, (_, index) => index + 4), 5),
      selectField("aspectRatio", "画面比例", ratioValues ?? ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], "adaptive"),
      booleanField("generateAudio", "生成音频", true),
    ];
  }
  const durations = [-1, ...Array.from({ length: 27 }, (_, index) => index + 4)];
  return [
    selectField("resolution", "分辨率", ["480p", "720p", "1080p", "2k", "4k"], "720p"),
    {
      key: "durationSeconds", label: "时长", type: "select", required: true, defaultValue: 5,
      options: durations.map((value) => ({ label: value === -1 ? "智能时长" : String(value), value })),
    },
    selectField("aspectRatio", "画面比例", ratioValues ?? ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], "adaptive"),
    booleanField("generateAudio", "生成音频", true),
    selectField("bitrateMode", "画质档位", ["standard", "high"], "standard"),
    selectField("outputFormat", "输出格式", ["mp4", "mov"], "mp4"),
  ];
}

function routeMeta(input: Omit<RunningHubOperationDefinition["route"], "revision"> & {
  revision?: number;
}): RunningHubOperationDefinition["route"] {
  return { ...input, revision: input.revision ?? 9 };
}

function standard(
  endpoint: string,
  fields: RunningHubRequestField[],
): RunningHubOperationDefinition["protocol"] {
  return { version: 1, endpoint, fields };
}

function defineOperation(
  definition: RunningHubOperationDefinition,
): RunningHubOperationDefinition {
  return definition;
}

function executionConfig(
  definition: RunningHubOperationDefinition,
): RunningHubExecutionConfig {
  return {
    protocol: "runninghub-standard-v1",
    operation: definition.operation,
    endpoint: definition.protocol.endpoint,
    fields: definition.protocol.fields,
  };
}

function routeDefaults(
  definition: RunningHubOperationDefinition,
): Record<string, JsonValue> {
  const allowed = definition.route.defaultParameterKeys
    ? new Set(definition.route.defaultParameterKeys)
    : undefined;
  return Object.fromEntries(
    (definition.inputSchema.parameters ?? [])
      .filter((field) => field.defaultValue !== undefined && (!allowed || allowed.has(field.key)))
      .map((field) => [field.key, field.defaultValue as JsonValue]),
  );
}

function validateCatalog(
  definitions: RunningHubOperationDefinition[],
): RunningHubOperationDefinition[] {
  unique(definitions.map((item) => item.operation), "operation");
  unique(definitions.map((item) => item.route.id), "route ID");
  const defaults = new Set<string>();
  for (const definition of definitions) {
    if (!definition.protocol.endpoint.startsWith("/openapi/v2/") || definition.protocol.endpoint.includes("://")) {
      throw new Error(`Invalid RunningHub endpoint: ${definition.protocol.endpoint}`);
    }
    if (definition.route.catalogDefault) {
      if (defaults.has(definition.route.capability)) {
        throw new Error(`Duplicate RunningHub catalog default: ${definition.route.capability}`);
      }
      defaults.add(definition.route.capability);
    }
    const parameters = new Map((definition.inputSchema.parameters ?? []).map((field) => [field.key, field]));
    const assets = new Set((definition.inputSchema.assets ?? []).map((slot) => slot.key));
    unique([...parameters.keys()], `${definition.operation} parameter key`);
    unique([...assets], `${definition.operation} asset key`);
    unique(definition.protocol.fields.map((field) => field.vendorKey), `${definition.operation} vendor key`);
    for (const field of definition.protocol.fields) {
      if (field.source === "parameter" && !parameters.has(field.key)) {
        throw new Error(`${definition.operation} request references unknown parameter: ${field.key}`);
      }
      if (field.source === "asset" && !assets.has(field.key)) {
        throw new Error(`${definition.operation} request references unknown asset: ${field.key}`);
      }
    }
    for (const field of parameters.values()) validateDefault(definition.operation, field);
  }
  return definitions;
}

function validateDefault(operation: string, field: GenerationParameterField): void {
  if (field.defaultValue === undefined) return;
  if (field.type === "select" && field.options && !field.options.some((option) => option.value === field.defaultValue)) {
    throw new Error(`${operation} has invalid default for ${field.key}`);
  }
}

function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate RunningHub ${label}`);
}

function selectField(
  key: string,
  label: string,
  values: Array<string | number>,
  defaultValue: string | number,
): GenerationParameterField {
  return {
    key, label, type: "select", required: true, defaultValue,
    options: values.map((value) => ({ label: String(value), value })),
  };
}

function optionalSelectField(
  key: string,
  label: string,
  values: Array<string | number>,
  defaultValue?: string | number,
): GenerationParameterField {
  return {
    key, label, type: "select", defaultValue,
    options: values.map((value) => ({ label: String(value), value })),
  };
}

function durationField(min: number, max: number, defaultValue: number) {
  return selectField(
    "durationSeconds", "时长",
    Array.from({ length: max - min + 1 }, (_, index) => index + min),
    defaultValue,
  );
}

function textField(key: string, label: string, maxLength: number): GenerationParameterField {
  return { key, label, type: "text", maxLength };
}

function urlField(key: string, label: string): GenerationParameterField {
  return {
    key, label, description: "仅支持可公开访问的 HTTPS URL。",
    type: "text", format: "url", maxLength: 2_048,
  };
}

function booleanField(key: string, label: string, defaultValue: boolean): GenerationParameterField {
  return { key, label, type: "boolean", defaultValue };
}

function multiSelectField(
  key: string,
  label: string,
  options: Array<[string, string]>,
): GenerationParameterField {
  return {
    key, label, type: "multi-select", defaultValue: ["all"],
    options: options.map(([optionLabel, value]) => ({ label: optionLabel, value })),
  };
}

function seedField(): GenerationParameterField {
  return {
    key: "seed", label: "随机种子", description: "-1 表示每次随机生成。",
    type: "number", defaultValue: -1, min: -1, max: 2_147_483_647,
  };
}

function optionalSeedField(): GenerationParameterField {
  return {
    key: "seed", label: "随机种子", description: "留空时由供应商随机生成。",
    type: "number", min: 0, max: 2_147_483_647,
  };
}

function numberField(
  key: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
): GenerationParameterField {
  return { key, label, type: "number", defaultValue, min, max };
}

function mediaSlot(
  key: string,
  label: string,
  mediaType: GenerationAssetSlot["mediaType"],
  maxFiles: number,
  maxFileSizeBytes: number,
  acceptedTypes: string[],
  required = false,
): GenerationAssetSlot {
  return {
    key, label, mediaType, required, multiple: maxFiles > 1,
    maxFiles, maxFileSizeBytes, acceptedTypes,
  };
}
