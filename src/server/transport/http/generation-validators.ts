import {
  GENERATION_CAPABILITIES,
  type CreateGenerationRunRequest,
  type ConfirmGenerationRunRequest,
  type GenerationAssetRef,
  type GenerationInputAsset,
  type PlanGenerationTurnRequest,
  type RetryGenerationRunRequest,
} from "@/contracts/generation";
import type { JsonValue } from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import {
  asObject,
  optionalString,
  requiredString,
} from "./validators";

export function parseCreateGenerationRun(
  value: unknown,
): CreateGenerationRunRequest {
  const object = asObject(value);
  const capability = requiredString(object, "capability");
  if (!GENERATION_CAPABILITIES.includes(
    capability as (typeof GENERATION_CAPABILITIES)[number],
  )) {
    invalid("capability is not supported");
  }
  const source = optionalString(object, "source");
  if (source !== undefined && source !== "direct-ui" && source !== "api") {
    invalid("source must be direct-ui or api");
  }
  return {
    capability: capability as CreateGenerationRunRequest["capability"],
    routeId: optionalString(object, "routeId"),
    parentRunId: optionalString(object, "parentRunId"),
    prompt: requiredText(object, "prompt"),
    originalPrompt: optionalString(object, "originalPrompt"),
    assets: parseAssets(object.assets),
    parameters: parseJsonRecord(object.parameters, "parameters"),
    source,
    sourceRef: optionalString(object, "sourceRef"),
    idempotencyKey: requiredString(object, "idempotencyKey"),
    reviewFirst: optionalBoolean(object, "reviewFirst"),
  };
}

function optionalBoolean(
  object: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") invalid(`${key} must be a boolean`);
  return value;
}

export function parsePlanGenerationTurnRequest(
  value: unknown,
): PlanGenerationTurnRequest {
  const object = asObject(value);
  const modeValue = asObject(object.mode, "mode");
  const modeType = requiredString(modeValue, "type");
  const mode = modeType === "generation-auto"
    ? { type: modeType } as const
    : modeType === "generation-route"
      ? { type: modeType, routeId: requiredString(modeValue, "routeId") } as const
      : invalid("mode.type must be generation-auto or generation-route");
  if (!Array.isArray(object.assets)) invalid("assets must be an array");
  const assets = object.assets.map((value, index) => {
    const asset = asObject(value, `assets[${index}]`);
    const mediaType = requiredString(asset, "mediaType");
    if (mediaType !== "image" && mediaType !== "video" && mediaType !== "audio") {
      invalid(`assets[${index}].mediaType is not supported`);
    }
    const supportedMediaType: "image" | "video" | "audio" = mediaType;
    const mimeType = requiredString(asset, "mimeType");
    if (!mimeType.startsWith(`${supportedMediaType}/`)) {
      invalid(`assets[${index}].mimeType does not match mediaType`);
    }
    return { mediaType: supportedMediaType, mimeType };
  });
  const modelValue = asObject(object.model, "model");
  return {
    message: requiredText(object, "message"),
    sessionId: optionalString(object, "sessionId"),
    model: {
      provider: requiredString(modelValue, "provider"),
      modelId: requiredString(modelValue, "modelId"),
    },
    mode,
    assets,
  };
}

function requiredText(object: Record<string, unknown>, key: string): string {
  const value = object[key];
  if (typeof value !== "string") invalid(`${key} must be a string`);
  return value;
}

export function parseRetryGenerationRun(value: unknown): RetryGenerationRunRequest {
  const object = asObject(value);
  return { idempotencyKey: requiredString(object, "idempotencyKey") };
}

export function parseConfirmGenerationRun(
  value: unknown,
): ConfirmGenerationRunRequest {
  const object = asObject(value);
  return {
    prompt: requiredText(object, "prompt"),
    parameters: parseJsonRecord(object.parameters, "parameters"),
  };
}

function parseAssets(value: unknown): GenerationInputAsset[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalid("assets must be an array");
  return value.map((item, index) => {
    const asset = asObject(item, `assets[${index}]`);
    return {
      slot: requiredString(asset, "slot"),
      ref: parseAssetRef(asset.ref, `assets[${index}].ref`),
    };
  });
}

function parseAssetRef(value: unknown, name: string): GenerationAssetRef {
  const ref = asObject(value, name);
  const type = requiredString(ref, "type");
  if (type === "artifact") {
    return { type, artifactId: requiredString(ref, "artifactId") };
  }
  if (type === "workspace-file") {
    return { type, relativePath: requiredString(ref, "relativePath") };
  }
  invalid(`${name}.type must be artifact or workspace-file`);
}

function parseJsonRecord(
  value: unknown,
  name: string,
): Record<string, JsonValue> | undefined {
  if (value === undefined) return undefined;
  const object = asObject(value, name);
  return Object.fromEntries(
    Object.entries(object).map(([key, item]) => [
      key,
      parseJsonValue(item, `${name}.${key}`),
    ]),
  );
}

function parseJsonValue(value: unknown, name: string): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((item, index) => parseJsonValue(item, `${name}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        parseJsonValue(item, `${name}.${key}`),
      ]),
    );
  }
  invalid(`${name} must be a JSON value`);
}

function invalid(message: string): never {
  throw new AppError("VALIDATION_ERROR", message, 400);
}
