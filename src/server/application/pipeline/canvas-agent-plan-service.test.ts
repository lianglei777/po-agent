import { describe, expect, it, vi } from "vitest";
import type { CanvasAgentAction, CanvasAgentPlan, CanvasNode } from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { CanvasStudioService } from "./canvas-studio-service";
import { CanvasAgentPlanService } from "./canvas-agent-plan-service";
import { CanvasAgentTurnPolicyRegistry } from "./canvas-agent-turn-policy-registry";

describe("CanvasAgentPlanService", () => {
  it("compiles temporary references into one atomic canvas batch and remains idempotent", async () => {
    const state = repositoryState();
    const canvas = {
      applyMutationBatch: vi.fn(async (_projectId, batch) => {
        state.revision += 1;
        return { revision: state.revision, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, batch };
      }),
    } as unknown as CanvasStudioService;
    const service = new CanvasAgentPlanService(state.repository, canvas, canvasPolicy());
    const plan = await service.create({
      projectId: "project-1",
      sessionId: "session-1",
      summary: "创建剧本、首帧和视频节点",
      operations: [
        { type: "node.create", tempId: "script", mediaType: "text", name: "剧本", text: "雨夜相遇", column: 0, row: 0 },
        { type: "node.create", tempId: "frame", mediaType: "image", name: "首帧", prompt: "雨夜街道", column: 1, row: 0 },
        { type: "node.create", tempId: "video", mediaType: "video", name: "镜头 1", prompt: "缓慢推进", column: 2, row: 0 },
        { type: "edge.create", source: "script", target: "frame", role: "reference" },
        { type: "edge.create", source: "frame", target: "video", role: "first-frame" },
      ],
    });

    const action = await service.apply("project-1", "session-1", plan.id);
    const batch = vi.mocked(canvas.applyMutationBatch).mock.calls[0]?.[1];
    expect(batch?.mutations.filter((mutation) => mutation.type === "node.create")).toHaveLength(3);
    const createdIds = new Set(batch?.mutations.flatMap((mutation) => mutation.type === "node.create" ? [mutation.node.id] : []));
    const edges = batch?.mutations.flatMap((mutation) => mutation.type === "edge.create" ? [mutation.edge] : []) ?? [];
    expect(edges).toHaveLength(2);
    expect(edges.every((edge) => createdIds.has(edge.sourceNodeId) && createdIds.has(edge.targetNodeId))).toBe(true);
    expect(action.inverseMutations.slice(0, 2).every((mutation) => mutation.type === "edge.delete")).toBe(true);

    await expect(service.apply("project-1", "session-1", plan.id)).resolves.toEqual(action);
    expect(canvas.applyMutationBatch).toHaveBeenCalledTimes(1);
  });

  it("rebases across unrelated edits but rejects changes to referenced nodes", async () => {
    const existing = node("text-1", "text", "v1");
    const state = repositoryState([existing]);
    const canvas = { applyMutationBatch: vi.fn(async () => ({ revision: 3 })) } as unknown as CanvasStudioService;
    const service = new CanvasAgentPlanService(state.repository, canvas, canvasPolicy());
    const plan = await service.create({
      projectId: "project-1", sessionId: "session-1", summary: "修改剧本",
      operations: [{ type: "node.update", nodeId: existing.id, text: "新版剧本" }],
    });

    state.revision = 2;
    await expect(service.apply("project-1", "session-1", plan.id)).resolves.toMatchObject({ status: "applied" });

    const otherState = repositoryState([existing]);
    const otherService = new CanvasAgentPlanService(otherState.repository, canvas, canvasPolicy());
    const conflicting = await otherService.create({
      projectId: "project-1", sessionId: "session-1", summary: "修改剧本",
      operations: [{ type: "node.update", nodeId: existing.id, text: "第三版" }],
    });
    otherState.revision = 2;
    otherState.nodes[0] = { ...existing, updatedAt: "v2" };
    await expect(otherService.apply("project-1", "session-1", conflicting.id))
      .rejects.toMatchObject({ code: "PIPELINE_CANVAS_REVISION_CONFLICT", status: 409 });
  });

  it("only undoes when no newer canvas edit would be overwritten", async () => {
    const state = repositoryState();
    const canvas = { applyMutationBatch: vi.fn(async () => ({ revision: ++state.revision })) } as unknown as CanvasStudioService;
    const service = new CanvasAgentPlanService(state.repository, canvas, canvasPolicy());
    const plan = await service.create({
      projectId: "project-1", sessionId: "session-1", summary: "创建节点",
      operations: [{ type: "node.create", tempId: "draft", mediaType: "text", name: "草稿", text: "内容" }],
    });
    const action = await service.apply("project-1", "session-1", plan.id);
    await expect(service.undo("project-1", "session-1", action.id)).resolves.toMatchObject({ status: "undone" });
    expect(canvas.applyMutationBatch).toHaveBeenCalledTimes(2);

    const nextState = repositoryState();
    const nextCanvas = { applyMutationBatch: vi.fn(async () => ({ revision: ++nextState.revision })) } as unknown as CanvasStudioService;
    const nextService = new CanvasAgentPlanService(nextState.repository, nextCanvas, canvasPolicy());
    const nextPlan = await nextService.create({ projectId: "project-1", sessionId: "session-1", summary: "创建节点",
      operations: [{ type: "node.create", tempId: "draft", mediaType: "text", name: "草稿" }] });
    const nextAction = await nextService.apply("project-1", "session-1", nextPlan.id);
    nextState.revision += 1;
    await expect(nextService.undo("project-1", "session-1", nextAction.id))
      .rejects.toMatchObject({ code: "PIPELINE_AGENT_ACTION_NOT_UNDOABLE", status: 409 });
  });

  it("allows script turns to edit text only", async () => {
    const text = node("text-1", "text", "v1");
    const image = node("image-1", "image", "v1");
    const state = repositoryState([text, image]);
    const service = new CanvasAgentPlanService(state.repository, {} as CanvasStudioService, scriptPolicy());
    await expect(service.create({ projectId: "project-1", sessionId: "session-1", summary: "改剧本",
      operations: [{ type: "node.update", nodeId: text.id, text: "新剧本" }] })).resolves.toMatchObject({ status: "draft" });
    await expect(service.create({ projectId: "project-1", sessionId: "session-1", summary: "改图片",
      operations: [{ type: "node.update", nodeId: image.id, name: "新图片" }] }))
      .rejects.toMatchObject({ code: "PIPELINE_AGENT_ACTION_NOT_ALLOWED" });
  });

  it("updates a media prompt and route together for a local rerun", async () => {
    const image = node("image-1", "image", "v1");
    const state = repositoryState([image]);
    const canvas = { applyMutationBatch: vi.fn(async () => ({ revision: ++state.revision })) } as unknown as CanvasStudioService;
    const service = new CanvasAgentPlanService(state.repository, canvas, canvasPolicy());
    const plan = await service.create({
      projectId: "project-1", sessionId: "session-1", summary: "调整图片并换 Route",
      operations: [{ type: "node.update", nodeId: image.id, prompt: "更深的蓝色", routeId: "image-route-2" }],
    });

    await service.apply("project-1", "session-1", plan.id);

    const batch = vi.mocked(canvas.applyMutationBatch).mock.calls[0]?.[1];
    expect(batch?.mutations[0]).toMatchObject({
      type: "node.update",
      patch: { data: { params: { prompt: "更深的蓝色", routeId: "image-route-2" } } },
    });
  });

  it("assigns distinct grid cells when an Agent omits or duplicates columns", async () => {
    const state = repositoryState();
    const canvas = { applyMutationBatch: vi.fn(async () => ({ revision: ++state.revision })) } as unknown as CanvasStudioService;
    const service = new CanvasAgentPlanService(state.repository, canvas, canvasPolicy());
    const plan = await service.create({
      projectId: "project-1", sessionId: "session-1", summary: "创建角色设定图",
      operations: [
        { type: "node.create", tempId: "character-a", mediaType: "image", name: "角色 A", row: 2 },
        { type: "node.create", tempId: "character-b", mediaType: "image", name: "角色 B", row: 2 },
        { type: "node.create", tempId: "character-c", mediaType: "image", name: "角色 C", column: 0, row: 2 },
      ],
    });

    await service.apply("project-1", "session-1", plan.id);

    const nodes = vi.mocked(canvas.applyMutationBatch).mock.calls[0]![1].mutations
      .flatMap((mutation) => mutation.type === "node.create" ? [mutation.node] : []);
    expect(nodes.map((node) => [node.positionX, node.positionY])).toEqual([
      [80, 940], [550, 940], [1020, 940],
    ]);
  });

  it("rejects a first-frame role unless it connects an image to a video node", async () => {
    const image = node("image-1", "image", "v1");
    const text = node("text-1", "text", "v1");
    const state = repositoryState([image, text]);
    const service = new CanvasAgentPlanService(state.repository, {} as CanvasStudioService, canvasPolicy());

    await expect(service.create({
      projectId: "project-1", sessionId: "session-1", summary: "错误的首帧引用",
      operations: [{ type: "edge.create", source: image.id, target: text.id, role: "first-frame" }],
    })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
  });
});

function repositoryState(initialNodes: CanvasNode[] = []) {
  const plans = new Map<string, CanvasAgentPlan>();
  const actions = new Map<string, CanvasAgentAction>();
  const state = {
    revision: 0,
    nodes: [...initialNodes],
    repository: undefined as unknown as PipelineRepository,
  };
  state.repository = {
    getCanvasRevision: vi.fn(async () => state.revision),
    listCanvasNodes: vi.fn(async () => state.nodes),
    listCanvasEdges: vi.fn(async () => []),
    getCanvasViewport: vi.fn(async () => ({ x: 0, y: 0, zoom: 1 })),
    createCanvasAgentPlan: vi.fn(async (input) => {
      const plan = { ...input, createdAt: "now", updatedAt: "now" };
      plans.set(plan.id, plan);
      return plan;
    }),
    getCanvasAgentPlan: vi.fn(async (id) => plans.get(id) ?? null),
    updateCanvasAgentPlan: vi.fn(async (id, patch) => {
      const current = plans.get(id);
      if (!current) return null;
      const updated = { ...current, ...patch, updatedAt: "later" };
      plans.set(id, updated);
      return updated;
    }),
    createCanvasAgentAction: vi.fn(async (input) => {
      const action = { ...input, createdAt: "now", updatedAt: "now" };
      actions.set(action.id, action);
      return action;
    }),
    getCanvasAgentAction: vi.fn(async (id) => actions.get(id) ?? null),
    updateCanvasAgentAction: vi.fn(async (id, patch) => {
      const current = actions.get(id);
      if (!current) return null;
      const updated = { ...current, ...patch, updatedAt: "later" };
      actions.set(id, updated);
      return updated;
    }),
  } as unknown as PipelineRepository;
  return state;
}

function canvasPolicy() {
  return policy("canvas", ["discuss", "script", "storyboard", "canvas"]);
}

function scriptPolicy() {
  return policy("script", ["discuss", "script"]);
}

function policy(effectiveStage: "script" | "canvas", allowedStages: Array<"discuss" | "script" | "storyboard" | "canvas">) {
  const policies = new CanvasAgentTurnPolicyRegistry();
  policies.begin("session-1", "turn-1", {
    type: "resolved", objective: "test", requestedStage: effectiveStage, effectiveStage,
    allowedStages, generationPermission: "not-requested", confidence: "high",
  });
  return policies;
}

function node(id: string, type: "text" | "image", updatedAt: string): CanvasNode {
  return {
    id, projectId: "project-1", type, entityId: `${id}-entity`, positionX: 0, positionY: 0,
    width: 320, height: 220, data: { type, name: id, action: `${type}_generate`, params: { prompt: "" }, taskInfo: { status: "idle" } },
    createdAt: "v1", updatedAt,
  };
}
