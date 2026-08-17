import {
  THINKING_LEVELS,
  type AgentGenerationAsset,
  type AgentCommand,
  type AgentTurnRequest,
  type CreateAgentRequest,
  type ImageInput,
  type ThinkingLevel,
} from "@/contracts/agent";
import type { UpdateAgentSettingsRequest } from "@/contracts/agent-settings";
import type { JsonValue } from "@/contracts/generation";
import {
  WEB_SEARCH_FALLBACK_KINDS,
  WEB_SEARCH_PROVIDER_IDS,
  type UpdateWebAccessSettingsRequest,
  type WebSearchFallbackKind,
  type WebSearchProviderId,
} from "@/contracts/web-access";
import { AppError } from "@/server/domain/app-error";
import type {
  ImportLocalSkillInput,
  InstallSkillInput,
} from "@/server/domain/skill";
import type {
  ModelDiscoveryRequest,
  ModelTestRequest,
  SaveModelsConfigRequest,
} from "@/contracts/models";
import { sanitizeModelsConfig } from "@/contracts/model-compat";
import type { AddProjectRequest } from "@/contracts/projects";
import type {
  InstallSkillRequest,
  RemoveSkillRequest,
} from "@/contracts/skills";
import type {
  InstallSkillPackSourceRequest,
  InstallSkillPackRequest,
  MaintainSkillPackRequest,
  RemoveSkillPackRequest,
} from "@/contracts/skill-packs";
import type {
  DeleteSystemInstructionsRequest,
  DeleteProjectInstructionsRequest,
  SaveSystemInstructionsRequest,
  SaveProjectInstructionsRequest,
} from "@/contracts/instructions";

type JsonObject = Record<string, unknown>;

export function asObject(value: unknown, name = "body"): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${name} must be an object`);
  }
  return value as JsonObject;
}

export function requiredString(object: JsonObject, key: string): string {
  const value = object[key];
  if (typeof value !== "string" || !value.trim()) {
    invalid(`${key} must be a non-empty string`);
  }
  return value;
}

export function optionalString(
  object: JsonObject,
  key: string,
): string | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") invalid(`${key} must be a string`);
  return value;
}

export function requiredBoolean(object: JsonObject, key: string): boolean {
  const value = object[key];
  if (typeof value !== "boolean") invalid(`${key} must be a boolean`);
  return value;
}

export function parseCreateAgent(value: unknown): CreateAgentRequest {
  const object = asObject(value);
  return {
    cwd: requiredString(object, "cwd"),
    provider: optionalString(object, "provider"),
    modelId: optionalString(object, "modelId"),
    thinkingLevel:
      object.thinkingLevel === undefined
        ? undefined
        : parseThinkingLevel(object.thinkingLevel),
    toolNames: parseStringArray(object.toolNames, "toolNames"),
  };
}

export function parseUpdateAgentSettings(
  value: unknown,
): UpdateAgentSettingsRequest {
  const object = asObject(value);
  return {
    autoCompactionEnabled: requiredBoolean(object, "autoCompactionEnabled"),
  };
}

export function parseUpdateWebAccessSettings(
  value: unknown,
): UpdateWebAccessSettingsRequest {
  const object = asObject(value);
  const mode = requiredString(object, "mode");
  if (mode !== "auto" && mode !== "custom") {
    invalid("mode must be auto or custom");
  }
  if (!Array.isArray(object.providers)) {
    invalid("providers must be an array");
  }
  const providers = object.providers.map((value, index) => {
    const provider = asObject(value, `providers[${index}]`);
    const id = requiredString(provider, "id");
    if (!WEB_SEARCH_PROVIDER_IDS.includes(id as WebSearchProviderId)) {
      invalid(`providers[${index}].id is not supported`);
    }
    return {
      id: id as WebSearchProviderId,
      enabled: requiredBoolean(provider, "enabled"),
      apiKey: optionalString(provider, "apiKey") ?? "",
    };
  });
  if (
    providers.length !== WEB_SEARCH_PROVIDER_IDS.length ||
    new Set(providers.map(({ id }) => id)).size !==
      WEB_SEARCH_PROVIDER_IDS.length
  ) {
    invalid("providers must contain every supported provider exactly once");
  }
  const fallbackOn = parseStringArray(object.fallbackOn, "fallbackOn");
  if (!fallbackOn) invalid("fallbackOn must be an array of strings");
  if (
    fallbackOn.length === 0 ||
    fallbackOn.some(
      (kind) =>
        !WEB_SEARCH_FALLBACK_KINDS.includes(kind as WebSearchFallbackKind),
    )
  ) {
    invalid("fallbackOn contains an unsupported fallback kind");
  }
  if (mode === "custom" && !providers.some(({ enabled }) => enabled)) {
    invalid("custom mode requires at least one enabled provider");
  }
  return {
    mode,
    providers,
    fallbackOn: [...new Set(fallbackOn)] as WebSearchFallbackKind[],
  };
}

export function parseAgentTurnRequest(value: unknown): AgentTurnRequest {
  const object = asObject(value);
  const images = parseImages(object.images);
  const generation = object.generation === undefined
    ? undefined
    : parseAgentTurnGenerationInput(object.generation);
  return {
    turnId: boundedRequiredString(object, "turnId", 6, 128),
    message: messageOrImages(object, images),
    images,
    generation,
  };
}

function boundedRequiredString(
  object: Record<string, unknown>,
  key: string,
  minLength: number,
  maxLength: number,
): string {
  const value = requiredString(object, key).trim();
  if (value.length < minLength || value.length > maxLength) {
    invalid(`${key} must contain between ${minLength} and ${maxLength} characters`);
  }
  return value;
}

function parseAgentTurnGenerationInput(value: unknown) {
  const object = asObject(value);
  if (object.plan !== undefined) {
    invalid("generation.plan is server-owned and cannot be submitted by a client");
  }
  const parsed = parseAgentGenerationPolicy({ ...object, plan: undefined });
  return {
    mode: parsed.mode,
    reviewFirst: parsed.reviewFirst,
    assets: parsed.assets,
  };
}

export function parseAgentCommand(value: unknown): AgentCommand {
  const object = asObject(value);
  const type = requiredString(object, "type");
  switch (type) {
    case "prompt": {
      const images = parseImages(object.images);
      return {
        type,
        message: messageOrImages(object, images),
        images,
        ...(object.generationReview !== undefined
          ? { generationReview: requiredBoolean(object, "generationReview") }
          : {}),
        ...(object.generation !== undefined
          ? { generation: parseAgentGenerationPolicy(object.generation) }
          : {}),
      };
    }
    case "steer":
    case "follow_up": {
      const images = parseImages(object.images);
      return {
        type,
        message: messageOrImages(object, images),
        images,
      };
    }
    case "abort":
    case "get_state":
    case "get_tools":
    case "abort_compaction":
    case "reload_instructions":
      return { type };
    case "set_model":
      return {
        type,
        provider: requiredString(object, "provider"),
        modelId: requiredString(object, "modelId"),
      };
    case "fork":
      return { type, entryId: requiredString(object, "entryId") };
    case "navigate_tree":
      return { type, targetId: requiredString(object, "targetId") };
    case "set_thinking_level":
      return { type, level: parseThinkingLevel(object.level) };
    case "set_auto_retry":
      return { type, enabled: requiredBoolean(object, "enabled") };
    case "set_tools":
      return {
        type,
        toolNames: parseStringArray(object.toolNames, "toolNames") ?? [],
      };
    default:
      throw new AppError(
        "UNSUPPORTED_COMMAND",
        `Unsupported command type: ${type}`,
        400,
      );
  }
}

function parseAgentGenerationPolicy(value: unknown) {
  const object = asObject(value);
  const modeValue = asObject(object.mode);
  const modeType = requiredString(modeValue, "type");
  const mode = modeType === "generation-auto"
    ? { type: modeType } as const
    : modeType === "generation-route"
      ? { type: modeType, routeId: requiredString(modeValue, "routeId") } as const
      : invalid("generation.mode contains an unsupported type");
  const assetsValue = object.assets;
  if (!Array.isArray(assetsValue) || assetsValue.length > 30) {
    invalid("generation.assets must be an array with at most 30 items");
  }
  const assets = assetsValue.map((item) => {
    const asset = asObject(item);
    const mediaTypeValue = requiredString(asset, "mediaType");
    if (mediaTypeValue !== "image" && mediaTypeValue !== "video" && mediaTypeValue !== "audio") {
      invalid("generation asset mediaType is unsupported");
    }
    const mediaType = mediaTypeValue as AgentGenerationAsset["mediaType"];
    const refValue = asObject(asset.ref);
    const refType = requiredString(refValue, "type");
    const ref = refType === "workspace-file"
      ? { type: refType, relativePath: requiredString(refValue, "relativePath") } as const
      : refType === "artifact"
        ? { type: refType, artifactId: requiredString(refValue, "artifactId") } as const
        : invalid("generation asset ref type is unsupported");
    return {
      slot: requiredString(asset, "slot"),
      name: requiredString(asset, "name"),
      mediaType,
      mimeType: requiredString(asset, "mimeType"),
      ref,
    };
  });
  const planValue = object.plan;
  const plan = planValue === undefined
    ? undefined
    : parseAgentGenerationPlan(planValue);
  return {
    mode,
    reviewFirst: requiredBoolean(object, "reviewFirst"),
    assets,
    plan,
  };
}

function parseAgentGenerationPlan(value: unknown) {
  const object = asObject(value);
  const toolNameValue = requiredString(object, "toolName");
  if (toolNameValue !== "generate_image" && toolNameValue !== "generate_video") {
    invalid("generation.plan.toolName is unsupported");
  }
  const toolName = toolNameValue as "generate_image" | "generate_video";
  const parameters = object.parameters;
  if (!parameters || Array.isArray(parameters) || typeof parameters !== "object") {
    invalid("generation.plan.parameters must be an object");
  }
  return {
    toolName,
    routeId: requiredString(object, "routeId"),
    prompt: requiredString(object, "prompt"),
    parameters: parameters as Record<string, JsonValue>,
  };
}

export function parseModelTest(value: unknown): ModelTestRequest {
  const object = asObject(value);
  const config = object.config;
  return {
    provider: requiredString(object, "provider"),
    modelId: requiredString(object, "modelId"),
    config: config === undefined ? undefined : asObject(config, "config"),
    timeoutMs:
      typeof object.timeoutMs === "number" ? object.timeoutMs : undefined,
  };
}

export function parseModelDiscovery(value: unknown): ModelDiscoveryRequest {
  const object = asObject(value);
  const provider = asObject(object.provider, "provider");
  return {
    providerName: requiredString(object, "providerName"),
    provider: {
      api: optionalString(provider, "api"),
      baseUrl: optionalString(provider, "baseUrl"),
      apiKey: optionalString(provider, "apiKey"),
      headers: parseStringRecord(provider.headers, "headers"),
    },
  };
}

export function parseModelsConfig(value: unknown): SaveModelsConfigRequest {
  try {
    return sanitizeModelsConfig(asObject(value, "config"), {
      strictApi: true,
    });
  } catch (error) {
    invalid(error instanceof Error ? error.message : "Invalid model config");
  }
}

export function parseProjectPath(value: unknown): AddProjectRequest {
  const object = asObject(value);
  return { path: requiredString(object, "path").trim() };
}

export function parseSkillInstall(value: unknown): InstallSkillInput {
  const object = asObject(value);
  const scope = requiredString(object, "scope");
  if (scope !== "global" && scope !== "project") {
    invalid("scope must be global or project");
  }
  const request: InstallSkillRequest = {
    package:
      optionalString(object, "package") ?? requiredString(object, "source"),
    scope,
    cwd: optionalString(object, "cwd"),
  };
  return {
    packageSpec: request.package,
    scope: request.scope,
    cwd: request.cwd,
  };
}

export function parseSkillRemove(value: unknown): RemoveSkillRequest {
  const object = asObject(value);
  return {
    skillId: requiredString(object, "skillId"),
    cwd: requiredString(object, "cwd"),
  };
}

export function parseSkillPackInstall(value: unknown): InstallSkillPackRequest {
  const object = asObject(value);
  const scope = requiredString(object, "scope");
  if (scope !== "global" && scope !== "project") {
    invalid("scope must be global or project");
  }
  return {
    packId: requiredString(object, "packId"),
    scope,
    cwd: requiredString(object, "cwd"),
  };
}

export function parseSkillPackRemove(value: unknown): RemoveSkillPackRequest {
  const object = asObject(value);
  return {
    packId: requiredString(object, "packId"),
    cwd: requiredString(object, "cwd"),
  };
}

export function parseSkillPackInstallSource(
  value: unknown,
): InstallSkillPackSourceRequest {
  const object = asObject(value);
  const scope = requiredString(object, "scope");
  if (scope !== "global" && scope !== "project") {
    invalid("scope must be global or project");
  }
  return {
    source: requiredString(object, "source"),
    scope,
    cwd: requiredString(object, "cwd"),
  };
}

export function parseSkillPackMaintain(
  value: unknown,
): MaintainSkillPackRequest {
  const object = asObject(value);
  return {
    packId: requiredString(object, "packId"),
    cwd: requiredString(object, "cwd"),
  };
}

export function parseSkillCreateLocal(value: unknown): ImportLocalSkillInput {
  const object = asObject(value);
  const scope = requiredString(object, "scope");
  if (scope !== "global" && scope !== "project") {
    invalid("scope must be global or project");
  }
  return {
    sourceFilePath: requiredString(object, "sourceFilePath"),
    scope,
    cwd: optionalString(object, "cwd"),
  };
}

export function parseSaveSystemInstructions(
  value: unknown,
): SaveSystemInstructionsRequest {
  const object = asObject(value);
  return {
    content: parseContent(object.content),
    expectedRevision: requiredString(object, "expectedRevision"),
    force: optionalBoolean(object, "force"),
  };
}

export function parseDeleteSystemInstructions(
  value: unknown,
): DeleteSystemInstructionsRequest {
  const object = asObject(value);
  return {
    expectedRevision: requiredString(object, "expectedRevision"),
    force: optionalBoolean(object, "force"),
  };
}

export function parseSaveProjectInstructions(
  value: unknown,
): SaveProjectInstructionsRequest {
  const object = asObject(value);
  return {
    cwd: requiredString(object, "cwd"),
    content: parseContent(object.content),
    expectedRevision: requiredString(object, "expectedRevision"),
    force: optionalBoolean(object, "force"),
  };
}

export function parseDeleteProjectInstructions(
  value: unknown,
): DeleteProjectInstructionsRequest {
  const object = asObject(value);
  return {
    cwd: requiredString(object, "cwd"),
    expectedRevision: requiredString(object, "expectedRevision"),
    force: optionalBoolean(object, "force"),
  };
}

function parseThinkingLevel(value: unknown): ThinkingLevel {
  if (
    typeof value !== "string" ||
    !THINKING_LEVELS.includes(value as ThinkingLevel)
  ) {
    invalid(`thinking level must be one of ${THINKING_LEVELS.join(", ")}`);
  }
  return value as ThinkingLevel;
}

function parseImages(value: unknown): ImageInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) invalid("images must be an array");
  return value.map((item, index) => {
    const image = asObject(item, `images[${index}]`);
    return {
      type: "image",
      data: requiredString(image, "data"),
      mimeType: requiredString(image, "mimeType"),
    };
  });
}

function messageOrImages(
  object: JsonObject,
  images: ImageInput[] | undefined,
): string {
  const value = object.message;
  if (typeof value !== "string") invalid("message must be a string");
  if (!value.trim() && !images?.length) {
    invalid("message or images must be provided");
  }
  return value;
}

function parseStringArray(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    invalid(`${key} must be an array of strings`);
  }
  return value;
}

function parseStringRecord(
  value: unknown,
  key: string,
): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalid(`${key} must be an object`);
  }
  const entries = Object.entries(value);
  if (
    !entries.every(
      ([entryKey, entryValue]) =>
        typeof entryKey === "string" && typeof entryValue === "string",
    )
  ) {
    invalid(`${key} must contain only string values`);
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

/** 解析可选布尔值，undefined 时返回 undefined。 */
function optionalBoolean(object: JsonObject, key: string): boolean | undefined {
  const value = object[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") invalid(`${key} must be a boolean`);
  return value;
}

/** 解析指令内容字段，允许空字符串但不允许非字符串。 */
function parseContent(value: unknown): string {
  if (typeof value !== "string") invalid("content must be a string");
  return value;
}

function invalid(message: string): never {
  throw new AppError("VALIDATION_ERROR", message, 400);
}
