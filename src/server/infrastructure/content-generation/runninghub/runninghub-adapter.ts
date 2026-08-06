import type { JsonValue } from "@/contracts/content-generation";
import type { GenerationInput } from "@/server/domain/generation";
import type { PreparedGenerationAsset } from "@/server/domain/generation";
import { AppError } from "@/server/domain/app-error";
import type {
  GenerationProvider,
  ProviderInputAsset,
  ProviderOutput,
  ProviderPollResult,
  ProviderSubmitResult,
} from "@/server/ports/generation-provider";
import { RUNNINGHUB_PROVIDER_ID } from "./runninghub-routes";

const API_ORIGIN = "https://www.runninghub.cn";
const UPLOAD_URL = `${API_ORIGIN}/openapi/v2/media/upload/binary`;
const QUERY_URL = `${API_ORIGIN}/openapi/v2/query`;
const SNAPSHOT_LIMIT_BYTES = 64 * 1024;

const OPERATION_PATHS: Record<string, string> = {
  "seedream-v5-pro-text-to-image": "/openapi/v2/seedream-v5-pro/text-to-image",
  "seedream-v5-pro-image-to-image": "/openapi/v2/seedream-v5-pro/image-to-image",
  "seedance-2-text-to-video":
    "/openapi/v2/rhart-video/sparkvideo-2.0/text-to-video",
  "seedance-2-image-to-video":
    "/openapi/v2/rhart-video/sparkvideo-2.0/image-to-video",
  "seedance-2-multimodal-video":
    "/openapi/v2/rhart-video/sparkvideo-2.0/multimodal-video",
};

export class RunningHubAdapter implements GenerationProvider {
  readonly providerId = RUNNINGHUB_PROVIDER_ID;

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async upload(input: {
    assets: ProviderInputAsset[];
    credential: string;
  }): Promise<PreparedGenerationAsset[]> {
    const uploaded: PreparedGenerationAsset[] = [];
    for (const asset of input.assets) {
      const form = new FormData();
      const bytes = asset.data.buffer.slice(
        asset.data.byteOffset,
        asset.data.byteOffset + asset.data.byteLength,
      ) as ArrayBuffer;
      form.append(
        "file",
        new Blob([bytes], { type: asset.mimeType }),
        asset.name,
      );
      const response = await this.requestJson(
        UPLOAD_URL,
        input.credential,
        form,
      );
      const record = objectValue(response);
      const data = objectValue(record.data);
      if (record.code !== 0 || typeof data.download_url !== "string") {
        throw new AppError(
          "GENERATION_UPLOAD_FAILED",
          stringValue(record.message) ?? "RunningHub upload failed",
          502,
        );
      }
      uploaded.push({
        slot: asset.slot,
        name: asset.name,
        mimeType: asset.mimeType,
        url: data.download_url,
      });
    }
    return uploaded;
  }

  async submit(input: {
    operation: string;
    generation: GenerationInput;
    assets: PreparedGenerationAsset[];
    credential: string;
  }): Promise<ProviderSubmitResult> {
    const path = OPERATION_PATHS[input.operation];
    if (!path) {
      throw new AppError(
        "GENERATION_OPERATION_UNSUPPORTED",
        `RunningHub operation is not supported: ${input.operation}`,
        400,
      );
    }
    const body = requestBody(input.operation, input.generation, input.assets);
    const response = await this.requestJson(
      `${API_ORIGIN}${path}`,
      input.credential,
      body,
    );
    return normalizeResponse(response);
  }

  async poll(input: {
    operation: string;
    remoteTaskId: string;
    credential: string;
  }): Promise<ProviderPollResult> {
    if (!OPERATION_PATHS[input.operation]) {
      throw new AppError(
        "GENERATION_OPERATION_UNSUPPORTED",
        `RunningHub operation is not supported: ${input.operation}`,
        400,
      );
    }
    const response = await this.requestJson(QUERY_URL, input.credential, {
      taskId: input.remoteTaskId,
    });
    return normalizeResponse(response);
  }

  async download(url: string): Promise<{
    data: Uint8Array;
    contentType?: string;
  }> {
    const safeUrl = allowedDownloadUrl(url);
    const response = await this.fetcher(safeUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new AppError(
        "GENERATION_DOWNLOAD_FAILED",
        `RunningHub output download failed (${response.status})`,
        502,
      );
    }
    const length = response.headers.get("content-length");
    if (length && Number(length) > 500 * 1024 * 1024) {
      throw new AppError(
        "GENERATION_DOWNLOAD_TOO_LARGE",
        "RunningHub output exceeds the 500 MiB download limit",
        502,
      );
    }
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? undefined,
    };
  }

  private async requestJson(
    url: string,
    credential: string,
    body: JsonValue | FormData,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${credential}`,
    };
    const init: RequestInit = {
      method: "POST",
      headers,
      body: body instanceof FormData ? body : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    };
    if (!(body instanceof FormData)) headers["Content-Type"] = "application/json";

    const response = await this.fetcher(url, init);
    const text = await response.text();
    let value: unknown;
    try {
      value = text ? JSON.parse(text) : {};
    } catch {
      throw new AppError(
        "GENERATION_PROVIDER_PROTOCOL_ERROR",
        "RunningHub returned invalid JSON",
        502,
      );
    }
    if (!response.ok) {
      const record = objectValue(value);
      throw new AppError(
        "GENERATION_PROVIDER_ERROR",
        stringValue(record.errorMessage) ??
          stringValue(record.message) ??
          `RunningHub request failed (${response.status})`,
        502,
      );
    }
    return value;
  }
}

function requestBody(
  operation: string,
  generation: GenerationInput,
  assets: PreparedGenerationAsset[],
): JsonValue {
  const parameters = generation.parameters ?? {};
  const common = {
    prompt: generation.prompt,
  };
  switch (operation) {
    case "seedream-v5-pro-text-to-image":
      return {
        ...common,
        resolution: value(parameters, "resolution", "2k"),
        width: value(parameters, "width", null),
        height: value(parameters, "height", null),
        outputFormat: value(parameters, "outputFormat", "png"),
      };
    case "seedream-v5-pro-image-to-image":
      return {
        ...common,
        imageUrls: urlsForSlot(assets, "imageUrls"),
        resolution: value(parameters, "resolution", "2k"),
        width: value(parameters, "width", null),
        height: value(parameters, "height", null),
        outputFormat: value(parameters, "outputFormat", "png"),
      };
    case "seedance-2-text-to-video":
      return {
        ...common,
        ...videoParameters(parameters),
        webSearch: value(parameters, "webSearch", false),
      };
    case "seedance-2-image-to-video":
      return {
        ...common,
        ...videoParameters(parameters),
        firstFrameUrl: firstUrlForSlot(assets, "firstFrameUrl"),
        lastFrameUrl: firstUrlForSlot(assets, "lastFrameUrl"),
        realPersonMode: value(parameters, "realPersonMode", true),
        conversionSlots: value(parameters, "conversionSlots", ["all"]),
      };
    case "seedance-2-multimodal-video":
      return {
        ...common,
        ...videoParameters(parameters),
        imageUrls: urlsForSlot(assets, "imageUrls"),
        videoUrls: urlsForSlot(assets, "videoUrls"),
        audioUrls: urlsForSlot(assets, "audioUrls"),
        realPersonMode: value(parameters, "realPersonMode", true),
        conversionSlots: value(parameters, "conversionSlots", ["all"]),
      };
    default:
      throw new AppError(
        "GENERATION_OPERATION_UNSUPPORTED",
        `RunningHub operation is not supported: ${operation}`,
        400,
      );
  }
}

function videoParameters(parameters: Record<string, JsonValue>) {
  return {
    resolution: value(parameters, "resolution", "720p"),
    duration: String(value(parameters, "durationSeconds", 5)),
    generateAudio: value(parameters, "generateAudio", true),
    ratio: value(parameters, "aspectRatio", "adaptive"),
    returnLastFrame: value(parameters, "returnLastFrame", false),
    seed: value(parameters, "seed", -1),
  };
}

function value(
  parameters: Record<string, JsonValue>,
  key: string,
  fallback: JsonValue,
): JsonValue {
  return parameters[key] ?? fallback;
}

function urlsForSlot(
  assets: PreparedGenerationAsset[],
  slot: string,
): string[] {
  return assets.filter((asset) => asset.slot === slot).map((asset) => asset.url);
}

function firstUrlForSlot(
  assets: PreparedGenerationAsset[],
  slot: string,
): string | null {
  return assets.find((asset) => asset.slot === slot)?.url ?? null;
}

function normalizeResponse(value: unknown): ProviderSubmitResult {
  const record = objectValue(value);
  const status = stringValue(record.status) ?? "UNKNOWN";
  const state = status === "SUCCESS"
    ? "succeeded"
    : status === "FAILED"
      ? "failed"
      : "pending";
  return {
    state,
    remoteTaskId: stringValue(record.taskId),
    remoteStatus: status,
    outputs: outputsFrom(record.results),
    errorCode: stringValue(record.errorCode),
    errorMessage:
      stringValue(record.errorMessage) ?? stringValue(record.message),
    rawSnapshot: snapshot(value),
  };
}

function outputsFrom(value: unknown): ProviderOutput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = objectValue(item);
    return {
      url: stringValue(record.url),
      text: stringValue(record.text),
      outputType: stringValue(record.outputType),
    };
  }).filter((output) => output.url || output.text);
}

function snapshot(value: unknown): JsonValue {
  const json = JSON.stringify(toJsonValue(value));
  if (Buffer.byteLength(json, "utf8") <= SNAPSHOT_LIMIT_BYTES) {
    return JSON.parse(json) as JsonValue;
  }
  return {
    truncated: true,
    preview: json.slice(0, SNAPSHOT_LIMIT_BYTES),
  };
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /api[-_]?key|authorization|token|secret/i.test(key)
          ? "[REDACTED]"
          : toJsonValue(item),
      ]),
    );
  }
  return String(value);
}

function allowedDownloadUrl(value: string): string {
  const url = new URL(value);
  const allowedHost =
    url.hostname === "www.runninghub.cn" ||
    url.hostname.endsWith(".myqcloud.com");
  if (url.protocol !== "https:" || !allowedHost || url.username || url.password) {
    throw new AppError(
      "GENERATION_DOWNLOAD_URL_REJECTED",
      "RunningHub output URL is not allowed",
      502,
    );
  }
  return url.toString();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
