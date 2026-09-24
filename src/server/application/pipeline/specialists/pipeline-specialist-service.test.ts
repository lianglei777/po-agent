import { describe, expect, it, vi } from "vitest";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { CanvasNode } from "@/server/domain/pipeline";
import type { PipelineSpecialistProfileSource } from "@/server/ports/pipeline-specialist-profile-source";
import type { PipelineSpecialistRuntime } from "@/server/ports/pipeline-specialist-runtime";
import type { CanvasAgentPlanService } from "../canvas-agent-plan-service";
import type { CanvasStudioService } from "../canvas-studio-service";
import { PipelineSpecialistContextAssembler } from "./pipeline-specialist-context-assembler";
import { PipelineSpecialistService } from "./pipeline-specialist-service";

describe("PipelineSpecialistService", () => {
  it("repairs one invalid model response and creates a reviewable canvas plan", async () => {
    const repository = repositoryStub();
    const runtime = {
      run: vi.fn()
        .mockResolvedValueOnce("not-json")
        .mockResolvedValueOnce(JSON.stringify({
          kind: "script", summary: "完成短视频脚本", warnings: [], format: "short-video", title: "雨夜", logline: "雨夜重逢",
          episodes: [{ key: "main", title: "雨夜", objective: "完成重逢", estimatedDurationSeconds: 30,
            scenes: [{ key: "s1", heading: "街口", location: "街口", time: "夜", purpose: "相遇", content: "两人停下。", characterNames: ["阿宁"] }] }],
        })),
    } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-1", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const service = new PipelineSpecialistService(
      repository, profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, {} as CanvasStudioService,
    );

    const result = await service.run("script", request());

    expect(runtime.run).toHaveBeenCalledTimes(2);
    expect(runtime.run).toHaveBeenLastCalledWith(expect.objectContaining({ repairResponse: "not-json" }));
    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1", sessionId: "session-1",
      operations: [expect.objectContaining({ type: "node.create", creativeSpec: expect.objectContaining({ kind: "script" }) })],
    }));
    expect(result).toMatchObject({ kind: "script", planId: "plan-1", status: "draft", operationCount: 1 });
  });

  it("limits a local storyboard revision to the requested target node", async () => {
    const target = scriptNode("shot-3", "镜头 3");
    const repository = repositoryStub([target]);
    const shot = (targetNodeId: string | undefined, shotKey: string, order: number) => ({
      targetNodeId, shotKey, order, durationSeconds: 3,
      purpose: "加快节奏", visual: "动作快速完成", subjects: [], shotSize: "中景",
      cameraMovement: "快速推进", blocking: "主体居中", lighting: "自然光", audio: {},
    });
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "storyboard", episodeKey: "ep01", sourceNodeIds: [target.id], totalDurationSeconds: 6,
      summary: "局部调整", warnings: [], shots: [shot(target.id, "ep01-s03", 2), shot("outside-scope", "ep01-s04", 3)],
    })) } as unknown as PipelineSpecialistRuntime;
    const plans = { create: vi.fn(async (input) => ({ id: "plan-shot", status: "draft", summary: input.summary, operations: input.operations })) } as unknown as CanvasAgentPlanService;
    const service = new PipelineSpecialistService(
      repository, profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, {} as CanvasStudioService,
    );

    await service.run("storyboard", { ...request(), sourceNodeIds: [target.id], targetNodeIds: [target.id] });

    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({
      operations: [expect.objectContaining({ type: "node.update", nodeId: target.id })],
    }));
  });

  it("rejects a multi-target revision when the model omits one requested node", async () => {
    const first = scriptNode("shot-2", "镜头 2");
    const second = scriptNode("shot-3", "镜头 3");
    const repository = repositoryStub([first, second]);
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "storyboard", episodeKey: "ep01", sourceNodeIds: [first.id, second.id], totalDurationSeconds: 3,
      summary: "局部调整", warnings: [], shots: [{
        targetNodeId: first.id, shotKey: "ep01-s02", order: 1, durationSeconds: 3,
        purpose: "加快节奏", visual: "动作快速完成", subjects: [], shotSize: "中景",
        cameraMovement: "快速推进", blocking: "主体居中", lighting: "自然光", audio: {},
      }],
    })) } as unknown as PipelineSpecialistRuntime;
    const service = new PipelineSpecialistService(
      repository, profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      { create: vi.fn() } as unknown as CanvasAgentPlanService,
      {} as CanvasStudioService,
    );

    await expect(service.run("storyboard", {
      ...request(), sourceNodeIds: [first.id, second.id], targetNodeIds: [first.id, second.id],
    })).rejects.toMatchObject({
      code: "PIPELINE_SPECIALIST_OUTPUT_INVALID",
      details: { invalidTargetNodeIds: [second.id] },
    });
  });

  it("keeps ambiguous mentions non-blocking while creating a shared asset baseline", async () => {
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "asset", summary: "存在身份歧义", warnings: [], assets: [],
      unresolvedMentions: [{ name: "她", reason: "无法判断对应角色", sourceNodeIds: [] }],
    })) } as unknown as PipelineSpecialistRuntime;
    const plans = { create: vi.fn(async (input) => ({ id: "plan-asset", status: "draft", summary: input.summary, operations: input.operations })) } as unknown as CanvasAgentPlanService;
    const service = new PipelineSpecialistService(
      repositoryStub(), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, {} as CanvasStudioService,
    );

    const result = await service.run("asset", request());

    expect(result).toMatchObject({ planId: "plan-asset", status: "draft",
      warnings: expect.arrayContaining([expect.objectContaining({ code: "ASSET_IDENTITY_UNRESOLVED", blocking: false })]) });
    expect(plans.create).toHaveBeenCalledOnce();
  });

  it("keeps a same-named script intact when an asset model response targets it", async () => {
    const script = scriptNode("script-recorder", "旧录音机");
    const repository = repositoryStub([script]);
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "asset", summary: "提取独立道具", warnings: [], unresolvedMentions: [],
      assets: [{
        action: "update", targetNodeId: script.id, assetType: "prop", identityKey: "old-cassette-recorder",
        canonicalName: "旧录音机", aliases: ["录音机"], visualDescription: "银灰色旧式磁带录音机",
        continuityFacts: ["跨集复用"], sourceNodeIds: [script.id], confidence: "high",
      }],
    })) } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-asset", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const service = new PipelineSpecialistService(
      repository, profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, {} as CanvasStudioService,
    );

    await service.run("asset", {
      ...request(), objective: "创建独立旧录音机资产", sourceNodeIds: [script.id], targetNodeIds: [script.id],
    });

    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({
      operations: expect.arrayContaining([
        expect.objectContaining({ type: "node.create", creativeSpec: expect.objectContaining({ kind: "asset", identityKey: "old-cassette-recorder" }) }),
      ]),
    }));
    expect(plans.create).not.toHaveBeenCalledWith(expect.objectContaining({
      operations: expect.arrayContaining([expect.objectContaining({ type: "node.update", nodeId: script.id })]),
    }));
  });

  it("replaces an unusable reference Route with a compatible text Route", async () => {
    const asset = assetNode("asset-lead", "主角");
    const repository = repositoryStub([asset]);
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "prompt", summary: "配置角色参考图", warnings: [], configurations: [{
        sourceSpecNodeId: asset.id, name: "主角参考图", mediaType: "image",
        routeId: "image-to-image", prompt: "主角定妆照", settings: { resolution: "2k", strength: 0.7 }, references: [],
      }],
    })) } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-prompt", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const canvas = { listAvailableGenerationRoutes: vi.fn().mockResolvedValue([
      {
        id: "image-to-image", name: "Image edit", description: "Requires an image", capability: "image-to-image",
        defaults: { resolution: "2k" }, inputSchema: {
          parameters: [{ key: "resolution", type: "select", required: false, defaultValue: "2k", options: [{ label: "2k", value: "2k" }] }],
          assets: [{ key: "imageUrls", mediaType: "image", required: true, multiple: true, minFiles: 1 }],
        },
      },
      {
        id: "text-to-image", name: "Text image", description: "Creates an image from text", capability: "text-to-image",
        defaults: { resolution: "2k" }, inputSchema: {
          parameters: [{ key: "resolution", type: "select", required: false, defaultValue: "2k", options: [{ label: "2k", value: "2k" }] }],
          assets: [],
        },
      },
    ]) } as unknown as CanvasStudioService;
    const service = new PipelineSpecialistService(
      repository, profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, canvas,
    );

    const result = await service.run("prompt", { ...request(), objective: "为主角配置可运行文生图节点", sourceNodeIds: [asset.id] });

    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({
      operations: expect.arrayContaining([expect.objectContaining({ type: "node.create", routeId: "text-to-image", settings: { resolution: "2k" } })]),
    }));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PIPELINE_ROUTE_AUTO_CORRECTED", blocking: false }),
    ]));
  });

  it("removes references from a text Route that declares no asset inputs", async () => {
    const asset = assetNode("asset-lead", "主角");
    const image = mediaNode("image-lead", "image");
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "prompt", summary: "配置角色参考图", warnings: [], configurations: [{
        sourceSpecNodeId: asset.id, name: "主角参考图", mediaType: "image",
        routeId: "text-to-image", prompt: "主角定妆照", settings: {},
        references: [{ sourceNodeId: image.id, role: "reference", order: 0 }],
      }],
    })) } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-prompt", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const canvas = { listAvailableGenerationRoutes: vi.fn().mockResolvedValue([{
      id: "text-to-image", name: "Text image", description: "Creates an image from text", capability: "text-to-image",
      defaults: {}, inputSchema: { parameters: [], assets: [] },
    }]) } as unknown as CanvasStudioService;
    const service = new PipelineSpecialistService(
      repositoryStub([asset, image]), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, canvas,
    );

    const result = await service.run("prompt", { ...request(), objective: "创建主角参考图", sourceNodeIds: [asset.id, image.id] });

    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({
      operations: expect.arrayContaining([expect.objectContaining({ type: "node.create", routeId: "text-to-image" })]),
    }));
    expect(plans.create).not.toHaveBeenCalledWith(expect.objectContaining({
      operations: expect.arrayContaining([expect.objectContaining({ type: "edge.create", edgeType: "references" })]),
    }));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PROMPT_INVALID_REFERENCE_REMOVED", blocking: false }),
    ]));
  });

  it("normalizes unsupported settings on the selected Route", async () => {
    const shot = shotNode("shot-1", "镜头 1");
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "prompt", summary: "配置视频", warnings: [], configurations: [{
        sourceSpecNodeId: shot.id, name: "镜头视频", mediaType: "video", routeId: "text-to-video",
        prompt: "雨夜推进", settings: { durationSeconds: 3, aspectRatio: "9:16", unknown: true }, references: [],
      }],
    })) } as unknown as PipelineSpecialistRuntime;
    const plans = { create: vi.fn(async (input) => ({ id: "plan", status: "draft", summary: input.summary, operations: input.operations })) } as unknown as CanvasAgentPlanService;
    const canvas = { listAvailableGenerationRoutes: vi.fn().mockResolvedValue([{
      id: "text-to-video", name: "Text video", description: "Text video", capability: "text-to-video",
      defaults: { durationSeconds: 5, aspectRatio: "9:16" }, inputSchema: { parameters: [
        { key: "durationSeconds", type: "select", required: true, defaultValue: 5, options: [{ label: "4", value: 4 }, { label: "5", value: 5 }] },
        { key: "aspectRatio", type: "select", required: true, defaultValue: "9:16", options: [{ label: "9:16", value: "9:16" }] },
      ], assets: [] },
    }]) } as unknown as CanvasStudioService;
    const service = new PipelineSpecialistService(repositoryStub([shot]), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler, plans, canvas);

    const result = await service.run("prompt", { ...request(), sourceNodeIds: [shot.id] });

    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({ operations: expect.arrayContaining([
      expect.objectContaining({ type: "node.create", settings: { durationSeconds: 4, aspectRatio: "9:16" } }),
    ]) }));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PIPELINE_SETTINGS_AUTO_CORRECTED" }),
    ]));
  });

  it("synthesizes a conservative prompt configuration when the model returns an empty list", async () => {
    const asset = assetNode("asset-lead", "主角");
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "prompt", summary: "未返回配置", warnings: [], configurations: [],
    })) } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-prompt", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const canvas = { listAvailableGenerationRoutes: vi.fn().mockResolvedValue([{
      id: "text-to-image", name: "Text image", description: "Creates an image from text", capability: "text-to-image",
      defaults: { resolution: "2k" }, inputSchema: {
        parameters: [{ key: "resolution", type: "select", required: false, defaultValue: "2k", options: [{ label: "2k", value: "2k" }] }],
        assets: [],
      },
    }]) } as unknown as CanvasStudioService;
    const service = new PipelineSpecialistService(
      repositoryStub([asset]), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, canvas,
    );

    const result = await service.run("prompt", { ...request(), objective: "创建主角参考图", sourceNodeIds: [asset.id] });

    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({
      operations: expect.arrayContaining([expect.objectContaining({
        type: "node.create", mediaType: "image", routeId: "text-to-image", prompt: expect.stringContaining("短黑发"),
      })]),
    }));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PROMPT_CONFIGURATION_SYNTHESIZED", blocking: false }),
    ]));
  });

  it("uses the same bounded prompt fallback after the model repair remains invalid", async () => {
    const asset = assetNode("asset-lead", "主角");
    const runtime = { run: vi.fn().mockResolvedValueOnce("not-json").mockResolvedValueOnce("still-not-json") } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-prompt", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const canvas = { listAvailableGenerationRoutes: vi.fn().mockResolvedValue([{
      id: "text-to-image", name: "Text image", description: "Creates an image from text", capability: "text-to-image",
      defaults: {}, inputSchema: { parameters: [], assets: [] },
    }]) } as unknown as CanvasStudioService;
    const service = new PipelineSpecialistService(
      repositoryStub([asset]), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, canvas,
    );

    const result = await service.run("prompt", { ...request(), objective: "创建主角参考图", sourceNodeIds: [asset.id] });

    expect(runtime.run).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ planId: "plan-prompt", status: "draft" });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PROMPT_OUTPUT_FALLBACK", blocking: false }),
      expect.objectContaining({ code: "PROMPT_CONFIGURATION_SYNTHESIZED", blocking: false }),
    ]));
  });

  it("uses the bounded prompt fallback when the repair request itself fails", async () => {
    const asset = assetNode("asset-lead", "主角");
    const runtime = { run: vi.fn().mockResolvedValueOnce("not-json").mockRejectedValueOnce(new Error("provider repair failed")) } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-prompt", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const canvas = { listAvailableGenerationRoutes: vi.fn().mockResolvedValue([{
      id: "text-to-image", name: "Text image", description: "Creates an image from text", capability: "text-to-image",
      defaults: {}, inputSchema: { parameters: [], assets: [] },
    }]) } as unknown as CanvasStudioService;
    const service = new PipelineSpecialistService(
      repositoryStub([asset]), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, canvas,
    );

    const result = await service.run("prompt", { ...request(), objective: "创建主角参考图", sourceNodeIds: [asset.id] });

    expect(result).toMatchObject({ planId: "plan-prompt", status: "draft" });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PROMPT_OUTPUT_FALLBACK", blocking: false }),
    ]));
  });

  it("uses the bounded prompt fallback when the initial model request fails", async () => {
    const asset = assetNode("asset-lead", "主角");
    const runtime = { run: vi.fn().mockRejectedValue(new Error("provider returned invalid JSON")) } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-prompt", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const canvas = { listAvailableGenerationRoutes: vi.fn().mockResolvedValue([{
      id: "text-to-image", name: "Text image", description: "Creates an image from text", capability: "text-to-image",
      defaults: {}, inputSchema: { parameters: [], assets: [] },
    }]) } as unknown as CanvasStudioService;
    const service = new PipelineSpecialistService(
      repositoryStub([asset]), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, canvas,
    );

    const result = await service.run("prompt", { ...request(), objective: "创建主角参考图", sourceNodeIds: [asset.id] });

    expect(runtime.run).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ planId: "plan-prompt", status: "draft" });
  });

  it("creates an editable script draft when structured output and repair both fail", async () => {
    const runtime = { run: vi.fn().mockResolvedValueOnce("not-json").mockResolvedValueOnce("still-not-json") } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-script", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const service = new PipelineSpecialistService(
      repositoryStub(), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, {} as CanvasStudioService,
    );

    const result = await service.run("script", {
      ...request(), objective: "制作雨夜救助流浪猫的 60 秒短片", episodeKey: "rainy-cat",
      constraints: { preserveUserText: true, targetDurationSeconds: 60 },
    });

    expect(result).toMatchObject({ planId: "plan-script", status: "draft" });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "SCRIPT_OUTPUT_FALLBACK", blocking: false }),
    ]));
    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({
      operations: [expect.objectContaining({ type: "node.create", creativeSpec: expect.objectContaining({ key: "rainy-cat" }) })],
    }));
  });

  it.each([
    ["asset", "ASSET_OUTPUT_FALLBACK"],
    ["storyboard", "STORYBOARD_OUTPUT_FALLBACK"],
  ] as const)("creates an editable %s draft when structured output repair fails", async (kind, warningCode) => {
    const script = scriptNode("script-1", "雨夜短片");
    const runtime = { run: vi.fn().mockResolvedValueOnce("not-json").mockResolvedValueOnce("still-not-json") } as unknown as PipelineSpecialistRuntime;
    const plans = { create: vi.fn(async (input) => ({ id: `plan-${kind}`, status: "draft", summary: input.summary, operations: input.operations })) } as unknown as CanvasAgentPlanService;
    const service = new PipelineSpecialistService(repositoryStub([script]), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, {} as CanvasStudioService);

    const result = await service.run(kind, {
      ...request(), sourceNodeIds: [script.id], episodeKey: "rainy",
      constraints: { preserveUserText: true, targetDurationSeconds: 60, aspectRatio: "9:16", tone: "写实" },
    });

    expect(result).toMatchObject({ planId: `plan-${kind}`, status: "draft" });
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: warningCode })]));
  });

  it("keeps unresolved off-screen mentions non-blocking and creates a shared asset baseline", async () => {
    const script = scriptNode("script-1", "三集短剧");
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "asset", summary: "角色未出镜", warnings: [], assets: [],
      unresolvedMentions: [{ name: "前租客", reason: "仅在对白中被提及", sourceNodeIds: [script.id] }],
    })) } as unknown as PipelineSpecialistRuntime;
    const plans = { create: vi.fn(async (input) => ({ id: "plan-asset", status: "draft", summary: input.summary, operations: input.operations })) } as unknown as CanvasAgentPlanService;
    const service = new PipelineSpecialistService(repositoryStub([script]), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, {} as CanvasStudioService);

    const result = await service.run("asset", { ...request(), sourceNodeIds: [script.id], episodeKey: "drama" });

    expect(result).toMatchObject({ planId: "plan-asset", status: "draft" });
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ASSET_OUTPUT_FALLBACK", blocking: false }),
      expect.objectContaining({ code: "ASSET_IDENTITY_UNRESOLVED", blocking: false }),
    ]));
  });

  it("drops draft-local media aliases and falls back to text-to-video", async () => {
    const shot = shotNode("shot-1", "镜头 1");
    const runtime = { run: vi.fn().mockResolvedValue(JSON.stringify({
      kind: "prompt", summary: "配置视频", warnings: [], configurations: [{
        sourceSpecNodeId: shot.id, name: "镜头 1 视频", mediaType: "video",
        routeId: "multimodal-video", prompt: "空办公室中打印机启动", settings: {},
        references: [{ sourceNodeId: "asset-image-office", role: "reference", order: 0 }],
      }],
    })) } as unknown as PipelineSpecialistRuntime;
    const plans = {
      create: vi.fn(async (input) => ({ id: "plan-video", status: "draft", summary: input.summary, operations: input.operations })),
    } as unknown as CanvasAgentPlanService;
    const canvas = { listAvailableGenerationRoutes: vi.fn().mockResolvedValue([
      {
        id: "multimodal-video", name: "Multimodal", description: "Reference video", capability: "multimodal-to-video",
        defaults: {}, inputSchema: { parameters: [], assets: [{ key: "imageUrls", mediaType: "image", required: true, multiple: true, minFiles: 1 }] },
      },
      {
        id: "text-to-video", name: "Text video", description: "Text video", capability: "text-to-video",
        defaults: {}, inputSchema: { parameters: [], assets: [] },
      },
    ]) } as unknown as CanvasStudioService;
    const service = new PipelineSpecialistService(
      repositoryStub([shot]), profileSource(), runtime,
      { assemble: vi.fn().mockResolvedValue("trusted-context") } as unknown as PipelineSpecialistContextAssembler,
      plans, canvas,
    );

    const result = await service.run("prompt", { ...request(), objective: "创建镜头视频", sourceNodeIds: [shot.id] });

    expect(plans.create).toHaveBeenCalledWith(expect.objectContaining({
      operations: expect.arrayContaining([expect.objectContaining({ type: "node.create", routeId: "text-to-video" })]),
    }));
    expect(plans.create).not.toHaveBeenCalledWith(expect.objectContaining({
      operations: expect.arrayContaining([expect.objectContaining({ type: "edge.create", edgeType: "references" })]),
    }));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PROMPT_INVALID_REFERENCE_REMOVED", blocking: false }),
      expect.objectContaining({ code: "PIPELINE_ROUTE_AUTO_CORRECTED", blocking: false }),
    ]));
  });
});

function request() {
  return { projectId: "project-1", sessionId: "session-1", objective: "制作一个雨夜短视频",
    sourceNodeIds: [], targetNodeIds: [], constraints: { preserveUserText: true } };
}

function repositoryStub(nodes: CanvasNode[] = []): PipelineRepository {
  return {
    getAgentConversation: vi.fn().mockResolvedValue({ sessionId: "session-1", provider: "openai", modelId: "model-1" }),
    listCanvasNodes: vi.fn().mockResolvedValue(nodes),
    listCanvasEdges: vi.fn().mockResolvedValue([]),
  } as unknown as PipelineRepository;
}

function scriptNode(id: string, title: string): CanvasNode {
  return {
    id, projectId: "project-1", type: "text", entityId: `${id}-entity`, positionX: 0, positionY: 0,
    width: 320, height: 220,
    data: {
      type: "text", name: title, action: "text_generate", params: { prompt: "" }, taskInfo: { status: "idle" },
      creativeSpec: {
        schemaVersion: 1, kind: "script", level: "episode", key: "ep01", title,
        objective: "发现哥哥留下的录音", estimatedDurationSeconds: 12, characters: ["守塔人"], sourceNodeIds: [],
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function assetNode(id: string, title: string): CanvasNode {
  const node = scriptNode(id, title);
  node.data!.creativeSpec = {
    schemaVersion: 1, kind: "asset", assetType: "character", identityKey: "character:lead",
    canonicalName: title, aliases: [], visualDescription: "短黑发，深蓝外套", continuityFacts: [], sourceNodeIds: [],
  };
  return node;
}

function shotNode(id: string, title: string): CanvasNode {
  const node = scriptNode(id, title);
  node.data!.creativeSpec = {
    schemaVersion: 1, kind: "shot", shotKey: "s1", order: 0, durationSeconds: 5,
    purpose: "展示异常", visual: "空办公室中打印机自行启动", subjects: [], shotSize: "中景",
    cameraMovement: "缓慢推进", blocking: "打印机位于画面中央", lighting: "冷白荧光", audio: {}, sourceNodeIds: [],
  };
  return node;
}

function mediaNode(id: string, mediaType: "image" | "video" | "audio"): CanvasNode {
  return {
    id, projectId: "project-1", type: mediaType, entityId: `${id}-entity`, positionX: 0, positionY: 0,
    width: 320, height: 220,
    data: {
      type: mediaType, name: id, action: `${mediaType}_generate`, params: { prompt: "" }, taskInfo: { status: "completed" },
      content: [`https://example.com/${id}`],
    },
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function profileSource(): PipelineSpecialistProfileSource {
  return {
    get: vi.fn(async (kind) => ({ kind, version: "1.0.0", systemPrompt: "system", skillInstructions: "skill",
      maxInputCharacters: 10_000, maxOutputTokens: 2_000, temperature: 0.2 })),
  };
}
