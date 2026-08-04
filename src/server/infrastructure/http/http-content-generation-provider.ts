import { AppError } from "@/server/domain/app-error";
import type {
  ContentUploadConfig,
  HttpRequestTemplate,
  JsonValue,
} from "@/contracts/content-generation";
import type { ContentGenerationInputFile } from "@/server/domain/content-generation";
import type { ContentGenerationProvider } from "@/server/ports/content-generation-provider";

export class HttpContentGenerationProvider
  implements ContentGenerationProvider
{
  async upload(
    config: ContentUploadConfig,
    file: ContentGenerationInputFile,
    headers: Record<string, string>,
  ) {
    const form = new FormData();
    const bytes = file.data.buffer.slice(
      file.data.byteOffset,
      file.data.byteOffset + file.data.byteLength,
    ) as ArrayBuffer;
    form.append(
      config.fileField,
      new Blob([bytes], { type: file.mimeType }),
      file.name,
    );
    return requestJson(config.url, {
      method: "POST",
      headers,
      body: form,
    });
  }

  async request(
    config: HttpRequestTemplate,
    headers: Record<string, string>,
    body?: JsonValue,
  ) {
    const url = new URL(config.url);
    const init: RequestInit = { method: config.method, headers };
    if (config.method !== "GET" && body !== undefined) {
      init.body = JSON.stringify(body);
    }
    return requestJson(url.toString(), init);
  }

  async download(url: string) {
    const response = await fetch(allowedHttpUrl(url), {
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new AppError(
        "CONTENT_DOWNLOAD_FAILED",
        `Content download failed (${response.status})`,
        502,
      );
    }
    return {
      data: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? undefined,
    };
  }
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(allowedHttpUrl(url), {
    ...init,
    signal: AbortSignal.timeout(120_000),
  });
  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new AppError(
      "CONTENT_PROVIDER_PROTOCOL_ERROR",
      "Content provider returned invalid JSON",
      502,
    );
  }
  if (!response.ok) {
    throw new AppError(
      "CONTENT_PROVIDER_ERROR",
      providerMessage(data) ?? `Content provider request failed (${response.status})`,
      502,
    );
  }
  return data;
}

function allowedHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Content generation URLs must use HTTP or HTTPS",
      400,
    );
  }
  return url;
}

function providerMessage(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return typeof record.errorMessage === "string"
    ? record.errorMessage
    : typeof record.message === "string"
      ? record.message
      : null;
}
