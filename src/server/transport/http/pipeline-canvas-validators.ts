import type { CanvasGenerationParams, CanvasMutationBatch, CanvasNode, CanvasNodeData, CanvasResourceRole, CreateCanvasWorkflowRunRequest, GenerateCanvasNodeRequest, GenerateTextNodeRequest } from "@/contracts/pipeline";
import { AppError } from "@/server/domain/app-error";

const NODE_TYPES = new Set(["text", "image", "video", "audio", "script", "character", "scene", "prop", "storyboard"]);
const EDGE_TYPES = new Set(["references", "source_of", "generates", "derives_from"]);
const RICH_TEXT_NODE_TYPES = new Set(["doc", "paragraph", "heading", "bulletList", "orderedList", "listItem", "hardBreak", "text", "resourceReference"]);
const RICH_TEXT_MARK_TYPES = new Set(["bold", "italic", "underline"]);
const RESOURCE_SOURCE_TYPES = new Set(["canvas-node", "asset"]);
const RESOURCE_MEDIA_TYPES = new Set(["text", "image", "video", "audio"]);
const RESOURCE_ROLES = new Set(["reference", "first-frame", "last-frame"]);
const MAX_TEXT_LENGTH = 200_000;
const MAX_RICH_TEXT_NODES = 5_000;
const MAX_RICH_TEXT_DEPTH = 20;
const MAX_AI_INSTRUCTION_LENGTH = 20_000;
const MAX_GENERATION_SETTINGS = 40;
const MAX_MULTI_SETTING_VALUES = 50;

export function parseGenerateCanvasNodeRequest(value: unknown): GenerateCanvasNodeRequest {
  if (!isRecord(value)) throw validationError("Canvas generation request must be an object");
  if (value.createNewNode !== undefined && typeof value.createNewNode !== "boolean") {
    throw validationError("createNewNode is invalid");
  }
  if (value.createNewNode === true && (typeof value.prompt !== "string" || !value.prompt.trim())) {
    throw validationError("prompt is required when createNewNode is true");
  }
  if (value.prompt !== undefined && (
    typeof value.prompt !== "string" || !value.prompt.trim() || value.prompt.length > MAX_AI_INSTRUCTION_LENGTH
  )) throw validationError("prompt is invalid");
  if (value.promptDocument !== undefined) validatePromptDocument(value.promptDocument, "promptDocument");
  if (value.routeId !== undefined && (
    typeof value.routeId !== "string" || !value.routeId.trim() || value.routeId.length > 300
  )) throw validationError("routeId is invalid");
  if (value.settings !== undefined && !isRecord(value.settings)) throw validationError("settings is invalid");
  const settings = value.settings ? parseGenerationSettings(value.settings) : undefined;
  return {
    prompt: typeof value.prompt === "string" ? value.prompt.trim() : undefined,
    promptDocument: value.promptDocument as GenerateCanvasNodeRequest["promptDocument"],
    routeId: typeof value.routeId === "string" ? value.routeId.trim() : undefined,
    settings,
    ...(typeof value.createNewNode === "boolean" ? { createNewNode: value.createNewNode } : {}),
  };
}

export function parseGenerateTextNodeRequest(value: unknown): GenerateTextNodeRequest {
  if (!isRecord(value)) throw validationError("Text generation request must be an object");
  if (typeof value.instruction !== "string" || !value.instruction.trim() || value.instruction.length > MAX_AI_INSTRUCTION_LENGTH) {
    throw validationError("instruction is invalid");
  }
  if (value.mode !== "generate" && value.mode !== "revise") {
    throw validationError("mode is invalid");
  }
  if (value.promptDocument !== undefined) validatePromptDocument(value.promptDocument, "promptDocument");
  if (value.model !== undefined && (typeof value.model !== "string" || !value.model.trim() || value.model.length > 300)) {
    throw validationError("model is invalid");
  }
  return {
    instruction: value.instruction.trim(),
    promptDocument: value.promptDocument as GenerateTextNodeRequest["promptDocument"],
    mode: value.mode,
    model: typeof value.model === "string" ? value.model.trim() : undefined,
  };
}

export function parseCanvasMutationBatch(value: unknown): CanvasMutationBatch {
  if (!isRecord(value)) throw validationError("Canvas mutation batch must be an object");
  if (!Number.isInteger(value.baseRevision) || Number(value.baseRevision) < 0) {
    throw validationError("baseRevision must be a non-negative integer");
  }
  if (typeof value.requestId !== "string" || !value.requestId.trim() || value.requestId.length > 120) {
    throw validationError("requestId is invalid");
  }
  if (!Array.isArray(value.mutations) || value.mutations.length === 0 || value.mutations.length > 500) {
    throw validationError("mutations must contain between 1 and 500 operations");
  }

  const mutations = value.mutations.map((mutation, index) => parseMutation(mutation, index));
  return { baseRevision: Number(value.baseRevision), requestId: value.requestId, mutations };
}

function parseMutation(value: unknown, index: number): CanvasMutationBatch["mutations"][number] {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw validationError(`mutations[${index}] is invalid`);
  }

  if (value.type === "node.create") {
    return { type: value.type, node: parseNode(value.node, index) };
  }
  if (value.type === "node.update") {
    if (!validId(value.nodeId) || !isRecord(value.patch)) throw validationError(`mutations[${index}] node update is invalid`);
    const patch = value.patch;
    validateOptionalNumber(patch.positionX, `mutations[${index}].patch.positionX`);
    validateOptionalNumber(patch.positionY, `mutations[${index}].patch.positionY`);
    validateOptionalNullableSize(patch.width, `mutations[${index}].patch.width`);
    validateOptionalNullableSize(patch.height, `mutations[${index}].patch.height`);
    if (patch.data !== undefined && patch.data !== null) parseNodeData(patch.data, index);
    return {
      type: value.type,
      nodeId: value.nodeId,
      patch: {
        positionX: typeof patch.positionX === "number" ? patch.positionX : undefined,
        positionY: typeof patch.positionY === "number" ? patch.positionY : undefined,
        width: typeof patch.width === "number" || patch.width === null ? patch.width : undefined,
        height: typeof patch.height === "number" || patch.height === null ? patch.height : undefined,
        data: patch.data === null ? null : patch.data === undefined ? undefined : parseNodeData(patch.data, index),
      },
    };
  }
  if (value.type === "node.delete") {
    if (!validId(value.nodeId)) throw validationError(`mutations[${index}].nodeId is invalid`);
    return { type: value.type, nodeId: value.nodeId };
  }
  if (value.type === "edge.create") {
    if (!isRecord(value.edge)) throw validationError(`mutations[${index}].edge is invalid`);
    const edge = value.edge;
    if (!validId(edge.id) || !validId(edge.projectId) || !validId(edge.sourceNodeId) || !validId(edge.targetNodeId)) {
      throw validationError(`mutations[${index}].edge identifiers are invalid`);
    }
    if (!EDGE_TYPES.has(String(edge.edgeType))) throw validationError(`mutations[${index}].edgeType is invalid`);
    if (edge.role !== undefined && !RESOURCE_ROLES.has(String(edge.role))) {
      throw validationError(`mutations[${index}].edge.role is invalid`);
    }
    if (edge.order !== undefined && (!Number.isInteger(edge.order) || Number(edge.order) < 0)) {
      throw validationError(`mutations[${index}].edge.order is invalid`);
    }
    if (value.intent !== undefined && value.intent !== "connect" && value.intent !== "restore") {
      throw validationError(`mutations[${index}].intent is invalid`);
    }
    return {
      type: value.type,
      intent: value.intent as "connect" | "restore" | undefined,
      edge: {
        id: edge.id,
        projectId: edge.projectId,
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        edgeType: edge.edgeType as "references" | "source_of" | "generates" | "derives_from",
        role: edge.role as CanvasResourceRole | undefined,
        order: typeof edge.order === "number" ? edge.order : undefined,
        createdAt: typeof edge.createdAt === "string" ? edge.createdAt : undefined,
        updatedAt: typeof edge.updatedAt === "string" ? edge.updatedAt : undefined,
      },
    };
  }
  if (value.type === "edge.update") {
    if (!validId(value.edgeId) || !isRecord(value.patch)) {
      throw validationError(`mutations[${index}] edge update is invalid`);
    }
    if (value.patch.role !== undefined && !RESOURCE_ROLES.has(String(value.patch.role))) {
      throw validationError(`mutations[${index}].patch.role is invalid`);
    }
    if (value.patch.order !== undefined && (!Number.isInteger(value.patch.order) || Number(value.patch.order) < 0)) {
      throw validationError(`mutations[${index}].patch.order is invalid`);
    }
    return {
      type: "edge.update",
      edgeId: value.edgeId,
      patch: {
        role: value.patch.role as CanvasResourceRole | undefined,
        order: typeof value.patch.order === "number" ? value.patch.order : undefined,
      },
    };
  }
  if (value.type === "edge.delete") {
    if (!validId(value.edgeId)) throw validationError(`mutations[${index}].edgeId is invalid`);
    return { type: value.type, edgeId: value.edgeId };
  }
  if (value.type === "viewport.update") {
    if (!isRecord(value.viewport)) throw validationError(`mutations[${index}].viewport is invalid`);
    validateNumber(value.viewport.x, `mutations[${index}].viewport.x`);
    validateNumber(value.viewport.y, `mutations[${index}].viewport.y`);
    validateNumber(value.viewport.zoom, `mutations[${index}].viewport.zoom`);
    const zoom = Number(value.viewport.zoom);
    if (zoom < 0.05 || zoom > 4) throw validationError(`mutations[${index}].viewport.zoom is out of range`);
    return { type: value.type, viewport: { x: Number(value.viewport.x), y: Number(value.viewport.y), zoom } };
  }
  throw validationError(`mutations[${index}].type is unsupported`);
}

function parseNode(value: unknown, index: number): CanvasNode {
  if (!isRecord(value)) throw validationError(`mutations[${index}].node is invalid`);
  if (!validId(value.id) || !validId(value.projectId) || !validId(value.entityId)) {
    throw validationError(`mutations[${index}].node identifiers are invalid`);
  }
  if (!NODE_TYPES.has(String(value.type))) throw validationError(`mutations[${index}].node.type is invalid`);
  validateNumber(value.positionX, `mutations[${index}].node.positionX`);
  validateNumber(value.positionY, `mutations[${index}].node.positionY`);
  validateOptionalNullableSize(value.width, `mutations[${index}].node.width`);
  validateOptionalNullableSize(value.height, `mutations[${index}].node.height`);
  const data = value.data === null ? null : parseNodeData(value.data, index);
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") {
    throw validationError(`mutations[${index}].node timestamps are invalid`);
  }
  return {
    id: value.id,
    projectId: value.projectId,
    type: value.type as CanvasNode["type"],
    entityId: value.entityId,
    positionX: Number(value.positionX),
    positionY: Number(value.positionY),
    width: typeof value.width === "number" || value.width === null ? value.width : null,
    height: typeof value.height === "number" || value.height === null ? value.height : null,
    data,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function parseNodeData(value: unknown, index: number): CanvasNodeData {
  if (!isRecord(value) || !["text", "image", "video", "audio"].includes(String(value.type))) {
    throw validationError(`mutations[${index}].node.data is invalid`);
  }
  if (typeof value.name !== "string" || value.name.length > 200
    || typeof value.action !== "string" || value.action.length > 200) {
    throw validationError(`mutations[${index}].node.data fields are invalid`);
  }
  if (value.generatorType !== undefined && !["default", "enhance", "resource"].includes(String(value.generatorType))) {
    throw validationError(`mutations[${index}].node.data.generatorType is invalid`);
  }
  validateLegacyContent(value.content, `mutations[${index}].node.data.content`);
  if (value.textDocument !== undefined) {
    if (value.type !== "text") throw validationError(`mutations[${index}].node.data.textDocument is only valid for text nodes`);
    validateTextDocument(value.textDocument, `mutations[${index}].node.data.textDocument`);
  }
  if (value.audioMetadata !== undefined) {
    if (value.type !== "audio" || !isRecord(value.audioMetadata)) {
      throw validationError(`mutations[${index}].node.data.audioMetadata is invalid`);
    }
    const metadata = value.audioMetadata;
    if (!Number.isFinite(metadata.durationSeconds)
      || Number(metadata.durationSeconds) < 0
      || Number(metadata.durationSeconds) > 86_400
      || (metadata.format !== undefined && (
        typeof metadata.format !== "string"
        || !metadata.format.trim()
        || metadata.format.length > 32
      ))
      || (metadata.sampleRateHz !== undefined && (
        !Number.isInteger(metadata.sampleRateHz)
        || Number(metadata.sampleRateHz) < 1_000
        || Number(metadata.sampleRateHz) > 384_000
      ))
      || (metadata.channelCount !== undefined && (
        !Number.isInteger(metadata.channelCount)
        || Number(metadata.channelCount) < 1
        || Number(metadata.channelCount) > 32
      ))) {
      throw validationError(`mutations[${index}].node.data.audioMetadata is invalid`);
    }
  }
  if (value.videoMetadata !== undefined) {
    if (value.type !== "video" || !isRecord(value.videoMetadata)) {
      throw validationError(`mutations[${index}].node.data.videoMetadata is invalid`);
    }
    const metadata = value.videoMetadata;
    if (!Number.isFinite(metadata.durationSeconds)
      || Number(metadata.durationSeconds) < 0
      || Number(metadata.durationSeconds) > 86_400
      || !Number.isInteger(metadata.width)
      || Number(metadata.width) < 1
      || Number(metadata.width) > 16_384
      || !Number.isInteger(metadata.height)
      || Number(metadata.height) < 1
      || Number(metadata.height) > 16_384) {
      throw validationError(`mutations[${index}].node.data.videoMetadata is invalid`);
    }
  }
  const params = value.params === undefined ? undefined : parseClientGenerationParams(value.params, index);
  // 任务状态、文件和产物引用由服务端生命周期维护；传输层只输出客户端可编辑字段。
  return {
    type: value.type as CanvasNodeData["type"],
    name: value.name,
    action: value.action,
    generatorType: value.generatorType as CanvasNodeData["generatorType"],
    content: value.content as string[] | undefined,
    textDocument: value.textDocument as CanvasNodeData["textDocument"],
    params,
    audioMetadata: value.audioMetadata as CanvasNodeData["audioMetadata"],
    videoMetadata: value.videoMetadata as CanvasNodeData["videoMetadata"],
  };
}

function parseClientGenerationParams(value: unknown, index: number): CanvasGenerationParams {
  const path = `mutations[${index}].node.data.params`;
  if (!isRecord(value) || typeof value.prompt !== "string" || value.prompt.length > MAX_AI_INSTRUCTION_LENGTH) {
    throw validationError(`${path} is invalid`);
  }
  if (value.promptDocument !== undefined) validatePromptDocument(value.promptDocument, `${path}.promptDocument`);
  for (const field of ["routeId", "model", "modeType"] as const) {
    if (value[field] !== undefined && (typeof value[field] !== "string" || value[field].length > 300)) {
      throw validationError(`${path}.${field} is invalid`);
    }
  }
  if (value.count !== undefined && (!Number.isInteger(value.count) || Number(value.count) < 1 || Number(value.count) > 20)) {
    throw validationError(`${path}.count is invalid`);
  }
  if (value.settings !== undefined && !isRecord(value.settings)) throw validationError(`${path}.settings is invalid`);
  if (value.advancedSettings !== undefined && !isRecord(value.advancedSettings)) {
    throw validationError(`${path}.advancedSettings is invalid`);
  }
  return {
    prompt: value.prompt,
    promptDocument: value.promptDocument as CanvasGenerationParams["promptDocument"],
    routeId: value.routeId as string | undefined,
    model: value.model as string | undefined,
    count: typeof value.count === "number" ? value.count : undefined,
    modeType: value.modeType as string | undefined,
    settings: value.settings ? parseGenerationSettings(value.settings) : undefined,
    advancedSettings: value.advancedSettings ? parseGenerationSettings(value.advancedSettings) : undefined,
  };
}

function validateLegacyContent(value: unknown, path: string) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 100 || value.some((part) => typeof part !== "string")) {
    throw validationError(`${path} is invalid`);
  }
  const length = value.reduce((total, part) => total + String(part).length, 0);
  if (length > MAX_TEXT_LENGTH) throw validationError(`${path} is too large`);
}

function validateTextDocument(value: unknown, path: string) {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.format !== "tiptap-json") {
    throw validationError(`${path} is invalid`);
  }
  if (typeof value.plainText !== "string" || value.plainText.length > MAX_TEXT_LENGTH) {
    throw validationError(`${path}.plainText is invalid`);
  }
  const stats = { nodeCount: 0, textLength: 0 };
  validateRichTextNode(value.content, `${path}.content`, 0, stats);
  if (!isRecord(value.content) || value.content.type !== "doc") {
    throw validationError(`${path}.content must be a document`);
  }
}

export function parseSelectCanvasArtifactRequest(value: unknown): { artifactId: string } {
  if (!isRecord(value) || !validId(value.artifactId)) {
    throw validationError("artifactId is invalid");
  }
  return { artifactId: value.artifactId };
}

export function parseRetryCanvasGenerationRequest(value: unknown): { idempotencyKey: string } {
  if (!isRecord(value) || typeof value.idempotencyKey !== "string") {
    throw validationError("idempotencyKey is invalid");
  }
  const idempotencyKey = value.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw validationError("idempotencyKey is invalid");
  }
  return { idempotencyKey };
}

export function parseCreateCanvasWorkflowRunRequest(value: unknown): CreateCanvasWorkflowRunRequest {
  if (!isRecord(value) || !Array.isArray(value.nodeIds)) {
    throw validationError("nodeIds must be an array");
  }
  if (value.nodeIds.length === 0 || value.nodeIds.length > 100) {
    throw validationError("nodeIds must contain between 1 and 100 entries");
  }
  if (value.nodeIds.some((nodeId) => !validId(nodeId))) {
    throw validationError("nodeIds contains an invalid canvas node identifier");
  }
  return { nodeIds: [...new Set(value.nodeIds as string[])] };
}

function parseGenerationSettings(value: Record<string, unknown>): NonNullable<GenerateCanvasNodeRequest["settings"]> {
  const entries = Object.entries(value);
  if (entries.length > MAX_GENERATION_SETTINGS) throw validationError("settings contains too many fields");
  const settings: NonNullable<GenerateCanvasNodeRequest["settings"]> = {};
  for (const [key, setting] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(key)) throw validationError(`settings.${key} is invalid`);
    if (typeof setting === "string") {
      if (setting.length > 2_000) throw validationError(`settings.${key} is invalid`);
      settings[key] = setting;
      continue;
    }
    if (typeof setting === "number") {
      if (!Number.isFinite(setting)) throw validationError(`settings.${key} is invalid`);
      settings[key] = setting;
      continue;
    }
    if (typeof setting === "boolean") {
      settings[key] = setting;
      continue;
    }
    if (Array.isArray(setting)
      && setting.length <= MAX_MULTI_SETTING_VALUES
      && setting.every((item) => typeof item === "boolean"
        || (typeof item === "number" && Number.isFinite(item))
        || (typeof item === "string" && item.length <= 2_000))) {
      settings[key] = setting;
      continue;
    }
    throw validationError(`settings.${key} is invalid`);
  }
  return settings;
}

function validatePromptDocument(value: unknown, path: string) {
  validateTextDocument(value, path);
  if (!isRecord(value) || typeof value.plainText !== "string" || value.plainText.length > MAX_AI_INSTRUCTION_LENGTH) {
    throw validationError(`${path}.plainText is invalid`);
  }
}

function validateRichTextNode(
  value: unknown,
  path: string,
  depth: number,
  stats: { nodeCount: number; textLength: number },
) {
  if (!isRecord(value) || typeof value.type !== "string" || !RICH_TEXT_NODE_TYPES.has(value.type)) {
    throw validationError(`${path} contains an unsupported node`);
  }
  stats.nodeCount += 1;
  if (stats.nodeCount > MAX_RICH_TEXT_NODES || depth > MAX_RICH_TEXT_DEPTH) {
    throw validationError(`${path} is too complex`);
  }
  if (value.type === "text") {
    if (typeof value.text !== "string") throw validationError(`${path}.text is invalid`);
    stats.textLength += value.text.length;
    if (stats.textLength > MAX_TEXT_LENGTH) throw validationError(`${path} is too large`);
  } else if (value.text !== undefined) {
    throw validationError(`${path}.text is invalid`);
  }
  validateRichTextAttrs(value.attrs, `${path}.attrs`);
  if (value.type === "resourceReference") {
    if (!isRecord(value.attrs)
      || !validId(value.attrs.referenceId)
      || !RESOURCE_SOURCE_TYPES.has(String(value.attrs.sourceType))
      || !validId(value.attrs.sourceId)
      || !RESOURCE_MEDIA_TYPES.has(String(value.attrs.mediaType))
      || typeof value.attrs.label !== "string"
      || !value.attrs.label.trim()
      || value.attrs.label.length > 300
      || !RESOURCE_ROLES.has(String(value.attrs.role))) {
      throw validationError(`${path}.attrs is invalid`);
    }
    if (value.content !== undefined || value.marks !== undefined) {
      throw validationError(`${path} must be an inline resource atom`);
    }
  }
  if (value.type === "heading") {
    if (!isRecord(value.attrs) || ![1, 2, 3].includes(Number(value.attrs.level))) {
      throw validationError(`${path}.attrs.level is invalid`);
    }
  }
  if (value.marks !== undefined) {
    if (!Array.isArray(value.marks) || value.marks.length > 8) throw validationError(`${path}.marks is invalid`);
    for (const [markIndex, mark] of value.marks.entries()) {
      if (!isRecord(mark) || typeof mark.type !== "string" || !RICH_TEXT_MARK_TYPES.has(mark.type)) {
        throw validationError(`${path}.marks[${markIndex}] is invalid`);
      }
      validateRichTextAttrs(mark.attrs, `${path}.marks[${markIndex}].attrs`);
    }
  }
  if (value.content !== undefined) {
    if (!Array.isArray(value.content) || value.content.length > MAX_RICH_TEXT_NODES) {
      throw validationError(`${path}.content is invalid`);
    }
    value.content.forEach((child, childIndex) => validateRichTextNode(child, `${path}.content[${childIndex}]`, depth + 1, stats));
  }
}

function validateRichTextAttrs(value: unknown, path: string) {
  if (value === undefined) return;
  if (!isRecord(value) || Object.keys(value).length > 20) throw validationError(`${path} is invalid`);
  for (const attribute of Object.values(value)) {
    if (attribute !== null && typeof attribute !== "string" && typeof attribute !== "number" && typeof attribute !== "boolean") {
      throw validationError(`${path} contains an invalid value`);
    }
  }
}

function validateOptionalNumber(value: unknown, path: string) {
  if (value !== undefined) validateNumber(value, path);
}

function validateOptionalNullableSize(value: unknown, path: string) {
  if (value === undefined || value === null) return;
  validateNumber(value, path);
  if (Number(value) < 80 || Number(value) > 4000) throw validationError(`${path} is out of range`);
}

function validateNumber(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw validationError(`${path} must be finite`);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationError(message: string) {
  return new AppError("VALIDATION_ERROR", message, 400);
}
