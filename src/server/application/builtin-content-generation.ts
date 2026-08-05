import type {
  ContentGenerationApi,
  ContentGenerationProvider,
  SaveContentGenerationApiRequest,
} from "@/contracts/content-generation";
import type {
  StoredContentGenerationApi,
  StoredContentGenerationProvider,
} from "@/server/domain/content-generation";

// 内置 RunningHub 供应商使用稳定 ID，确保虚拟项与已存储项之间正确匹配
export const BUILTIN_RUNNINGHUB_PROVIDER_ID = "builtin-runninghub";

export function createBuiltinRunningHubProvider(): ContentGenerationProvider {
  return {
    id: BUILTIN_RUNNINGHUB_PROVIDER_ID,
    name: "RunningHub",
    type: "runninghub",
    hasApiKey: false,
    commonHeaders: { Authorization: "Bearer {{secret.apiKey}}" },
  };
}

export function createBuiltinRunningHubProviderStored(): StoredContentGenerationProvider {
  return {
    id: BUILTIN_RUNNINGHUB_PROVIDER_ID,
    name: "RunningHub",
    type: "runninghub",
    commonHeaders: { Authorization: "Bearer {{secret.apiKey}}" },
  };
}

export function createBuiltinRunningHubApis(
  providerId: string,
): ContentGenerationApi[] {
  return createRunningHubApiCatalog(providerId).map((draft) => ({
    ...stripApiKey(draft),
    id: `builtin-${draft.catalogId}`,
    hasApiKeyOverride: false,
  }));
}

export function createBuiltinRunningHubApisStored(
  providerId: string,
): StoredContentGenerationApi[] {
  return createRunningHubApiCatalog(providerId).map((draft) => ({
    ...stripApiKey(draft),
    id: `builtin-${draft.catalogId}`,
  }));
}

function stripApiKey(
  draft: SaveContentGenerationApiRequest,
): Omit<SaveContentGenerationApiRequest, "apiKey"> {
  const rest = { ...draft } as Omit<SaveContentGenerationApiRequest, "apiKey">;
  delete (rest as { apiKey?: string }).apiKey;
  return rest;
}

export function createRunningHubApiCatalog(
  providerId: string,
): SaveContentGenerationApiRequest[] {
  return [
    createRunningHubTextToImageDraft(providerId),
    createRunningHubImageToImageDraft(providerId),
    createRunningHubTextToVideoDraft(providerId),
    createRunningHubImageToVideoDraft(providerId),
    createRunningHubMultimodalVideoDraft(providerId),
  ];
}

function createContentGenerationApiDraft(
  providerId = "",
): SaveContentGenerationApiRequest {
  return {
    id: crypto.randomUUID(),
    providerId,
    name: "",
    capability: "text-to-video",
    credentialMode: "inherit",
    requiresImages: false,
    commonHeaders: {},
    submit: {
      method: "POST",
      url: "https://api.example.com/generate",
      headers: { "Content-Type": "application/json" },
      bodyTemplate: { prompt: "{{input.prompt}}" },
      taskIdPath: "taskId",
      statusPath: "status",
      errorPath: "errorMessage",
    },
    completion: {
      mode: "polling",
      request: {
        method: "POST",
        url: "https://api.example.com/query",
        headers: { "Content-Type": "application/json" },
        bodyTemplate: { taskId: "{{job.remoteTaskId}}" },
      },
      statusPath: "status",
      pendingValues: ["QUEUED", "RUNNING"],
      successValues: ["SUCCESS"],
      failureValues: ["FAILED"],
      errorPath: "errorMessage",
      intervalMs: 5000,
      timeoutMs: 1200000,
    },
    output: {
      collectionPath: "results",
      urlPath: "url",
      typePath: "outputType",
      textPath: "text",
      defaultMediaType: "video",
      downloadRemoteFiles: true,
    },
  };
}

function createRunningHubTextToImageDraft(providerId: string): SaveContentGenerationApiRequest {
  const draft = createContentGenerationApiDraft(providerId);
  return {
    ...draft,
    name: "Seedream v5 Pro 文生图片",
    capability: "text-to-image",
    catalogId: "runninghub-seedream-v5-pro-text-to-image",
    submit: {
      ...draft.submit,
      url: "https://www.runninghub.cn/openapi/v2/seedream-v5-pro/text-to-image",
      bodyTemplate: {
        prompt: "{{input.prompt}}",
        resolution: "{{input.resolution}}",
        width: "{{input.width}}",
        height: "{{input.height}}",
        outputFormat: "{{input.outputFormat}}",
      },
    },
    completion: {
      mode: "polling",
      request: {
        method: "POST",
        url: "https://www.runninghub.cn/openapi/v2/query",
        headers: { "Content-Type": "application/json" },
        bodyTemplate: { taskId: "{{job.remoteTaskId}}" },
      },
      statusPath: "status",
      pendingValues: ["QUEUED", "RUNNING"],
      successValues: ["SUCCESS"],
      failureValues: ["FAILED"],
      errorPath: "errorMessage",
      intervalMs: 5000,
      timeoutMs: 1200000,
    },
    output: {
      ...draft.output,
      defaultMediaType: "image",
    },
    inputSchema: {
      prompt: { required: true, maxLength: 5000 },
      parameters: [
        selectField("resolution", "分辨率", ["1k", "2k"], "2k"),
        selectField("outputFormat", "输出格式", ["png", "jpeg"], "png"),
        numberField("width", "宽度", 1024, 240, 8192, "优先级低于 resolution。", true),
        numberField("height", "高度", 1024, 240, 8192, "优先级低于 resolution。", true),
      ],
    },
  };
}

function createRunningHubImageToImageDraft(providerId: string): SaveContentGenerationApiRequest {
  const draft = createRunningHubTextToImageDraft(providerId);
  return {
    ...draft,
    name: "Seedream v5 Pro 图生图片",
    capability: "image-to-image",
    catalogId: "runninghub-seedream-v5-pro-image-to-image",
    requiresImages: true,
    upload: runningHubUpload(
      ["image/png", "image/jpeg", "image/webp"],
      10,
      10 * 1024 * 1024,
    ),
    submit: {
      ...draft.submit,
      url: "https://www.runninghub.cn/openapi/v2/seedream-v5-pro/image-to-image",
      bodyTemplate: {
        prompt: "{{input.prompt}}",
        imageUrls: "{{input.imageUrls}}",
        resolution: "{{input.resolution}}",
        width: "{{input.width}}",
        height: "{{input.height}}",
        outputFormat: "{{input.outputFormat}}",
      },
    },
    inputSchema: {
      prompt: { required: true, maxLength: 5000 },
      parameters: [
        selectField("resolution", "分辨率", ["1k", "2k"], "2k"),
        selectField("outputFormat", "输出格式", ["png", "jpeg"], "png"),
        numberField("width", "宽度", 1024, 240, 8192, "优先级低于 resolution。", true),
        numberField("height", "高度", 1024, 240, 8192, "优先级低于 resolution。", true),
      ],
      assets: [
        mediaSlot("imageUrls", "参考图片", "image", 10, 10 * 1024 * 1024, ["image/png", "image/jpeg", "image/webp"], true, true),
      ],
    },
  };
}

function createRunningHubTextToVideoDraft(providerId: string): SaveContentGenerationApiRequest {
  const draft = createContentGenerationApiDraft(providerId);
  return {
    ...draft,
    name: "Seedance 2.0 文生视频",
    catalogId: "runninghub-seedance-2-text-to-video",
    upload: {
      url: "https://www.runninghub.cn/openapi/v2/media/upload/binary",
      headers: {},
      fileField: "file",
      urlPath: "data.download_url",
      successPath: "code",
      successValues: [0],
      errorPath: "message",
      acceptedTypes: ["image/png", "image/jpeg", "image/webp"],
      maxFiles: 1,
      maxFileSizeBytes: 10485760,
    },
    submit: {
      ...draft.submit,
      url: "https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0/text-to-video",
      bodyTemplate: {
        prompt: "{{input.prompt}}",
        resolution: "{{input.resolution}}",
        duration: "{{input.duration}}",
        generateAudio: "{{input.generateAudio}}",
        ratio: "{{input.ratio}}",
        webSearch: "{{input.webSearch}}",
        returnLastFrame: "{{input.returnLastFrame}}",
        seed: "{{input.seed}}",
      },
    },
    completion: {
      mode: "polling",
      request: {
        method: "POST",
        url: "https://www.runninghub.cn/openapi/v2/query",
        headers: { "Content-Type": "application/json" },
        bodyTemplate: { taskId: "{{job.remoteTaskId}}" },
      },
      statusPath: "status",
      pendingValues: ["QUEUED", "RUNNING"],
      successValues: ["SUCCESS"],
      failureValues: ["FAILED"],
      errorPath: "errorMessage",
      intervalMs: 5000,
      timeoutMs: 1200000,
    },
    inputSchema: {
      prompt: { required: true, maxLength: 20480 },
      parameters: [
        ...commonVideoFields(),
        booleanField("webSearch", "联网搜索增强", false, true),
        booleanField("returnLastFrame", "返回视频尾帧", false, true),
        seedField(),
      ],
    },
  };
}

function createRunningHubImageToVideoDraft(providerId: string): SaveContentGenerationApiRequest {
  const draft = runningHubBaseDraft(providerId);
  return {
    ...draft,
    name: "Seedance 2.0 图生视频",
    capability: "image-to-video",
    catalogId: "runninghub-seedance-2-image-to-video",
    requiresImages: true,
    upload: runningHubUpload(
      ["image/png", "image/jpeg", "image/webp"],
      2,
      30 * 1024 * 1024,
    ),
    submit: {
      ...draft.submit,
      url: "https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0/image-to-video",
      bodyTemplate: {
        prompt: "{{input.prompt}}",
        resolution: "{{input.resolution}}",
        duration: "{{input.duration}}",
        firstFrameUrl: "{{input.firstFrameUrl}}",
        lastFrameUrl: "{{input.lastFrameUrl}}",
        generateAudio: "{{input.generateAudio}}",
        ratio: "{{input.ratio}}",
        realPersonMode: "{{input.realPersonMode}}",
        conversionSlots: "{{input.conversionSlots}}",
        returnLastFrame: "{{input.returnLastFrame}}",
        seed: "{{input.seed}}",
      },
    },
    inputSchema: {
      prompt: { required: false, maxLength: 20480 },
      parameters: [
        ...commonVideoFields(),
        booleanField("realPersonMode", "真人模式", true, true),
        multiSelectField("conversionSlots", "素材资产化范围", [
          ["全部首尾帧", "all"],
          ["首帧", "firstFrameUrl"],
          ["尾帧", "lastFrameUrl"],
        ], ["all"], true),
        booleanField("returnLastFrame", "返回视频尾帧", false, true),
        seedField(),
      ],
      assets: [
        imageSlot("firstFrameUrl", "首帧图片", true),
        imageSlot("lastFrameUrl", "尾帧图片", false),
      ],
    },
  };
}

function createRunningHubMultimodalVideoDraft(providerId: string): SaveContentGenerationApiRequest {
  const draft = runningHubBaseDraft(providerId);
  const conversionOptions: Array<[string, string]> = [
    ["全部素材", "all"],
    ...Array.from({ length: 9 }, (_, index) => [`图片 ${index + 1}`, `image${index + 1}`] as [string, string]),
    ...Array.from({ length: 3 }, (_, index) => [`视频 ${index + 1}`, `video${index + 1}`] as [string, string]),
  ];
  return {
    ...draft,
    name: "Seedance 2.0 多模态视频",
    capability: "multimodal-to-video",
    catalogId: "runninghub-seedance-2-multimodal-video",
    upload: runningHubUpload(
      ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/quicktime", "audio/mpeg", "audio/wav", "audio/mp4"],
      15,
      50 * 1024 * 1024,
    ),
    submit: {
      ...draft.submit,
      url: "https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0/multimodal-video",
      bodyTemplate: {
        prompt: "{{input.prompt}}",
        resolution: "{{input.resolution}}",
        duration: "{{input.duration}}",
        imageUrls: "{{input.imageUrls}}",
        videoUrls: "{{input.videoUrls}}",
        audioUrls: "{{input.audioUrls}}",
        generateAudio: "{{input.generateAudio}}",
        ratio: "{{input.ratio}}",
        realPersonMode: "{{input.realPersonMode}}",
        conversionSlots: "{{input.conversionSlots}}",
        returnLastFrame: "{{input.returnLastFrame}}",
        seed: "{{input.seed}}",
      },
    },
    inputSchema: {
      prompt: { required: true, maxLength: 20480 },
      parameters: [
        ...commonVideoFields(),
        booleanField("realPersonMode", "真人模式", true, true),
        multiSelectField("conversionSlots", "素材资产化范围", conversionOptions, ["all"], true),
        booleanField("returnLastFrame", "返回视频尾帧", false, true),
        seedField(),
      ],
      assets: [
        mediaSlot("imageUrls", "参考图片", "image", 9, 30 * 1024 * 1024, ["image/png", "image/jpeg", "image/webp"]),
        mediaSlot("videoUrls", "参考视频", "video", 3, 50 * 1024 * 1024, ["video/mp4", "video/quicktime"]),
        mediaSlot("audioUrls", "参考音频", "audio", 3, 50 * 1024 * 1024, ["audio/mpeg", "audio/wav", "audio/mp4"]),
      ],
    },
  };
}

function runningHubBaseDraft(providerId: string) {
  return createRunningHubTextToVideoDraft(providerId);
}

function runningHubUpload(acceptedTypes: string[], maxFiles: number, maxFileSizeBytes: number) {
  return {
    url: "https://www.runninghub.cn/openapi/v2/media/upload/binary",
    headers: {},
    fileField: "file",
    urlPath: "data.download_url",
    successPath: "code",
    successValues: [0],
    errorPath: "message",
    acceptedTypes,
    maxFiles,
    maxFileSizeBytes,
  };
}

function commonVideoFields() {
  return [
    selectField("resolution", "分辨率", ["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"], "720p"),
    selectField("duration", "时长", ["-1", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"], "5"),
    selectField("ratio", "画面比例", ["adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9"], "adaptive"),
    booleanField("generateAudio", "生成音频", true),
  ];
}

function selectField(key: string, label: string, values: string[], defaultValue: string) {
  return {
    key,
    label,
    type: "select" as const,
    required: true,
    defaultValue,
    options: values.map((value) => ({ label: value, value })),
  };
}

function booleanField(key: string, label: string, defaultValue: boolean, advanced = false) {
  return { key, label, type: "boolean" as const, defaultValue, advanced };
}

function multiSelectField(
  key: string,
  label: string,
  options: Array<[string, string]>,
  defaultValue: string[],
  advanced = false,
) {
  return {
    key,
    label,
    type: "multi-select" as const,
    defaultValue,
    advanced,
    options: options.map(([optionLabel, value]) => ({ label: optionLabel, value })),
  };
}

function seedField() {
  return {
    key: "seed",
    label: "随机种子",
    description: "-1 表示每次随机生成。",
    type: "number" as const,
    defaultValue: -1,
    min: -1,
    max: 2147483647,
    advanced: true,
  };
}

function numberField(
  key: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  description?: string,
  advanced = false,
) {
  return {
    key,
    label,
    description,
    type: "number" as const,
    defaultValue,
    min,
    max,
    advanced,
  };
}

function imageSlot(key: string, label: string, required: boolean) {
  return mediaSlot(key, label, "image", 1, 30 * 1024 * 1024, ["image/png", "image/jpeg", "image/webp"], required, false);
}

function mediaSlot(
  key: string,
  label: string,
  mediaType: "image" | "video" | "audio",
  maxFiles: number,
  maxFileSizeBytes: number,
  acceptedTypes: string[],
  required = false,
  multiple = true,
) {
  return { key, label, mediaType, required, multiple, maxFiles, maxFileSizeBytes, acceptedTypes };
}
