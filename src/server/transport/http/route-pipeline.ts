import { randomUUID } from "node:crypto";
import type { UnexpectedErrorLogger } from "@/server/ports/http-unexpected-error-logger";
import { errorResponse, isAppError, json } from "./api-response";

export type RouteWork<T> = () => Promise<T | Response> | T | Response;

export interface RoutePipelineOptions {
  authorize?: () => Promise<void> | void;
  requestId?: string;
  unexpectedErrorLogger?: UnexpectedErrorLogger;
}

export async function executeRoute<T>(
  work: RouteWork<T>,
  options: RoutePipelineOptions = {},
): Promise<Response> {
  const requestId = options.requestId ?? randomUUID();
  try {
    await options.authorize?.();
    const result = await work();
    return finalizeResponse(
      result instanceof Response ? result : json(result),
      { requestId, error: false },
    );
  } catch (error) {
    if (!isAppError(error)) {
      logUnexpectedError(options.unexpectedErrorLogger, { requestId, error });
    }
    return finalizeResponse(errorResponse(error), {
      requestId,
      error: true,
    });
  }
}

function logUnexpectedError(
  logger: UnexpectedErrorLogger | undefined,
  input: Parameters<UnexpectedErrorLogger["log"]>[0],
): void {
  try {
    // 诊断日志是尽力写入：磁盘变慢或写入失败都不能延迟、替换原始 HTTP 响应。
    void Promise.resolve(logger?.log(input)).catch(() => {});
  } catch {
    // 同时隔离 logger 在返回 Promise 前同步抛出的异常。
  }
}

export function finalizeResponse(
  response: Response,
  input: { requestId: string; error: boolean },
): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("X-Request-Id")) {
    headers.set("X-Request-Id", input.requestId);
  }
  headers.set("X-Content-Type-Options", "nosniff");
  appendVary(headers, "Cookie");

  if (input.error) {
    headers.set("Cache-Control", "no-store");
  } else if (!headers.has("Cache-Control")) {
    headers.set("Cache-Control", "private, no-store");
  }

  // 新建 Response 以兼容 headers guard 为 immutable 的上游或流式响应。
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function appendVary(headers: Headers, value: string): void {
  const existing = headers.get("Vary");
  if (!existing) {
    headers.set("Vary", value);
    return;
  }
  const values = existing.split(",").map((item) => item.trim().toLowerCase());
  if (!values.includes(value.toLowerCase())) {
    headers.set("Vary", `${existing}, ${value}`);
  }
}
