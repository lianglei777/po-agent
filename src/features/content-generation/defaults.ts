import type { SaveContentGenerationApiRequest } from "@/contracts/content-generation";

export function createContentGenerationApiDraft(): SaveContentGenerationApiRequest {
  return {
    id: crypto.randomUUID(),
    name: "",
    providerName: "",
    capability: "text-to-video",
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

export function createRunningHubDraft(): SaveContentGenerationApiRequest {
  const draft = createContentGenerationApiDraft();
  return {
    ...draft,
    name: "RunningHub Seedance 2.0",
    providerName: "RunningHub",
    commonHeaders: {
      Authorization: "Bearer {{secret.apiKey}}",
    },
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
        resolution: "720p",
        duration: "5",
        generateAudio: true,
        ratio: "adaptive",
        webSearch: false,
        returnLastFrame: false,
        seed: -1,
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
  };
}
