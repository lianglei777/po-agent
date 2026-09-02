import { randomUUID } from "node:crypto";
import { errorResponse, json } from "./api-response";

export type RouteWork<T> = () => Promise<T | Response> | T | Response;

export interface RoutePipelineOptions {
  authorize?: () => Promise<void> | void;
  requestId?: string;
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
    return finalizeResponse(errorResponse(error), {
      requestId,
      error: true,
    });
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
