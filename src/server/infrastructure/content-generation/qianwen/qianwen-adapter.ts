import type { JsonValue } from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import type {
  GenerationInput,
  PreparedGenerationAsset,
} from "@/server/domain/generation";
import type {
  GenerationProvider,
  ProviderInputAsset,
  ProviderPollResult,
  ProviderSubmitResult,
} from "@/server/ports/generation-provider";
import { createGenerationProviderSnapshot } from "../generation-provider-snapshot";
import { QIANWEN_PROVIDER_ID } from "./qianwen-provider-constants";
import {
  buildQianwenRequest,
  resolveQianwenExecutionConfig,
} from "./qianwen-request-builder";

const API_ORIGIN = "https://dashscope.aliyuncs.com/api/v1";
const VIDEO_SYNTHESIS_URL = `${API_ORIGIN}/services/aigc/video-generation/video-synthesis`;
const DOWNLOAD_LIMIT_BYTES = 500 * 1024 * 1024;

export class QianwenAdapter implements GenerationProvider {
  readonly providerId = QIANWEN_PROVIDER_ID;

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async prepareAssets(input: {
    operation: string;
    executionConfig: JsonValue;
    assets: ProviderInputAsset[];
    credential: string;
  }): Promise<PreparedGenerationAsset[]> {
    resolveQianwenExecutionConfig(input.operation, input.executionConfig);
    if (input.assets.length > 0) {
      // 首阶段只开放文生视频；素材上传必须等 OSS 临时 URL 生命周期完整实现后再启用。
      throw new AppError(
        "GENERATION_OPERATION_UNSUPPORTED",
        "Qianwen Wan 3.0 text-to-video does not accept input assets",
        400,
      );
    }
    return [];
  }

  async submit(input: {
    operation: string;
    executionConfig: JsonValue;
    generation: GenerationInput;
    assets: PreparedGenerationAsset[];
    credential: string;
  }): Promise<ProviderSubmitResult> {
    const config = resolveQianwenExecutionConfig(input.operation, input.executionConfig);
    if (input.assets.length > 0) {
      throw new AppError(
        "GENERATION_OPERATION_UNSUPPORTED",
        "Qianwen Wan 3.0 text-to-video does not accept prepared assets",
        400,
      );
    }
    const body = buildQianwenRequest(config, input.generation);
    const response = await this.requestJson(VIDEO_SYNTHESIS_URL, input.credential, {
      method: "POST",
      headers: { "X-DashScope-Async": "enable" },
      body: JSON.stringify(body),
    });
    return {
      ...normalizeResponse(response, config.pollIntervalMs),
      requestSnapshot: createGenerationProviderSnapshot(body),
    };
  }

  async poll(input: {
    operation: string;
    executionConfig: JsonValue;
    remoteTaskId: string;
    credential: string;
  }): Promise<ProviderPollResult> {
    const config = resolveQianwenExecutionConfig(input.operation, input.executionConfig);
    const response = await this.requestJson(
      `${API_ORIGIN}/tasks/${encodeURIComponent(input.remoteTaskId)}`,
      input.credential,
      { method: "GET" },
    );
    return normalizeResponse(response, config.pollIntervalMs);
  }

  async download(url: string): Promise<{ data: Uint8Array; contentType?: string }> {
    const safeUrl = allowedDownloadUrl(url);
    const response = await this.fetcher(safeUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new AppError(
        "GENERATION_DOWNLOAD_FAILED",
        `Qianwen output download failed (${response.status})`,
        502,
      );
    }
    const length = response.headers.get("content-length");
    if (length && Number(length) > DOWNLOAD_LIMIT_BYTES) {
      throw new AppError(
        "GENERATION_DOWNLOAD_TOO_LARGE",
        "Qianwen output exceeds the 500 MiB download limit",
        502,
      );
    }
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > DOWNLOAD_LIMIT_BYTES) {
      throw new AppError(
        "GENERATION_DOWNLOAD_TOO_LARGE",
        "Qianwen output exceeds the 500 MiB download limit",
        502,
      );
    }
    return {
      data,
      contentType: response.headers.get("content-type") ?? undefined,
    };
  }

  private async requestJson(
    url: string,
    credential: string,
    init: Pick<RequestInit, "method" | "body" | "headers">,
  ): Promise<unknown> {
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    const text = await response.text();
    let value: unknown;
    try {
      value = text ? JSON.parse(text) : {};
    } catch {
      throw new AppError(
        "GENERATION_PROVIDER_PROTOCOL_ERROR",
        "Qianwen returned invalid JSON",
        502,
      );
    }
    if (!response.ok) {
      const root = objectValue(value);
      throw new AppError(
        "GENERATION_PROVIDER_ERROR",
        stringValue(root.message) ?? `Qianwen request failed (${response.status})`,
        502,
      );
    }
    return value;
  }
}

function normalizeResponse(value: unknown, retryAfterMs: number): ProviderSubmitResult {
  const root = objectValue(value);
  const output = objectValue(root.output);
  const remoteTaskId = stringValue(output.task_id);
  const status = (stringValue(output.task_status) ?? "UNKNOWN").toUpperCase();
  const videoUrl = stringValue(output.video_url);
  const missingSucceededOutput = status === "SUCCEEDED" && !videoUrl;
  const failed = status === "FAILED" || status === "CANCELED" || status === "UNKNOWN" || missingSucceededOutput;
  const succeeded = status === "SUCCEEDED" && Boolean(videoUrl);
  return {
    state: succeeded ? "succeeded" : failed || !remoteTaskId ? "failed" : "pending",
    remoteTaskId,
    remoteStatus: status,
    outputs: videoUrl ? [{ url: videoUrl, outputType: "mp4" }] : [],
    errorCode: failed
      ? stringValue(output.code) ?? (missingSucceededOutput
        ? "GENERATION_PROVIDER_PROTOCOL_ERROR"
        : `QIANWEN_TASK_${status}`)
      : !remoteTaskId ? "GENERATION_PROVIDER_PROTOCOL_ERROR" : undefined,
    errorMessage: failed
      ? stringValue(output.message) ?? (missingSucceededOutput
        ? "Qianwen succeeded response did not include a video URL"
        : `Qianwen task ended with status ${status}`)
      : !remoteTaskId ? "Qianwen response did not include a task ID" : undefined,
    rawSnapshot: createGenerationProviderSnapshot(value),
    retryAfterMs: succeeded || failed ? undefined : retryAfterMs,
  };
}

function allowedDownloadUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw rejectedDownloadUrl();
  }
  const allowedHost = /^dashscope-result(?:-[a-z0-9-]+)?\.oss(?:-accelerate|-cn-[a-z0-9-]+)\.aliyuncs\.com$/i.test(url.hostname);
  if (url.protocol !== "https:" || !allowedHost || url.username || url.password) {
    throw rejectedDownloadUrl();
  }
  return url.toString();
}

function rejectedDownloadUrl(): AppError {
  return new AppError(
    "GENERATION_DOWNLOAD_URL_REJECTED",
    "Qianwen output URL is not allowed",
    502,
  );
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
