import type {
  GenerationAssetSlot,
  GenerationInputSchema,
  GenerationParameterField,
} from "@/contracts/generation";
import type { GenerationCapability } from "@/server/domain/generation";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function runningHubInputSchema(
  capability: GenerationCapability,
  operation?: string,
): GenerationInputSchema {
  const isSeedance25 = operation?.startsWith("seedance-2-5") ?? false;
  switch (capability) {
    case "text-to-image":
      return imageSchema();
    case "image-to-image":
      return {
        ...imageSchema(),
        assets: [mediaSlot("imageUrls", "参考图片", "image", 10, 10 * 1024 * 1024, IMAGE_TYPES, true)],
      };
    case "text-to-video":
      return isSeedance25 ? textToVideo25Schema() : textToVideoSchema();
    case "image-to-video":
      return isSeedance25 ? imageToVideo25Schema() : imageToVideoSchema();
    case "multimodal-to-video":
      return isSeedance25 ? multimodalVideo25Schema() : multimodalVideoSchema();
  }
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

// ── Seedance 2.0 schemas ──

function textToVideoSchema(): GenerationInputSchema {
  return {
    prompt: { required: true, maxLength: 20_480 },
    parameters: [
      ...videoFields(),
      booleanField("webSearch", "联网搜索增强", false),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
  };
}

function imageToVideoSchema(): GenerationInputSchema {
  return {
    prompt: { required: false, maxLength: 20_480 },
    parameters: [
      ...videoFields(),
      booleanField("realPersonMode", "真人模式", true),
      multiSelectField("conversionSlots", "素材资产化范围", [
        ["全部首尾帧", "all"],
        ["首帧", "firstFrameUrl"],
        ["尾帧", "lastFrameUrl"],
      ]),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
    assets: [
      mediaSlot("firstFrameUrl", "首帧图片", "image", 1, 30 * 1024 * 1024, IMAGE_TYPES, true),
      mediaSlot("lastFrameUrl", "尾帧图片", "image", 1, 30 * 1024 * 1024, IMAGE_TYPES),
    ],
  };
}

function multimodalVideoSchema(): GenerationInputSchema {
  return {
    prompt: { required: true, maxLength: 20_480 },
    parameters: [
      ...videoFields(),
      booleanField("realPersonMode", "真人模式", true),
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
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
    assets: [
      mediaSlot("imageUrls", "参考图片", "image", 9, 30 * 1024 * 1024, IMAGE_TYPES),
      mediaSlot("videoUrls", "参考视频", "video", 3, 50 * 1024 * 1024, ["video/mp4", "video/quicktime"]),
      mediaSlot("audioUrls", "参考音频", "audio", 3, 50 * 1024 * 1024, ["audio/mpeg", "audio/wav", "audio/mp4"]),
    ],
  };
}

// ── Seedance 2.5 schemas ──
// 2.5 差异：分辨率去掉 native1080p/native4k；时长扩展至 4-30 且支持 -1 智能时长；
// 新增 bitrateMode 与 outputFormat；multimodal 素材上限大幅提升。

function textToVideo25Schema(): GenerationInputSchema {
  return {
    prompt: { required: true, maxLength: 20_480 },
    parameters: [
      ...videoFields25(),
      booleanField("webSearch", "联网搜索增强", false),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
  };
}

function imageToVideo25Schema(): GenerationInputSchema {
  return {
    prompt: { required: false, maxLength: 20_480 },
    parameters: [
      // 2.5 image-to-video 仅支持 adaptive 比例
      ...videoFields25(["adaptive"]),
      booleanField("realPersonMode", "真人模式", true),
      multiSelectField("conversionSlots", "素材资产化范围", [
        ["全部首尾帧", "all"],
        ["首帧", "firstFrameUrl"],
        ["尾帧", "lastFrameUrl"],
      ]),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
    assets: [
      mediaSlot("firstFrameUrl", "首帧图片", "image", 1, 30 * 1024 * 1024, IMAGE_TYPES, true),
      mediaSlot("lastFrameUrl", "尾帧图片", "image", 1, 30 * 1024 * 1024, IMAGE_TYPES),
    ],
  };
}

function multimodalVideo25Schema(): GenerationInputSchema {
  return {
    prompt: { required: true, maxLength: 20_480 },
    parameters: [
      ...videoFields25(),
      booleanField("realPersonMode", "真人模式", true),
      multiSelectField("conversionSlots", "素材资产化范围", [
        ["全部素材", "all"],
        ...Array.from({ length: 30 }, (_, index) => [
          `图片 ${index + 1}`,
          `image${index + 1}`,
        ] as [string, string]),
        ...Array.from({ length: 10 }, (_, index) => [
          `视频 ${index + 1}`,
          `video${index + 1}`,
        ] as [string, string]),
      ]),
      booleanField("returnLastFrame", "返回视频尾帧", false),
      seedField(),
    ],
    assets: [
      mediaSlot("imageUrls", "参考图片", "image", 30, 50 * 1024 * 1024, IMAGE_TYPES),
      mediaSlot("videoUrls", "参考视频", "video", 10, 50 * 1024 * 1024, ["video/mp4", "video/quicktime"]),
      mediaSlot("audioUrls", "参考音频", "audio", 10, 50 * 1024 * 1024, ["audio/mpeg", "audio/wav", "audio/mp4"]),
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

// Seedance 2.5 视频公共字段：分辨率去掉 native 系列；时长 4-30 且支持 -1 智能时长；
// 新增 bitrateMode 与 outputFormat。ratioValues 参数允许 image-to-video 限制为仅 adaptive。
function videoFields25(
  ratioValues: string[] = ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
): GenerationParameterField[] {
  return [
    selectField("resolution", "分辨率", ["480p", "720p", "1080p", "2k", "4k"], "720p"),
    durationField25(),
    selectField("aspectRatio", "画面比例", ratioValues, "adaptive"),
    booleanField("generateAudio", "生成音频", true),
    selectField("bitrateMode", "画质档位", ["standard", "high"], "standard"),
    selectField("outputFormat", "输出格式", ["mp4", "mov"], "mp4"),
  ];
}

// 2.5 时长支持 -1 智能时长，需要自定义 label
function durationField25(): GenerationParameterField {
  const values: number[] = [-1, ...Array.from({ length: 27 }, (_, index) => index + 4)];
  return {
    key: "durationSeconds",
    label: "时长",
    type: "select",
    required: true,
    defaultValue: 5,
    options: values.map((value) => ({
      label: value === -1 ? "智能时长" : String(value),
      value,
    })),
  };
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
  };
}

function numberField(
  key: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
): GenerationParameterField {
  return {
    key,
    label,
    type: "number",
    defaultValue,
    min,
    max,
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
