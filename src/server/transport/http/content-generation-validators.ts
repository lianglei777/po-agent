import {
  CONTENT_GENERATION_CAPABILITIES,
  type ContentCompletionConfig,
  type ContentGenerationCapability,
  type ContentOutputConfig,
  type ContentSubmitConfig,
  type ContentUploadConfig,
  type HttpRequestTemplate,
  type JsonValue,
  type SaveContentGenerationApiRequest,
} from "@/contracts/content-generation";
import { AppError } from "@/server/domain/app-error";
import { asObject, requiredBoolean, requiredString } from "./validators";

export function parseContentGenerationApi(value: unknown): SaveContentGenerationApiRequest {
  const object = asObject(value);
  const capability = requiredString(object, "capability");
  if (!CONTENT_GENERATION_CAPABILITIES.includes(capability as ContentGenerationCapability)) {
    invalid(`capability must be one of ${CONTENT_GENERATION_CAPABILITIES.join(", ")}`);
  }
  return {
    id: requiredString(object, "id"),
    name: requiredString(object, "name"),
    providerName: requiredString(object, "providerName"),
    capability: capability as ContentGenerationCapability,
    requiresImages: requiredBoolean(object, "requiresImages"),
    apiKey: optionalString(object.apiKey, "apiKey"),
    commonHeaders: stringRecord(object.commonHeaders, "commonHeaders"),
    upload: object.upload === undefined ? undefined : parseUpload(object.upload),
    submit: parseSubmit(object.submit),
    completion: parseCompletion(object.completion),
    output: parseOutput(object.output),
  };
}

function parseUpload(value: unknown): ContentUploadConfig {
  const object = asObject(value, "upload");
  return {
    url: httpUrl(object.url, "upload.url"),
    headers: stringRecord(object.headers, "upload.headers"),
    fileField: requiredString(object, "fileField"),
    urlPath: requiredString(object, "urlPath"),
    successPath: optionalString(object.successPath, "upload.successPath"),
    successValues: primitiveArray(object.successValues, "upload.successValues"),
    errorPath: optionalString(object.errorPath, "upload.errorPath"),
    acceptedTypes: stringArray(object.acceptedTypes, "upload.acceptedTypes"),
    maxFiles: optionalPositiveNumber(object.maxFiles, "upload.maxFiles"),
    maxFileSizeBytes: optionalPositiveNumber(object.maxFileSizeBytes, "upload.maxFileSizeBytes"),
  };
}

function parseSubmit(value: unknown): ContentSubmitConfig {
  const object = asObject(value, "submit");
  return {
    ...parseRequest(object, "submit"),
    taskIdPath: optionalString(object.taskIdPath, "submit.taskIdPath"),
    statusPath: optionalString(object.statusPath, "submit.statusPath"),
    errorPath: optionalString(object.errorPath, "submit.errorPath"),
  };
}

function parseCompletion(value: unknown): ContentCompletionConfig {
  const object = asObject(value, "completion");
  const mode = requiredString(object, "mode");
  if (mode === "immediate") return { mode };
  if (mode !== "polling") invalid("completion.mode must be immediate or polling");
  return {
    mode,
    request: parseRequest(asObject(object.request, "completion.request"), "completion.request"),
    statusPath: requiredString(object, "statusPath"),
    pendingValues: requiredStringArray(object.pendingValues, "completion.pendingValues"),
    successValues: requiredStringArray(object.successValues, "completion.successValues"),
    failureValues: requiredStringArray(object.failureValues, "completion.failureValues"),
    errorPath: optionalString(object.errorPath, "completion.errorPath"),
    intervalMs: boundedNumber(object.intervalMs, "completion.intervalMs", 5000, 60_000),
    timeoutMs: boundedNumber(object.timeoutMs, "completion.timeoutMs", 10_000, 86_400_000),
  };
}

function parseOutput(value: unknown): ContentOutputConfig {
  const object = asObject(value, "output");
  const defaultMediaType = requiredString(object, "defaultMediaType");
  if (defaultMediaType !== "image" && defaultMediaType !== "video") {
    invalid("output.defaultMediaType must be image or video");
  }
  return {
    collectionPath: requiredString(object, "collectionPath"),
    urlPath: optionalString(object.urlPath, "output.urlPath"),
    typePath: optionalString(object.typePath, "output.typePath"),
    textPath: optionalString(object.textPath, "output.textPath"),
    defaultMediaType,
    downloadRemoteFiles: requiredBoolean(object, "downloadRemoteFiles"),
  };
}

function parseRequest(object: Record<string, unknown>, name: string): HttpRequestTemplate {
  const method = requiredString(object, "method");
  if (method !== "GET" && method !== "POST") invalid(`${name}.method must be GET or POST`);
  return {
    method,
    url: httpUrl(object.url, `${name}.url`),
    headers: stringRecord(object.headers, `${name}.headers`),
    bodyTemplate: object.bodyTemplate === undefined ? undefined : jsonValue(object.bodyTemplate, `${name}.bodyTemplate`),
  };
}

function jsonValue(value: unknown, name: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${name}[${index}]`));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonValue(item, `${name}.${key}`)]));
  invalid(`${name} must contain only JSON values`);
}

function httpUrl(value: unknown, name: string) {
  if (typeof value !== "string") invalid(`${name} must be a URL`);
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    invalid(`${name} must use HTTP or HTTPS`);
  }
}

function optionalString(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalid(`${name} must be a string`);
  return value;
}

function stringRecord(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${name} must be an object`);
  if (!Object.values(value).every((item) => typeof item === "string")) invalid(`${name} must contain only strings`);
  return value as Record<string, string>;
}

function stringArray(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) invalid(`${name} must be an array of strings`);
  return value as string[];
}

function requiredStringArray(value: unknown, name: string) {
  const result = stringArray(value, name);
  if (!result?.length) invalid(`${name} must not be empty`);
  return result;
}

function primitiveArray(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean")) invalid(`${name} must contain strings, numbers, or booleans`);
  return value as Array<string | number | boolean>;
}

function optionalPositiveNumber(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) invalid(`${name} must be a positive integer`);
  return value;
}

function boundedNumber(value: unknown, name: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) invalid(`${name} must be between ${minimum} and ${maximum}`);
  return value;
}

function invalid(message: string): never {
  throw new AppError("VALIDATION_ERROR", message, 400);
}
