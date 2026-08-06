import {
  GENERATION_CAPABILITIES,
  type CreateGenerationRunRequest,
  type GenerationAssetRef,
  type GenerationInputAsset,
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
    assets: parseAssets(object.assets),
    parameters: parseJsonRecord(object.parameters, "parameters"),
    source,
    sourceRef: optionalString(object, "sourceRef"),
    idempotencyKey: requiredString(object, "idempotencyKey"),
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
