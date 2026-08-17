import type { ApiErrorResponse } from "@/contracts/common";
import { AppError } from "@/server/domain/app-error";
import type { AppErrorCode } from "@/server/domain/app-error";

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export async function handleRoute<T>(work: () => Promise<T>): Promise<Response> {
  try {
    return json(await work());
  } catch (error) {
    return errorResponse(error);
  }
}

export function errorResponse(error: unknown): Response {
  const appError =
    isAppError(error)
      ? error
      : new AppError(
          "INTERNAL_ERROR",
          error instanceof Error ? error.message : "Internal server error",
          500,
        );
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
    },
  };
  return json(body, { status: appError.status });
}

function isAppError(error: unknown): error is Error & {
  code: AppErrorCode;
  status: number;
  details?: unknown;
} {
  if (error instanceof AppError) return true;
  // Next 开发热更新可能加载两份 AppError 构造器，不能只依赖 instanceof。
  return error instanceof Error &&
    error.name === "AppError" &&
    typeof (error as { code?: unknown }).code === "string" &&
    Number.isInteger((error as { status?: unknown }).status) &&
    Number((error as { status?: unknown }).status) >= 400 &&
    Number((error as { status?: unknown }).status) <= 599;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Invalid JSON body", 400);
  }
}

