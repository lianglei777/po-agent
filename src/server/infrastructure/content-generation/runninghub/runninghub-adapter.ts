import type { JsonValue } from "@/contracts/generation";
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
import { createGenerationProviderSnapshot } from "../generation-provider-snapshot";
import { RUNNINGHUB_PROVIDER_ID } from "./runninghub-provider-constants";
import {
  buildRunningHubRequest,
  resolveRunningHubExecutionConfig,
} from "./runninghub-request-builder";

const API_ORIGIN = "https://www.runninghub.cn";
const UPLOAD_URL = `${API_ORIGIN}/openapi/v2/media/upload/binary`;
const QUERY_URL = `${API_ORIGIN}/openapi/v2/query`;

export class RunningHubAdapter implements GenerationProvider {
  readonly providerId = RUNNINGHUB_PROVIDER_ID;

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async prepareAssets(input: {
    operation: string;
    executionConfig?: JsonValue;
    assets: ProviderInputAsset[];
    credential: string;
  }): Promise<PreparedGenerationAsset[]> {
    resolveRunningHubExecutionConfig(input.operation, input.executionConfig ?? {});
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
        bindingId: asset.bindingId,
        order: asset.order,
        name: asset.name,
        mimeType: asset.mimeType,
        reference: { kind: "url", url: data.download_url },
      });
    }
    return uploaded;
  }

  async submit(input: {
    operation: string;
    executionConfig?: JsonValue;
    generation: GenerationInput;
    assets: PreparedGenerationAsset[];
    credential: string;
  }): Promise<ProviderSubmitResult> {
    const config = resolveRunningHubExecutionConfig(
      input.operation,
      input.executionConfig ?? {},
    );
    const body = buildRunningHubRequest(config, input.generation, input.assets);
    const response = await this.requestJson(
      `${API_ORIGIN}${config.endpoint}`,
      input.credential,
      body,
    );
    return {
      ...normalizeResponse(response),
      requestSnapshot: createGenerationProviderSnapshot(body),
    };
  }

  async poll(input: {
    operation: string;
    executionConfig?: JsonValue;
    remoteTaskId: string;
    credential: string;
  }): Promise<ProviderPollResult> {
    resolveRunningHubExecutionConfig(input.operation, input.executionConfig ?? {});
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
      if (response.status === 429) {
        throw new AppError(
          "GENERATION_PROVIDER_RATE_LIMITED",
          stringValue(record.errorMessage) ?? stringValue(record.message) ?? "RunningHub rate limit was reached",
          429,
          { retryAfterMs: parseRetryAfter(response.headers.get("retry-after")) },
        );
      }
      throw new AppError(
        "GENERATION_PROVIDER_ERROR",
        stringValue(record.errorMessage) ??
          stringValue(record.message) ??
          `RunningHub request failed (${response.status})`,
        response.status,
      );
    }
    return value;
  }
}

function parseRetryAfter(value:string|null):number|undefined {
  if (!value) return undefined;
  const seconds=Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds*1000;
  const timestamp=Date.parse(value);
  return Number.isFinite(timestamp)?Math.max(0,timestamp-Date.now()):undefined;
}

function normalizeResponse(value: unknown): ProviderSubmitResult {
  const root = objectValue(value);
  const nested = objectValue(root.data);
  // RunningHub 的不同网关可能直接返回任务字段，也可能包在 data 中；适配器在此统一协议差异。
  const record = hasProviderResultFields(nested) ? nested : root;
  const remoteTaskId = stringValue(record.taskId) ?? stringValue(root.taskId);
  const status = (stringValue(record.status) ?? stringValue(root.status) ?? "UNKNOWN").toUpperCase();
  const providerCode = nonSuccessCode(record.errorCode) ??
    nonSuccessCode(root.errorCode) ??
    nonSuccessCode(root.code);
  const providerMessage = firstMeaningfulMessage(
    record.errorMessage,
    record.message,
    record.msg,
    root.errorMessage,
    root.message,
    root.msg,
  );
  const outputs = outputsFrom(record.results ?? root.results);
  const explicitlyFailed = status === "FAILED" || status === "FAIL" ||
    Boolean(providerCode) || Boolean(providerMessage && !remoteTaskId);
  const state = status === "SUCCESS"
    ? "succeeded"
    : explicitlyFailed || (!remoteTaskId && outputs.length === 0)
      ? "failed"
      : "pending";
  return {
    state,
    remoteTaskId,
    remoteStatus: status,
    outputs,
    errorCode: providerCode ?? (state === "failed" && !remoteTaskId
      ? "GENERATION_PROVIDER_PROTOCOL_ERROR"
      : undefined),
    errorMessage: providerMessage ?? (state === "failed" && !remoteTaskId
      ? "RunningHub response did not include a task ID"
      : undefined),
    rawSnapshot: createGenerationProviderSnapshot(value),
  };
}

function hasProviderResultFields(value: Record<string, unknown>): boolean {
  return ["taskId", "status", "results", "errorCode", "errorMessage"]
    .some((key) => key in value);
}

function nonSuccessCode(value: unknown): string | undefined {
  if (typeof value === "number") return value === 0 ? undefined : String(value);
  if (typeof value !== "string") return undefined;
  const code = value.trim();
  return !code || code === "0" || code.toLowerCase() === "success" ? undefined : code;
}

function firstMeaningfulMessage(...values: unknown[]): string | undefined {
  for (const value of values) {
    const message = stringValue(value)?.trim();
    if (message && !/^(ok|success|successful)$/i.test(message)) return message;
  }
  return undefined;
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
