import type { UpdateGenerationRouteRequest } from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import { asObject } from "./validators";

export function updateGenerationRouteRequest(value: unknown): UpdateGenerationRouteRequest {
  const body = asObject(value);
  const input: UpdateGenerationRouteRequest = {
    enabled: optionalBoolean(body.enabled, "enabled"),
    isDefault: optionalBoolean(body.isDefault, "isDefault"),
  };
  if (input.enabled === undefined && input.isDefault === undefined) {
    throw new AppError("VALIDATION_ERROR", "enabled or isDefault is required", 400);
  }
  if (input.isDefault === false) {
    throw new AppError("VALIDATION_ERROR", "isDefault only supports true", 400);
  }
  if (input.enabled === false && input.isDefault === true) {
    // 冲突请求必须在任何写操作前失败，避免返回错误时 Route 已被部分停用。
    throw new AppError(
      "VALIDATION_ERROR",
      "A generation route cannot be disabled and made default in the same request",
      400,
    );
  }
  return input;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new AppError("VALIDATION_ERROR", `${name} must be a boolean`, 400);
  }
  return value;
}
