import {
  CONTENT_GENERATION_CAPABILITIES,
  type ContentCompletionConfig,
  type ContentGenerationCapability,
  type ContentGenerationInputSchema,
  type ContentOutputConfig,
  type ContentSubmitConfig,
  type ContentUploadConfig,
  type HttpRequestTemplate,
  type JsonValue,
  type SaveContentGenerationApiRequest,
  type SaveContentGenerationProviderRequest,
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
    providerId: requiredString(object, "providerId"),
    name: requiredString(object, "name"),
    capability: capability as ContentGenerationCapability,
    catalogId: optionalString(object.catalogId, "catalogId"),
    credentialMode: credentialMode(object.credentialMode),
    requiresImages: requiredBoolean(object, "requiresImages"),
    apiKey: optionalString(object.apiKey, "apiKey"),
    commonHeaders: stringRecord(object.commonHeaders, "commonHeaders"),
    upload: object.upload === undefined ? undefined : parseUpload(object.upload),
    submit: parseSubmit(object.submit),
    completion: parseCompletion(object.completion),
    output: parseOutput(object.output),
    inputSchema: object.inputSchema === undefined
      ? undefined
      : parseInputSchema(object.inputSchema),
  };
}

export function parseContentGenerationProvider(
  value: unknown,
): SaveContentGenerationProviderRequest {
  const object = asObject(value);
  const type = requiredString(object, "type");
  if (type !== "runninghub" && type !== "custom") {
    invalid("type must be runninghub or custom");
  }
  return {
    id: requiredString(object, "id"),
    name: requiredString(object, "name"),
    type,
    apiKey: optionalString(object.apiKey, "apiKey"),
    commonHeaders: stringRecord(object.commonHeaders, "commonHeaders"),
  };
}

function credentialMode(value: unknown) {
  const mode = requiredString({ value }, "value");
  if (mode !== "inherit" && mode !== "override") {
    invalid("credentialMode must be inherit or override");
  }
  return mode;
}

function parseInputSchema(value: unknown): ContentGenerationInputSchema {
  const object = asObject(value, "inputSchema");
  const prompt = asObject(object.prompt, "inputSchema.prompt");
  return {
    prompt: {
      required: requiredBoolean(prompt, "required"),
      maxLength: optionalPositiveNumber(prompt.maxLength, "inputSchema.prompt.maxLength"),
    },
    parameters: object.parameters === undefined
      ? undefined
      : array(object.parameters, "inputSchema.parameters").map((item, index) => {
          const field = asObject(item, `inputSchema.parameters[${index}]`);
          const type = requiredString(field, "type");
          if (!["text", "number", "boolean", "select", "multi-select"].includes(type)) {
            invalid(`inputSchema.parameters[${index}].type is unsupported`);
          }
          return {
            key: requiredString(field, "key"),
            label: requiredString(field, "label"),
            description: optionalString(field.description, "description"),
            type: type as "text" | "number" | "boolean" | "select" | "multi-select",
            required: optionalBoolean(field.required, "required"),
            advanced: optionalBoolean(field.advanced, "advanced"),
            defaultValue: field.defaultValue === undefined ? undefined : jsonValue(field.defaultValue, "defaultValue"),
            options: field.options === undefined
              ? undefined
              : array(field.options, "options").map((option) => {
                  const parsed = asObject(option, "option");
                  return {
                    label: requiredString(parsed, "label"),
                    value: primitive(parsed.value, "value"),
                  };
                }),
            min: optionalNumber(field.min, "min"),
            max: optionalNumber(field.max, "max"),
          };
        }),
    assets: object.assets === undefined
      ? undefined
      : array(object.assets, "inputSchema.assets").map((item, index) => {
          const slot = asObject(item, `inputSchema.assets[${index}]`);
          const mediaType = requiredString(slot, "mediaType");
          if (!["image", "video", "audio"].includes(mediaType)) {
            invalid(`inputSchema.assets[${index}].mediaType is unsupported`);
          }
          return {
            key: requiredString(slot, "key"),
            label: requiredString(slot, "label"),
            description: optionalString(slot.description, "description"),
            mediaType: mediaType as "image" | "video" | "audio",
            required: optionalBoolean(slot.required, "required"),
            multiple: optionalBoolean(slot.multiple, "multiple"),
            minFiles: optionalPositiveNumber(slot.minFiles, "minFiles"),
            maxFiles: optionalPositiveNumber(slot.maxFiles, "maxFiles"),
            maxFileSizeBytes: optionalPositiveNumber(slot.maxFileSizeBytes, "maxFileSizeBytes"),
            acceptedTypes: stringArray(slot.acceptedTypes, "acceptedTypes"),
          };
        }),
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

function optionalBoolean(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") invalid(`${name} must be a boolean`);
  return value;
}

function optionalNumber(value: unknown, name: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(`${name} must be a number`);
  return value;
}

function primitive(value: unknown, name: string) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    invalid(`${name} must be a string, number, or boolean`);
  }
  return value;
}

function array(value: unknown, name: string) {
  if (!Array.isArray(value)) invalid(`${name} must be an array`);
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
