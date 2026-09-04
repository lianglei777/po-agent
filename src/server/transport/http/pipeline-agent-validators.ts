import type {
  PipelineAgentTurnRequest,
  UpdatePipelineAgentConversationRequest,
} from "@/contracts/pipeline-agent";
import type { ImportPipelineSkillRequest, InstallPipelineSkillRequest, UpdatePipelineSkillRequest } from "@/contracts/pipeline-agent";
import { AppError } from "@/server/domain/app-error";

export function parseUpdatePipelineAgentConversationRequest(
  value: unknown,
): UpdatePipelineAgentConversationRequest {
  if (!isRecord(value)) invalid("Request body must be an object");
  const allowAgentGeneration = value.allowAgentGeneration;
  if (allowAgentGeneration !== undefined && typeof allowAgentGeneration !== "boolean") {
    invalid("allowAgentGeneration must be a boolean");
  }
  const provider = optionalString(value.provider, "provider");
  const modelId = optionalString(value.modelId, "modelId");
  if (Boolean(provider) !== Boolean(modelId)) {
    invalid("provider and modelId must be provided together");
  }
  if (allowAgentGeneration === undefined && !provider) {
    invalid("At least one setting is required");
  }
  return {
    ...(provider && modelId ? { provider, modelId } : {}),
    ...(allowAgentGeneration === undefined ? {} : { allowAgentGeneration }),
  };
}

export function parsePipelineAgentTurnRequest(value: unknown): PipelineAgentTurnRequest {
  if (!isRecord(value)) invalid("Request body must be an object");
  const turnId = boundedString(value.turnId, "turnId", 6, 128);
  const message = boundedString(value.message, "message", 1, 20_480);
  const canvasRevision = value.canvasRevision;
  if (!Number.isSafeInteger(canvasRevision) || Number(canvasRevision) < 0) {
    invalid("canvasRevision must be a non-negative integer");
  }
  const selectedNodeIds = nodeIds(value.selectedNodeIds, "selectedNodeIds");
  const mentionedNodeIds = value.mentionedNodeIds === undefined
    ? undefined
    : nodeIds(value.mentionedNodeIds, "mentionedNodeIds");
  return {
    turnId,
    message,
    canvasRevision: Number(canvasRevision),
    selectedNodeIds,
    mentionedNodeIds,
  };
}

export function parseUpdatePipelineSkillRequest(value: unknown): UpdatePipelineSkillRequest {
  if (!isRecord(value)) invalid("Request body must be an object");
  return {
    skillId: boundedString(value.skillId, "skillId", 1, 256),
    disabled: requiredBoolean(value.disabled, "disabled"),
    expectedVersion: optionalString(value.expectedVersion, "expectedVersion"),
  };
}

export function parseInstallPipelineSkillRequest(value: unknown): InstallPipelineSkillRequest {
  if (!isRecord(value)) invalid("Request body must be an object");
  return { package: boundedString(value.package, "package", 1, 512) };
}

export function parseImportPipelineSkillRequest(value: unknown): ImportPipelineSkillRequest {
  if (!isRecord(value)) invalid("Request body must be an object");
  return { sourceFilePath: boundedString(value.sourceFilePath, "sourceFilePath", 1, 2_048) };
}

function nodeIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > 20) {
    invalid(`${field} must be an array containing at most 20 node IDs`);
  }
  return [...new Set(value.map((item) => {
    if (typeof item !== "string" || !item.trim() || item.length > 128) {
      invalid(`${field} contains an invalid node ID`);
    }
    return item.trim();
  }))];
}

function boundedString(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): string {
  if (typeof value !== "string") invalid(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length < minLength || normalized.length > maxLength) {
    invalid(`${field} must contain between ${minLength} and ${maxLength} characters`);
  }
  return normalized;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) invalid(`${field} must be a non-empty string`);
  return value.trim();
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") invalid(`${field} must be a boolean`);
  return value;
}

function invalid(message: string): never {
  throw new AppError("VALIDATION_ERROR", message, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
