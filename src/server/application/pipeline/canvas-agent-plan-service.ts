import { randomUUID } from "node:crypto";
import type {
  CanvasAgentAction,
  CanvasAgentPlan,
  CanvasAgentPlanOperation,
  CanvasEdge,
  CanvasMediaType,
  CanvasMutation,
  CanvasNode,
  CanvasNodeData,
} from "@/server/domain/pipeline";
import { AppError } from "@/server/domain/app-error";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import { CanvasStudioService, createNodeData, defaultSize, plainTextDocument } from "./canvas-studio-service";
import type { CanvasAgentTurnPolicyRegistry } from "./canvas-agent-turn-policy-registry";

const MAX_OPERATIONS = 60;
const MAX_CREATED_NODES = 30;
const COLUMN_GAP = 120;
const ROW_GAP = 80;
// 使用最大节点尺寸作为网格单元，避免不同媒体类型在同一行或列相互遮挡。
const LAYOUT_CELL_WIDTH = 350 + COLUMN_GAP;
const LAYOUT_CELL_HEIGHT = 350 + ROW_GAP;
const MAX_LAYOUT_COLUMN = 20;

export class CanvasAgentPlanService {
  constructor(
    private readonly repository: PipelineRepository,
    private readonly canvas: CanvasStudioService,
    private readonly policies: CanvasAgentTurnPolicyRegistry,
  ) {}

  async create(input: {
    projectId: string;
    sessionId: string;
    summary: string;
    operations: CanvasAgentPlanOperation[];
  }): Promise<CanvasAgentPlan> {
    const operations = normalizeOperations(input.operations);
    const active = this.policies.getActive(input.sessionId);
    if (!active) {
      throw new AppError("PIPELINE_AGENT_ACTION_NOT_ALLOWED", "Canvas changes require an active Agent turn", 403);
    }
    const [baseRevision, nodes, edges] = await Promise.all([
      this.repository.getCanvasRevision(input.projectId),
      this.repository.listCanvasNodes(input.projectId),
      this.repository.listCanvasEdges(input.projectId),
    ]);
    this.requireWritableTurn(input.sessionId, operations, nodes);
    validateOperationTargets(operations, nodes);
    validatePlanEdgeBindings(operations, nodes, edges);
    return this.repository.createCanvasAgentPlan({
      id: randomUUID(),
      projectId: input.projectId,
      sessionId: input.sessionId,
      turnId: active.turnId,
      summary: bounded(input.summary, "summary", 1_000),
      baseRevision,
      operations,
      referencedNodeVersions: referencedVersions(operations, nodes, input.projectId),
      status: "draft",
      appliedRevision: null,
      actionId: null,
    });
  }

  async update(input: {
    projectId: string;
    sessionId: string;
    planId: string;
    summary: string;
    operations: CanvasAgentPlanOperation[];
  }): Promise<CanvasAgentPlan> {
    const operations = normalizeOperations(input.operations);
    const plan = await this.requirePlan(input.planId, input.projectId, input.sessionId);
    if (plan.status !== "draft") {
      throw new AppError("PIPELINE_AGENT_PLAN_NOT_EDITABLE", "Only a draft Canvas Agent plan can be updated", 409);
    }
    const [baseRevision, nodes, edges] = await Promise.all([
      this.repository.getCanvasRevision(input.projectId),
      this.repository.listCanvasNodes(input.projectId),
      this.repository.listCanvasEdges(input.projectId),
    ]);
    this.requireWritableTurn(input.sessionId, operations, nodes);
    validateOperationTargets(operations, nodes);
    validatePlanEdgeBindings(operations, nodes, edges);
    return (await this.repository.updateCanvasAgentPlan(plan.id, {
      summary: bounded(input.summary, "summary", 1_000),
      baseRevision,
      operations,
      referencedNodeVersions: referencedVersions(operations, nodes, input.projectId),
    }))!;
  }

  async apply(projectId: string, sessionId: string, planId: string): Promise<CanvasAgentAction> {
    const plan = await this.requirePlan(planId, projectId, sessionId);
    const permissionNodes = await this.repository.listCanvasNodes(projectId);
    this.requireWritableTurn(sessionId, plan.operations, permissionNodes);
    if (plan.status === "applied" && plan.actionId) {
      const existing = await this.repository.getCanvasAgentAction(plan.actionId);
      if (existing) return existing;
    }
    if (plan.status !== "draft") {
      throw new AppError("PIPELINE_AGENT_PLAN_NOT_EDITABLE", "Canvas Agent plan is no longer applicable", 409);
    }
    const [currentRevision, nodes, edges, viewport] = await Promise.all([
      this.repository.getCanvasRevision(projectId),
      this.repository.listCanvasNodes(projectId),
      this.repository.listCanvasEdges(projectId),
      this.repository.getCanvasViewport(projectId),
    ]);
    assertRebaseSafe(plan, currentRevision, nodes);
    const compiled = compilePlan(plan, nodes, edges, viewport);
    const snapshot = await this.canvas.applyMutationBatch(projectId, {
      baseRevision: currentRevision,
      requestId: `canvas-agent:${plan.id}`,
      mutations: compiled.forward,
    });
    const action = await this.repository.createCanvasAgentAction({
      id: randomUUID(),
      projectId,
      planId: plan.id,
      forwardMutations: compiled.forward,
      inverseMutations: compiled.inverse,
      appliedRevision: snapshot.revision,
      status: "applied",
    });
    await this.repository.updateCanvasAgentPlan(plan.id, {
      status: "applied",
      appliedRevision: snapshot.revision,
      actionId: action.id,
    });
    return action;
  }

  async undo(projectId: string, sessionId: string, actionId: string): Promise<CanvasAgentAction> {
    this.policies.requireStage(sessionId, "canvas");
    return this.undoAction(projectId, actionId);
  }

  async undoFromUser(projectId: string, actionId: string): Promise<CanvasAgentAction> {
    return this.undoAction(projectId, actionId);
  }

  private async undoAction(projectId: string, actionId: string): Promise<CanvasAgentAction> {
    const action = await this.repository.getCanvasAgentAction(actionId);
    if (!action || action.projectId !== projectId) {
      throw new AppError("PIPELINE_AGENT_ACTION_NOT_UNDOABLE", "Canvas Agent action was not found in this project", 404);
    }
    if (action.status === "undone") return action;
    const currentRevision = await this.repository.getCanvasRevision(projectId);
    if (currentRevision !== action.appliedRevision) {
      throw new AppError(
        "PIPELINE_AGENT_ACTION_NOT_UNDOABLE",
        "The canvas changed after this Agent action; undo it manually to preserve newer work",
        409,
        { appliedRevision: action.appliedRevision, currentRevision },
      );
    }
    await this.canvas.applyMutationBatch(projectId, {
      baseRevision: currentRevision,
      requestId: `canvas-agent-undo:${action.id}`,
      mutations: action.inverseMutations,
    });
    return (await this.repository.updateCanvasAgentAction(action.id, { status: "undone" }))!;
  }

  private requireWritableTurn(sessionId: string, operations: CanvasAgentPlanOperation[], nodes: CanvasNode[]) {
    const active = this.policies.getActive(sessionId);
    if (!active) this.policies.requireStage(sessionId, "canvas");
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const textOnly = operations.every((operation) =>
      operation.type !== "edge.create" &&
      (operation.type !== "node.create" || operation.mediaType === "text") &&
      (operation.type !== "node.update" || nodeById.get(operation.nodeId)?.data?.type === "text") &&
      operation.prompt === undefined && operation.routeId === undefined
    );
    this.policies.requireStage(sessionId, textOnly ? "script" : "canvas");
    return active!;
  }

  private async requirePlan(planId: string, projectId: string, sessionId: string) {
    const plan = await this.repository.getCanvasAgentPlan(planId);
    if (!plan || plan.projectId !== projectId || plan.sessionId !== sessionId) {
      throw new AppError("PIPELINE_AGENT_PLAN_NOT_FOUND", "Canvas Agent plan was not found in this project conversation", 404);
    }
    return plan;
  }
}

function validateOperationTargets(operations: CanvasAgentPlanOperation[], nodes: CanvasNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const operation of operations) {
    if (operation.type !== "node.update") continue;
    const node = byId.get(operation.nodeId);
    if (!node?.data) continue;
    if (operation.text !== undefined && node.data.type !== "text") invalid("Text content can only be written to a text node");
    if (operation.prompt !== undefined && node.data.type === "text") invalid("Generation prompts belong to image, video, or audio nodes");
    if (operation.routeId !== undefined && node.data.type === "text") invalid("Generation routes belong to image, video, or audio nodes");
  }
}

/**
 * 首尾帧是视频生成的结构化输入，而非通用引用。计划创建时提前拒绝错误角色，
 * 使模型能在同一回合修正，而不会把不可保存的乐观更新留给浏览器。
 */
function validatePlanEdgeBindings(
  operations: CanvasAgentPlanOperation[],
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): void {
  const mediaTypes = new Map(nodes.map((node) => [node.id, node.data?.type ?? node.type]));
  for (const operation of operations) {
    if (operation.type === "node.create") mediaTypes.set(operation.tempId, operation.mediaType);
  }
  const bindings = [...edges.map((edge) => ({
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    role: edge.role ?? "reference",
  }))];
  for (const operation of operations) {
    if (operation.type !== "edge.create") continue;
    if (operation.role !== "reference"
      && (mediaTypes.get(operation.source) !== "image" || mediaTypes.get(operation.target) !== "video")) {
      invalid("First and last frame roles require an image connected to a video node");
    }
    bindings.push({ source: operation.source, target: operation.target, role: operation.role ?? "reference" });
  }
  const byTarget = new Map<string, Array<{ role: CanvasEdge["role"] }>>();
  for (const binding of bindings) {
    const incoming = byTarget.get(binding.target) ?? [];
    incoming.push(binding);
    byTarget.set(binding.target, incoming);
  }
  for (const incoming of byTarget.values()) {
    const firstFrameCount = incoming.filter((binding) => binding.role === "first-frame").length;
    const lastFrameCount = incoming.filter((binding) => binding.role === "last-frame").length;
    if (firstFrameCount > 1 || lastFrameCount > 1) {
      invalid("A video node can have at most one first frame and one last frame");
    }
    if (lastFrameCount && !firstFrameCount) invalid("A last frame requires a first frame");
  }
}

function compilePlan(
  plan: CanvasAgentPlan,
  currentNodes: CanvasNode[],
  currentEdges: CanvasEdge[],
  viewport: { x: number; y: number; zoom: number },
): { forward: CanvasMutation[]; inverse: CanvasMutation[] } {
  const now = new Date().toISOString();
  const nodes = new Map(currentNodes.map((node) => [node.id, node]));
  const tempIds = new Map<string, string>();
  const forward: CanvasMutation[] = [];
  const inverse: CanvasMutation[] = [];
  const anchor = layoutAnchor(currentNodes, viewport);
  const positions = allocateNodePositions(plan.operations);

  for (const operation of plan.operations) {
    if (operation.type === "node.create") {
      const id = randomUUID();
      tempIds.set(operation.tempId, id);
      const size = defaultSize(operation.mediaType);
      const data = withOperationContent(createNodeData(operation.mediaType, operation.name), operation);
      const position = positions.get(operation)!;
      const node: CanvasNode = {
        id,
        projectId: plan.projectId,
        type: operation.mediaType,
        entityId: randomUUID(),
        positionX: anchor.x + position.column * LAYOUT_CELL_WIDTH,
        positionY: anchor.y + position.row * LAYOUT_CELL_HEIGHT,
        width: size.width,
        height: size.height,
        data,
        createdAt: now,
        updatedAt: now,
      };
      nodes.set(id, node);
      forward.push({ type: "node.create", node });
      inverse.unshift({ type: "node.delete", nodeId: id });
    } else if (operation.type === "node.update") {
      const current = nodes.get(operation.nodeId)!;
      const data = withOperationContent(structuredClone(current.data!), operation);
      forward.push({ type: "node.update", nodeId: current.id, patch: { data } });
      inverse.unshift({ type: "node.update", nodeId: current.id, patch: { data: current.data } });
      nodes.set(current.id, { ...current, data });
    }
  }

  let order = currentEdges.length;
  for (const operation of plan.operations) {
    if (operation.type !== "edge.create") continue;
    const sourceNodeId = tempIds.get(operation.source) ?? operation.source;
    const targetNodeId = tempIds.get(operation.target) ?? operation.target;
    const edge: CanvasEdge = {
      id: randomUUID(), projectId: plan.projectId, sourceNodeId, targetNodeId,
      edgeType: "references", role: operation.role ?? "reference", order: order++,
      createdAt: now, updatedAt: now,
    };
    forward.push({ type: "edge.create", edge, intent: "prompt-reference" });
    inverse.unshift({ type: "edge.delete", edgeId: edge.id });
  }
  return { forward, inverse };
}

/**
 * Agent 提供的行列只是布局意图，不能成为节点重叠的前提。缺少列、重复单元格或不同
 * 节点尺寸混排时，服务端顺序分配空网格；这样计划仍保留语义顺序但不会遮挡既有新节点。
 */
function allocateNodePositions(operations: CanvasAgentPlanOperation[]) {
  const occupied = new Set<string>();
  const positions = new Map<Extract<CanvasAgentPlanOperation, { type: "node.create" }>, { column: number; row: number }>();
  for (const operation of operations) {
    if (operation.type !== "node.create") continue;
    let column = operation.column ?? 0;
    let row = operation.row ?? 0;
    while (occupied.has(layoutCellKey(column, row))) {
      column += 1;
      if (column > MAX_LAYOUT_COLUMN) {
        column = 0;
        row += 1;
      }
    }
    occupied.add(layoutCellKey(column, row));
    positions.set(operation, { column, row });
  }
  return positions;
}

function layoutCellKey(column: number, row: number) {
  return `${column}:${row}`;
}

function normalizeOperations(operations: CanvasAgentPlanOperation[]): CanvasAgentPlanOperation[] {
  if (!Array.isArray(operations) || !operations.length || operations.length > MAX_OPERATIONS) {
    invalid(`A Canvas Agent plan must contain 1 to ${MAX_OPERATIONS} operations`);
  }
  if (operations.filter((operation) => operation.type === "node.create").length > MAX_CREATED_NODES) {
    invalid(`A Canvas Agent plan can create at most ${MAX_CREATED_NODES} nodes`);
  }
  const tempIds = new Set<string>();
  return operations.map((operation) => {
    if (operation.type === "node.create") {
      const tempId = bounded(operation.tempId, "tempId", 80);
      if (tempIds.has(tempId)) invalid(`Duplicate temporary node ID: ${tempId}`);
      tempIds.add(tempId);
      if (!isMediaType(operation.mediaType)) invalid("Unsupported canvas node media type");
      return { ...operation, tempId, name: bounded(operation.name, "name", 120),
        text: optionalBounded(operation.text, "text", 200_000), prompt: optionalBounded(operation.prompt, "prompt", 20_000),
        routeId: optionalBounded(operation.routeId, "routeId", 160),
        column: boundedGrid(operation.column), row: boundedGrid(operation.row) };
    }
    if (operation.type === "node.update") {
      if (operation.name === undefined && operation.text === undefined && operation.prompt === undefined && operation.routeId === undefined) invalid("A node update must change name, text, prompt, or route");
      return { ...operation, nodeId: bounded(operation.nodeId, "nodeId", 128),
        name: optionalBounded(operation.name, "name", 120), text: optionalBounded(operation.text, "text", 200_000),
        prompt: optionalBounded(operation.prompt, "prompt", 20_000), routeId: optionalBounded(operation.routeId, "routeId", 160) };
    }
    if (operation.type !== "edge.create") invalid("Unsupported Canvas Agent plan operation");
    if (operation.role !== undefined && operation.role !== "reference" && operation.role !== "first-frame" && operation.role !== "last-frame") invalid("Unsupported canvas reference role");
    return { ...operation, source: bounded(operation.source, "source", 128), target: bounded(operation.target, "target", 128), role: operation.role ?? "reference" };
  });
}

function referencedVersions(operations: CanvasAgentPlanOperation[], nodes: CanvasNode[], projectId: string): Record<string, string> {
  const tempIds = new Set(operations.flatMap((operation) => operation.type === "node.create" ? [operation.tempId] : []));
  const referencedIds = new Set(operations.flatMap((operation) => operation.type === "node.update" ? [operation.nodeId]
    : operation.type === "edge.create" ? [operation.source, operation.target].filter((id) => !tempIds.has(id)) : []));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const versions: Record<string, string> = {};
  for (const id of referencedIds) {
    const node = byId.get(id);
    if (!node || node.projectId !== projectId) invalid(`Referenced canvas node was not found: ${id}`);
    if (!node.data) invalid(`Referenced canvas node has no editable data: ${id}`);
    if (node.data?.taskInfo?.status === "queued" || node.data?.taskInfo?.status === "processing") invalid(`A running canvas node cannot be modified or connected: ${id}`);
    versions[id] = node.updatedAt;
  }
  for (const operation of operations) {
    if (operation.type === "edge.create" && operation.source === operation.target) invalid("A node cannot reference itself");
    if (operation.type === "edge.create" && !tempIds.has(operation.source) && !byId.has(operation.source)) invalid(`Unknown source: ${operation.source}`);
    if (operation.type === "edge.create" && !tempIds.has(operation.target) && !byId.has(operation.target)) invalid(`Unknown target: ${operation.target}`);
  }
  return versions;
}

function assertRebaseSafe(plan: CanvasAgentPlan, currentRevision: number, nodes: CanvasNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const conflicts = Object.entries(plan.referencedNodeVersions).filter(([id, version]) => byId.get(id)?.updatedAt !== version).map(([id]) => id);
  if (conflicts.length) throw new AppError("PIPELINE_CANVAS_REVISION_CONFLICT", "Canvas nodes used by this Agent plan changed after planning", 409,
    { nodeIds: conflicts, planRevision: plan.baseRevision, currentRevision });
}

function withOperationContent(data: CanvasNodeData, operation: Extract<CanvasAgentPlanOperation, { type: "node.create" | "node.update" }>): CanvasNodeData {
  const next = { ...data, params: data.params ? { ...data.params } : undefined };
  if (operation.name !== undefined) next.name = operation.name;
  if (operation.text !== undefined) {
    if (next.type !== "text") invalid("Text content can only be written to a text node");
    next.content = [operation.text];
    next.textDocument = plainTextDocument(operation.text);
  }
  if (operation.prompt !== undefined) {
    if (next.type === "text") invalid("Generation prompts belong to image, video, or audio nodes");
    next.params = { ...(next.params ?? { prompt: "" }), prompt: operation.prompt };
  }
  if (operation.routeId !== undefined) {
    if (next.type === "text") invalid("Generation routes belong to image, video, or audio nodes");
    next.params = { ...(next.params ?? { prompt: "" }), routeId: operation.routeId };
  }
  return next;
}

function layoutAnchor(nodes: CanvasNode[], viewport: { x: number; y: number; zoom: number }) {
  if (!nodes.length) return { x: Math.round(-viewport.x / viewport.zoom + 80), y: Math.round(-viewport.y / viewport.zoom + 80) };
  return { x: Math.max(...nodes.map((node) => node.positionX + (node.width ?? 320))) + COLUMN_GAP, y: Math.min(...nodes.map((node) => node.positionY)) };
}

function bounded(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) invalid(`${field} is invalid`);
  return value.trim();
}

function optionalBounded(value: unknown, field: string, max: number): string | undefined {
  return value === undefined ? undefined : bounded(value, field, max);
}

function boundedGrid(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 20) invalid("Plan grid coordinates must be integers from 0 to 20");
  return Number(value);
}

function isMediaType(value: string): value is CanvasMediaType {
  return value === "text" || value === "image" || value === "video" || value === "audio";
}

function invalid(message: string): never {
  throw new AppError("VALIDATION_ERROR", message, 400);
}
