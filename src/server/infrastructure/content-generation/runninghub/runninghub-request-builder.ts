import type { JsonValue } from "@/contracts/generation";
import { AppError } from "@/server/domain/app-error";
import type {
  GenerationInput,
  PreparedGenerationAsset,
} from "@/server/domain/generation";
import {
  runningHubExecutionConfigForOperation,
  type RunningHubExecutionConfig,
  type RunningHubRequestField,
} from "./runninghub-catalog";

export function resolveRunningHubExecutionConfig(
  operation: string,
  value: JsonValue,
): RunningHubExecutionConfig {
  if (isEmptyObject(value)) {
    // Catalog 上线前创建的 Job 没有执行快照；只在该兼容分支按稳定 operation 补齐旧协议。
    const legacy = runningHubExecutionConfigForOperation(operation);
    if (legacy) return legacy;
  }
  const config = parseExecutionConfig(value);
  if (!config || config.operation !== operation) {
    throw new AppError(
      "GENERATION_OPERATION_UNSUPPORTED",
      `RunningHub operation is not supported: ${operation}`,
      400,
    );
  }
  return config;
}

export function buildRunningHubRequest(
  config: RunningHubExecutionConfig,
  generation: GenerationInput,
  assets: PreparedGenerationAsset[],
): JsonValue {
  const body: Record<string, JsonValue> = {};
  const parameters = generation.parameters ?? {};
  for (const field of config.fields) {
    let value: JsonValue;
    if (field.source === "prompt") {
      value = generation.prompt;
    } else if (field.source === "parameter") {
      value = parameters[field.key] ?? field.fallback;
      if (field.serialize === "string" && value !== null) value = String(value);
      if (field.omitWhenEmpty && isEmpty(value)) continue;
    } else {
      if (field.serialize === "numbered") {
        const references = referencesForSlot(assets, field.key);
        for (let index = 0; index < (field.maxItems ?? 0); index += 1) {
          body[`${field.vendorKey}${index + 1}`] = references[index] ?? null;
        }
        continue;
      }
      value = field.serialize === "list" ? referencesForSlot(assets, field.key) : firstReferenceForSlot(assets, field.key);
    }
    body[field.vendorKey] = value;
  }
  return body;
}

function parseExecutionConfig(value: JsonValue): RunningHubExecutionConfig | null {
  const record = objectValue(value);
  if (
    record.protocol !== "runninghub-standard-v1" ||
    typeof record.operation !== "string" ||
    typeof record.endpoint !== "string" ||
    !record.endpoint.startsWith("/openapi/v2/") ||
    record.endpoint.includes("://") ||
    !Array.isArray(record.fields)
  ) return null;
  const fields: RunningHubRequestField[] = [];
  for (const item of record.fields) {
    const field = parseField(item);
    if (!field) return null;
    fields.push(field);
  }
  return {
    protocol: "runninghub-standard-v1",
    operation: record.operation,
    endpoint: record.endpoint,
    fields,
  };
}

function parseField(value: JsonValue): RunningHubRequestField | null {
  const field = objectValue(value);
  if (typeof field.vendorKey !== "string" || !field.vendorKey) return null;
  if (field.source === "prompt") {
    return { source: "prompt", vendorKey: field.vendorKey };
  }
  if (
    field.source === "parameter" &&
    typeof field.key === "string" &&
    (field.serialize === undefined || field.serialize === "identity" || field.serialize === "string") &&
    (field.omitWhenEmpty === undefined || typeof field.omitWhenEmpty === "boolean")
  ) {
    return {
      source: "parameter",
      key: field.key,
      vendorKey: field.vendorKey,
      fallback: field.fallback ?? null,
      serialize: field.serialize,
      omitWhenEmpty: field.omitWhenEmpty,
    };
  }
  if (
    field.source === "asset" &&
    typeof field.key === "string" &&
    (field.serialize === "first" || field.serialize === "list" || field.serialize === "numbered") &&
    (field.maxItems === undefined || (typeof field.maxItems === "number" && Number.isInteger(field.maxItems) && field.maxItems > 0))
  ) {
    return {
      source: "asset",
      key: field.key,
      vendorKey: field.vendorKey,
      serialize: field.serialize,
      maxItems: field.maxItems,
    };
  }
  return null;
}

function referencesForSlot(
  assets: PreparedGenerationAsset[],
  slot: string,
): string[] {
  return orderedAssetsForSlot(assets, slot).map(assetUrl);
}

function firstReferenceForSlot(
  assets: PreparedGenerationAsset[],
  slot: string,
): string | null {
  const asset = orderedAssetsForSlot(assets, slot)[0];
  return asset ? assetUrl(asset) : null;
}

function orderedAssetsForSlot(
  assets: PreparedGenerationAsset[],
  slot: string,
): PreparedGenerationAsset[] {
  return assets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => asset.slot === slot)
    .sort((left, right) => (left.asset.order ?? left.index) - (right.asset.order ?? right.index))
    .map(({ asset }) => asset);
}

function assetUrl(asset: PreparedGenerationAsset): string {
  const reference = objectValue(asset.reference);
  if (reference.kind === "url" && typeof reference.url === "string") {
    return reference.url;
  }
  // Catalog 迁移前已持久化的 prepared asset 使用顶层 url。
  const legacyUrl = (asset as unknown as { url?: unknown }).url;
  if (typeof legacyUrl === "string") return legacyUrl;
  throw new AppError(
    "GENERATION_PROVIDER_PROTOCOL_ERROR",
    "RunningHub prepared asset does not contain a URL reference",
    500,
  );
}

function objectValue(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function isEmptyObject(value: JsonValue): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === 0;
}

function isEmpty(value: JsonValue): boolean {
  return value === null || value === "" || (Array.isArray(value) && value.length === 0);
}
