import type {
  GenerationInputSchema,
  GenerationParameterField,
  JsonValue,
} from "@/contracts/generation";
import type { GenerationRoute } from "@/server/domain/generation";
import {
  QIANWEN_CREDENTIAL_REF,
  QIANWEN_PROVIDER_ID,
} from "./qianwen-provider-constants";

export const QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION = "wan-3-0-text-to-video";

export interface QianwenExecutionConfig {
  protocol: "dashscope-media-v1";
  operation: typeof QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION;
  endpointId: "video-synthesis";
  vendorModel: "wan3.0-video";
  requestProfile: "wan-3-text-to-video-v1";
  resultProfile: "video-url-v1";
  pollIntervalMs: 15_000;
}

const INPUT_SCHEMA: GenerationInputSchema = {
  prompt: { required: true, maxLength: 20_000 },
  parameters: [
    selectField("resolution", "分辨率", ["480P", "720P", "1080P"], "1080P"),
    selectField("aspectRatio", "画面比例", ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16"], "adaptive"),
    {
      key: "durationSeconds",
      label: "时长",
      description: "智能时长由模型根据提示词决定。",
      type: "select",
      required: true,
      defaultValue: 5,
      options: [
        { label: "智能时长", value: -1 },
        ...Array.from({ length: 29 }, (_, index) => ({
          label: `${index + 2} 秒`,
          value: index + 2,
        })),
      ],
    },
    booleanField("generateAudio", "生成音轨", true),
    booleanField("promptExtend", "提示词智能改写", true),
    booleanField("watermark", "添加水印", false),
    {
      key: "seed",
      label: "随机种子",
      description: "留空时由供应商随机生成。",
      type: "number",
      min: 0,
      max: 2_147_483_647,
    },
  ],
};

const EXECUTION_CONFIG: QianwenExecutionConfig = {
  protocol: "dashscope-media-v1",
  operation: QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION,
  endpointId: "video-synthesis",
  vendorModel: "wan3.0-video",
  requestProfile: "wan-3-text-to-video-v1",
  resultProfile: "video-url-v1",
  pollIntervalMs: 15_000,
};

export function createQianwenRoutes(
  now = new Date().toISOString(),
): GenerationRoute[] {
  return [{
    id: "qianwen-wan-3-0-text-to-video",
    name: "Wan 3.0 文生视频",
    description: "千问AI平台 Wan 3.0 文生视频，支持 2–30 秒或智能时长、多种画幅、音轨生成与提示词智能改写。",
    tags: ["最长30秒", "智能时长", "有声视频", "最高1080P"],
    product: "Wan 3.0",
    capability: "text-to-video",
    providerId: QIANWEN_PROVIDER_ID,
    providerOperation: QIANWEN_WAN_3_TEXT_TO_VIDEO_OPERATION,
    enabled: false,
    isDefault: false,
    revision: 1,
    defaults: Object.fromEntries(
      (INPUT_SCHEMA.parameters ?? [])
        .filter((field) => field.defaultValue !== undefined)
        .map((field) => [field.key, field.defaultValue as JsonValue]),
    ),
    inputSchema: INPUT_SCHEMA,
    adapterConfig: EXECUTION_CONFIG as unknown as JsonValue,
    credentialRef: QIANWEN_CREDENTIAL_REF,
    createdAt: now,
    updatedAt: now,
  }];
}

function selectField(
  key: string,
  label: string,
  values: Array<string | number>,
  defaultValue: string | number,
): GenerationParameterField {
  return {
    key,
    label,
    type: "select",
    required: true,
    defaultValue,
    options: values.map((value) => ({ label: String(value), value })),
  };
}

function booleanField(
  key: string,
  label: string,
  defaultValue: boolean,
): GenerationParameterField {
  return { key, label, type: "boolean", defaultValue };
}
