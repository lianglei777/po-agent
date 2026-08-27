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
import { QianwenUploadClient } from "./qianwen-upload-client";

const API_ORIGIN = "https://dashscope.aliyuncs.com/api/v1";
const DOWNLOAD_LIMIT_BYTES = 500 * 1024 * 1024;

export class QianwenAdapter implements GenerationProvider {
  readonly providerId = QIANWEN_PROVIDER_ID;

  private readonly uploads: QianwenUploadClient;
  constructor(private readonly fetcher: typeof fetch = fetch, now: () => Date = () => new Date()) { this.uploads = new QianwenUploadClient(fetcher, now); }

  async prepareAssets(input: {
    operation: string;
    executionConfig: JsonValue;
    assets: ProviderInputAsset[];
    credential: string;
  }): Promise<PreparedGenerationAsset[]> {
    const config=resolveQianwenExecutionConfig(input.operation, input.executionConfig);
    const prepared: PreparedGenerationAsset[]=[];
    for(const asset of input.assets)prepared.push(await this.uploads.upload(asset,input.credential,config.vendorModel));
    return prepared;
  }

  async submit(input: {
    operation: string;
    executionConfig: JsonValue;
    generation: GenerationInput;
    assets: PreparedGenerationAsset[];
    credential: string;
  }): Promise<ProviderSubmitResult> {
    const config = resolveQianwenExecutionConfig(input.operation, input.executionConfig);
    const body = buildQianwenRequest(config, input.generation, input.assets);
    const response = await this.requestJson(submitUrl(config.endpointId), input.credential, {
      method: "POST",
      headers: config.submitMode==="async-task" ? { "X-DashScope-Async": "enable" } : {},
      body: JSON.stringify(body),
    }, input.assets.length > 0);
    return {
      ...normalizeResponse(response, config),
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
    return normalizeResponse(response, config);
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
    resolvesOss = false,
  ): Promise<unknown> {
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${credential}`,
        "Content-Type": "application/json",
        ...(resolvesOss ? { "X-DashScope-OssResourceResolve": "enable" } : {}),
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

function normalizeResponse(value: unknown, config: ReturnType<typeof resolveQianwenExecutionConfig>): ProviderSubmitResult {
  const root = objectValue(value);
  const output = objectValue(root.output);
  const remoteTaskId = stringValue(output.task_id);
  const status = (stringValue(output.task_status) ?? "UNKNOWN").toUpperCase();
  const urls=config.resultProfile==="video-url-v1" ? [stringValue(output.video_url)].filter((url):url is string=>Boolean(url)) : choiceImageUrls(output);
  const synchronous=config.submitMode==="sync";
  const effectiveStatus=synchronous&&urls.length?"SUCCEEDED":status;
  const missingSucceededOutput = effectiveStatus === "SUCCEEDED" && urls.length===0;
  const succeeded = effectiveStatus === "SUCCEEDED" && urls.length>0;
  const pending = effectiveStatus === "PENDING" || effectiveStatus === "RUNNING";
  // 只接受文档明确声明的状态，避免供应商新增状态后被误判为可无限轮询。
  const unknownStatus = !succeeded
    && !pending
    && effectiveStatus !== "FAILED"
    && effectiveStatus !== "CANCELED"
    && effectiveStatus !== "UNKNOWN";
  const failed = effectiveStatus === "FAILED"
    || effectiveStatus === "CANCELED"
    || effectiveStatus === "UNKNOWN"
    || missingSucceededOutput
    || unknownStatus;
  return {
    state: succeeded ? "succeeded" : pending && remoteTaskId ? "pending" : "failed",
    remoteTaskId,
    remoteStatus: effectiveStatus,
    outputs: urls.map(url=>({url,outputType:config.resultProfile==="video-url-v1"?"mp4":"png"})),
    errorCode: failed
      ? missingSucceededOutput || unknownStatus
        ? "GENERATION_PROVIDER_PROTOCOL_ERROR"
        : stringValue(output.code) ?? `QIANWEN_TASK_${status}`
      : !remoteTaskId ? "GENERATION_PROVIDER_PROTOCOL_ERROR" : undefined,
    errorMessage: failed
      ? stringValue(output.message) ?? (missingSucceededOutput
        ? "Qianwen succeeded response did not include an output URL"
        : unknownStatus
          ? `Qianwen returned an unsupported task status: ${status}`
          : `Qianwen task ended with status ${status}`)
      : !remoteTaskId ? "Qianwen response did not include a task ID" : undefined,
    rawSnapshot: createGenerationProviderSnapshot(value),
    retryAfterMs: succeeded || failed ? undefined : config.pollIntervalMs,
  };
}

function allowedDownloadUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw rejectedDownloadUrl();
  }
  // 不同视频模型返回不同的阿里云 OSS bucket；限制在 HTTPS OSS 服务域名内，仍拒绝任意外部主机。
  const allowedHost = /^[a-z0-9][a-z0-9.-]*\.oss(?:-accelerate|-cn-[a-z0-9-]+)\.aliyuncs\.com$/i.test(url.hostname);
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
function submitUrl(endpointId:string){const paths:Record<string,string>={"video-synthesis":"/services/aigc/video-generation/video-synthesis","multimodal-generation":"/services/aigc/multimodal-generation/generation","image-generation":"/services/aigc/image-generation/generation"};const path=paths[endpointId];if(!path)throw new AppError("GENERATION_OPERATION_UNSUPPORTED","Qianwen endpoint is not supported",400);return API_ORIGIN+path;}
function choiceImageUrls(output:Record<string,unknown>):string[]{const choices=Array.isArray(output.choices)?output.choices:[];return choices.flatMap(choice=>{const content=objectValue(objectValue(choice).message).content;return Array.isArray(content)?content.map(item=>stringValue(objectValue(item).image)).filter((url):url is string=>Boolean(url)):[];});}
