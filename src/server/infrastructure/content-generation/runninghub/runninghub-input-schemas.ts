import type {
  GenerationAssetSlot,
  GenerationInputSchema,
  GenerationParameterField,
} from "@/contracts/generation";
import type { GenerationCapability } from "@/server/domain/generation";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function runningHubInputSchema(
  capability: GenerationCapability,
): GenerationInputSchema {
  switch (capability) {
    case "text-to-image":
      return imageSchema();
    case "image-to-image":
      return {
        ...imageSchema(),
        assets: [mediaSlot("imageUrls", "参考图片", "image", 10, 10 * 1024 * 1024, IMAGE_TYPES, true)],
      };
    case "text-to-video":
      return {
        prompt: { required: true, maxLength: 20_480 },
        parameters: [
          ...videoFields(),
          booleanField("webSearch", "联网搜索增强", false, true),
          booleanField("returnLastFrame", "返回视频尾帧", false, true),
          seedField(),
        ],
      };
    case "image-to-video":
      return {
        prompt: { required: false, maxLength: 20_480 },
        parameters: [
          ...videoFields(),
          booleanField("realPersonMode", "真人模式", true, true),
          multiSelectField("conversionSlots", "素材资产化范围", [
            ["全部首尾帧", "all"],
            ["首帧", "firstFrameUrl"],
            ["尾帧", "lastFrameUrl"],
          ]),
          booleanField("returnLastFrame", "返回视频尾帧", false, true),
          seedField(),
        ],
        assets: [
          mediaSlot("firstFrameUrl", "首帧图片", "image", 1, 30 * 1024 * 1024, IMAGE_TYPES, true),
          mediaSlot("lastFrameUrl", "尾帧图片", "image", 1, 30 * 1024 * 1024, IMAGE_TYPES),
        ],
      };
    case "multimodal-to-video":
      return {
        prompt: { required: true, maxLength: 20_480 },
        parameters: [
          ...videoFields(),
          booleanField("realPersonMode", "真人模式", true, true),
          multiSelectField("conversionSlots", "素材资产化范围", [
            ["全部素材", "all"],
            ...Array.from({ length: 9 }, (_, index) => [
              `图片 ${index + 1}`,
              `image${index + 1}`,
            ] as [string, string]),
            ...Array.from({ length: 3 }, (_, index) => [
              `视频 ${index + 1}`,
              `video${index + 1}`,
            ] as [string, string]),
          ]),
          booleanField("returnLastFrame", "返回视频尾帧", false, true),
          seedField(),
        ],
        assets: [
          mediaSlot("imageUrls", "参考图片", "image", 9, 30 * 1024 * 1024, IMAGE_TYPES),
          mediaSlot("videoUrls", "参考视频", "video", 3, 50 * 1024 * 1024, ["video/mp4", "video/quicktime"]),
          mediaSlot("audioUrls", "参考音频", "audio", 3, 50 * 1024 * 1024, ["audio/mpeg", "audio/wav", "audio/mp4"]),
        ],
      };
  }
}

function imageSchema(): GenerationInputSchema {
  return {
    prompt: { required: true, maxLength: 5_000 },
    parameters: [
      selectField("resolution", "分辨率", ["1k", "2k"], "2k"),
      selectField("outputFormat", "输出格式", ["png", "jpeg"], "png"),
      numberField("width", "宽度", 1024, 240, 8192, true),
      numberField("height", "高度", 1024, 240, 8192, true),
    ],
  };
}

function videoFields(): GenerationParameterField[] {
  return [
    selectField("resolution", "分辨率", ["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"], "720p"),
    selectField("durationSeconds", "时长", Array.from({ length: 12 }, (_, index) => index + 4), 5),
    selectField("aspectRatio", "画面比例", ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], "adaptive"),
    booleanField("generateAudio", "生成音频", true),
  ];
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
  advanced = false,
): GenerationParameterField {
  return { key, label, type: "boolean", defaultValue, advanced };
}

function multiSelectField(
  key: string,
  label: string,
  options: Array<[string, string]>,
): GenerationParameterField {
  return {
    key,
    label,
    type: "multi-select",
    defaultValue: ["all"],
    advanced: true,
    options: options.map(([optionLabel, value]) => ({ label: optionLabel, value })),
  };
}

function seedField(): GenerationParameterField {
  return {
    key: "seed",
    label: "随机种子",
    description: "-1 表示每次随机生成。",
    type: "number",
    defaultValue: -1,
    min: -1,
    max: 2_147_483_647,
    advanced: true,
  };
}

function numberField(
  key: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  advanced = false,
): GenerationParameterField {
  return {
    key,
    label,
    type: "number",
    defaultValue,
    min,
    max,
    advanced,
  };
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
    key,
    label,
    mediaType,
    required,
    multiple: maxFiles > 1,
    maxFiles,
    maxFileSizeBytes,
    acceptedTypes,
  };
}
