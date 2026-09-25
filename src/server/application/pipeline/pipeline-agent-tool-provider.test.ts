import { describe, expect, it, vi } from "vitest";
import type { AssetGenerationService } from "./asset-generation-service";
import type { ScriptAnalysisService } from "./script-analysis-service";
import type { StoryboardService } from "./storyboard-service";
import type { VideoGenerationService } from "./video-generation-service";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import { PipelineAgentToolProvider } from "./pipeline-agent-tool-provider";
import { CanvasAgentTurnPolicyRegistry } from "./canvas-agent-turn-policy-registry";
import type { CanvasAgentPlanService } from "./canvas-agent-plan-service";
import type { CanvasAssetAnalysisService } from "./canvas-asset-analysis-service";
import type { CanvasContinuityService } from "./canvas-continuity-service";
import type { CanvasStudioService } from "./canvas-studio-service";
import type { PipelineSpecialistService } from "./specialists/pipeline-specialist-service";

describe("PipelineAgentToolProvider", () => {
  it("only exposes tools inside a server-bound Pipeline project scope", () => {
    const provider = createProvider(false);
    expect(provider.getTools({ sessionId: "chat", cwd: "D:\\work" })).toEqual([]);
    const tools = provider.getTools({
      sessionId: "pipeline-session",
      cwd: "D:\\project",
      pipelineProjectId: "project-1",
    });
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.map((tool) => tool.name)).toEqual([
      "pipeline_get_state",
      "canvas_get_generation_routes",
      "canvas_create_plan",
      "canvas_update_plan",
      "canvas_apply_plan",
      "canvas_undo_action",
      "canvas_inspect_assets",
      "canvas_review_results",
      "canvas_update_continuity",
      "canvas_save_workflow",
      "canvas_prepare_generation",
    ]);
    expect(tools.find((tool) => tool.name === "pipeline_get_state")?.parameters.properties)
      .not.toHaveProperty("projectId");
  });

  it("exposes the four internal specialists through one Pipeline chat", () => {
    const repository = { getAgentConversation: vi.fn() } as unknown as PipelineRepository;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      repository, new CanvasAgentTurnPolicyRegistry(), {} as CanvasAgentPlanService, {} as CanvasAssetAnalysisService,
      {} as CanvasContinuityService, {} as CanvasStudioService, {} as PipelineSpecialistService,
    );

    expect(provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "pipeline_run_script_specialist",
        "pipeline_run_asset_specialist",
        "pipeline_run_storyboard_specialist",
        "pipeline_run_prompt_specialist",
      ]));
  });

  it("rejects Specialist reads outside the current turn node scope", async () => {
    const policies = new CanvasAgentTurnPolicyRegistry();
    policies.begin("pipeline-session", "turn-1", {
      type: "resolved", objective: "只整理选中角色", requestedStage: "canvas", effectiveStage: "canvas",
      allowedStages: ["discuss", "script", "storyboard", "canvas"], generationPermission: "not-requested", confidence: "high",
      scope: { projectWide: false, nodeIds: ["allowed-node"] },
    });
    const specialist = { run: vi.fn() } as unknown as PipelineSpecialistService;
    const repository = { listCanvasNodes: vi.fn().mockResolvedValue([{ id: "allowed-node" }]) } as unknown as PipelineRepository;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      repository, policies, {} as CanvasAgentPlanService, {} as CanvasAssetAnalysisService,
      {} as CanvasContinuityService, {} as CanvasStudioService, specialist,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "pipeline_run_asset_specialist")!;

    await expect(tool.execute({ toolCallId: "tool-1", input: { objective: "提取角色", sourceNodeIds: ["outside-node"] } }))
      .rejects.toMatchObject({ code: "PIPELINE_SPECIALIST_SCOPE_EXCEEDED" });
    expect(specialist.run).not.toHaveBeenCalled();
  });

  it("allows one successful attempt per Specialist range and canvas revision while keeping episode batches independent", async () => {
    const policies = new CanvasAgentTurnPolicyRegistry();
    policies.begin("pipeline-session", "turn-1", {
      type: "resolved", objective: "制作两集分镜", requestedStage: "storyboard", effectiveStage: "storyboard",
      allowedStages: ["discuss", "script", "storyboard"], generationPermission: "not-requested", confidence: "high",
      scope: { projectWide: true, nodeIds: [] },
    });
    const specialist = { run: vi.fn().mockResolvedValue({
      kind: "storyboard", profileVersion: "1.0.0", planId: "plan-1", status: "draft", summary: "完成",
      operationCount: 1, affectedNodeIds: [], warnings: [],
    }) } as unknown as PipelineSpecialistService;
    const repository = {
      getCanvasRevision: vi.fn().mockResolvedValue(4),
      listCanvasNodes: vi.fn().mockResolvedValue([{ id: "script-1" }]),
    } as unknown as PipelineRepository;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      repository, policies, {} as CanvasAgentPlanService, {} as CanvasAssetAnalysisService,
      {} as CanvasContinuityService, {} as CanvasStudioService, specialist,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "pipeline_run_storyboard_specialist")!;
    const first = { objective: "第一集分镜", sourceNodeIds: ["script-1"], episodeKey: "ep-1" };

    const onUpdate = vi.fn();
    await expect(tool.execute({ toolCallId: "tool-1", input: first, onUpdate })).resolves.toBeDefined();
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      details: { kind: "storyboard", status: "running" },
    }));
    await expect(tool.execute({ toolCallId: "tool-2", input: { ...first, objective: "重试第一集" } }))
      .rejects.toMatchObject({ code: "PIPELINE_AGENT_ACTION_NOT_ALLOWED", details: { reason: "specialist-range-already-attempted" } });
    await expect(tool.execute({ toolCallId: "tool-3", input: { ...first, episodeKey: "ep-2" } })).resolves.toBeDefined();
    repository.getCanvasRevision = vi.fn().mockResolvedValue(5);
    await expect(tool.execute({ toolCallId: "tool-4", input: { ...first, objective: "应用上游修订后重跑第一集" } })).resolves.toBeDefined();
    expect(specialist.run).toHaveBeenCalledTimes(3);
  });

  it("blocks the failed range but permits another Specialist range in the same turn", async () => {
    const policies = new CanvasAgentTurnPolicyRegistry();
    policies.begin("pipeline-session", "turn-1", {
      type: "resolved", objective: "提取资产", requestedStage: "canvas", effectiveStage: "canvas",
      allowedStages: ["discuss", "script", "storyboard", "canvas"], generationPermission: "not-requested", confidence: "high",
      scope: { projectWide: true, nodeIds: [] },
    });
    const specialist = { run: vi.fn().mockRejectedValue(new Error("malformed output")) } as unknown as PipelineSpecialistService;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      { getCanvasRevision: vi.fn().mockResolvedValue(1), listCanvasNodes: vi.fn().mockResolvedValue([]) } as unknown as PipelineRepository,
      policies, {} as CanvasAgentPlanService, {} as CanvasAssetAnalysisService,
      {} as CanvasContinuityService, {} as CanvasStudioService, specialist,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "pipeline_run_asset_specialist")!;

    await expect(tool.execute({ toolCallId: "tool-1", input: { objective: "提取资产" } })).rejects.toThrow("malformed output");
    await expect(tool.execute({ toolCallId: "tool-2", input: { objective: "重试相同范围" } }))
      .rejects.toMatchObject({ code: "PIPELINE_AGENT_ACTION_NOT_ALLOWED", details: { reason: "specialist-range-already-attempted" } });
    await expect(tool.execute({ toolCallId: "tool-3", input: { objective: "改为从节点提取", sourceNodeIds: ["script-1"] } }))
      .rejects.toThrow("malformed output");
    expect(specialist.run).toHaveBeenCalledTimes(2);
  });

  it("repairs a unique one-character source node ID typo before running a Specialist", async () => {
    const policies = new CanvasAgentTurnPolicyRegistry();
    policies.begin("pipeline-session", "turn-source-repair", {
      type: "resolved", objective: "拆分镜头", requestedStage: "storyboard", effectiveStage: "storyboard",
      allowedStages: ["discuss", "script", "storyboard"], generationPermission: "not-requested", confidence: "high",
      scope: { projectWide: true, nodeIds: [] },
    });
    const specialist = { run: vi.fn().mockResolvedValue({
      kind: "storyboard", profileVersion: "1.0.0", planId: "plan-1", status: "draft", summary: "完成",
      operationCount: 1, affectedNodeIds: [], warnings: [],
    }) } as unknown as PipelineSpecialistService;
    const repository = {
      listCanvasNodes: vi.fn().mockResolvedValue([{ id: "bc87f02f-b461-4ebd-887d-e9595e114d57" }]),
      getCanvasRevision: vi.fn().mockResolvedValue(2),
    } as unknown as PipelineRepository;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      repository, policies, {} as CanvasAgentPlanService, {} as CanvasAssetAnalysisService,
      {} as CanvasContinuityService, {} as CanvasStudioService, specialist,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "pipeline_run_storyboard_specialist")!;

    await tool.execute({ toolCallId: "tool-source-repair", input: {
      objective: "拆分镜头", sourceNodeIds: ["bc87f02f-f461-4ebd-887d-e9595e114d57"],
    } });

    expect(specialist.run).toHaveBeenCalledWith("storyboard", expect.objectContaining({
      sourceNodeIds: ["bc87f02f-b461-4ebd-887d-e9595e114d57"],
    }), undefined);
  });

  it("declares operation-specific required fields in the plan tool schema", () => {
    const tool = createProvider(false).getTools({
      sessionId: "pipeline-session",
      cwd: "D:\\project",
      pipelineProjectId: "project-1",
    }).find((candidate) => candidate.name === "canvas_create_plan")!;
    const operations = tool.parameters.properties.operations as {
      items: { anyOf: Array<{ required: string[] }> };
    };

    expect(operations.items.anyOf.map((branch) => branch.required)).toEqual([
      ["mediaType", "name"],
      ["nodeId"],
      ["source", "target"],
    ]);
  });

  it("repairs omitted operation discriminators and standalone temporary IDs", async () => {
    const policies = new CanvasAgentTurnPolicyRegistry();
    policies.begin("pipeline-session", "turn-script", {
      type: "resolved", objective: "写剧本", requestedStage: "script", effectiveStage: "script",
      allowedStages: ["discuss", "script"], generationPermission: "not-requested", confidence: "high",
    });
    const planService = {
      create: vi.fn(async () => ({ id: "plan-1", status: "draft", summary: "写剧本", operations: [{}] })),
    } as unknown as CanvasAgentPlanService;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      {} as PipelineRepository, policies, planService, {} as CanvasAssetAnalysisService,
      {} as CanvasContinuityService, {} as CanvasStudioService,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "canvas_create_plan")!;

    await tool.execute({
      toolCallId: "plan-1",
      input: { summary: "写剧本", operations: [{ mediaType: "text", name: "剧本", text: "内容" }] },
    });

    expect(planService.create).toHaveBeenCalledWith(expect.objectContaining({
      operations: [{ type: "node.create", tempId: "node-1", mediaType: "text", name: "剧本", text: "内容" }],
    }));
  });

  it("preflights for manual generation without creating a run", async () => {
    const { provider, studio } = createGenerationProvider(true);
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "canvas_prepare_generation")!;

    const result = await tool.execute({ toolCallId: "prepare-1", input: { nodeIds: ["video-1"] } });

    expect(studio.prepareWorkflowGeneration).toHaveBeenCalledWith({ projectId: "project-1", nodeIds: ["video-1"] });
    expect(studio.startWorkflowGeneration).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ generationTrigger: "manual" });
    expect(result.terminate).toBe(true);
  });

  it("never exposes generation or paid recovery tools even for a legacy enabled project", () => {
    const { provider, studio } = createGenerationProvider(true);
    const names = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .map((tool) => tool.name);

    expect(names).not.toContain("canvas_run_generation");
    expect(names).not.toContain("canvas_recover_generation");
    expect(studio.startWorkflowGeneration).not.toHaveBeenCalled();
  });

  it("returns enabled generation Routes for the requested media type", async () => {
    const policies = new CanvasAgentTurnPolicyRegistry();
    policies.begin("pipeline-session", "turn-canvas-1", {
      type: "resolved", objective: "准备视频节点", requestedStage: "canvas", effectiveStage: "canvas",
      allowedStages: ["discuss", "canvas"], generationPermission: "not-requested", confidence: "high",
    });
    const studio = {
      listAvailableGenerationRoutes: vi.fn(async () => [
        { id: "image-route", capability: "text-to-image" },
        { id: "video-route", capability: "multimodal-to-video" },
      ]),
    } as unknown as CanvasStudioService;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      {} as PipelineRepository, policies, {} as CanvasAgentPlanService, {} as CanvasAssetAnalysisService,
      {} as CanvasContinuityService, studio,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "canvas_get_generation_routes")!;

    const result = await tool.execute({ toolCallId: "routes-1", input: { mediaType: "video" } });
    expect(result.details).toMatchObject({
      detail: false,
      routes: [{
        id: "video-route",
        capability: "multimodal-to-video",
        assetInputs: [],
      }],
    });
  });

  it("returns Agent-facing Route schemas only for explicitly selected candidates", async () => {
    const policies = new CanvasAgentTurnPolicyRegistry();
    policies.begin("pipeline-session", "turn-canvas-routes", {
      type: "resolved", objective: "准备视频节点", requestedStage: "canvas", effectiveStage: "canvas",
      allowedStages: ["discuss", "canvas"], generationPermission: "not-requested", confidence: "high",
    });
    const fullRoute = {
      id: "video-route", name: "Video", description: "Reference video", tags: ["reference"],
      product: "Video", providerId: "provider", capability: "multimodal-to-video", isDefault: false,
      defaults: { durationSeconds: 5 },
      inputSchema: {
        prompt: { required: true },
        parameters: [{
          key: "durationSeconds", label: "Duration", type: "select", required: true, defaultValue: 5,
          options: [{ label: "5 seconds", value: 5 }], presentation: { control: "slider" },
        }],
        assets: [{
          key: "imageUrls", label: "Images", mediaType: "image", multiple: true,
          acceptedTypes: ["image/png"], maxFileSizeBytes: 10_000,
        }],
      },
    };
    const studio = { listAvailableGenerationRoutes: vi.fn(async () => [fullRoute]) } as unknown as CanvasStudioService;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      {} as PipelineRepository, policies, {} as CanvasAgentPlanService, {} as CanvasAssetAnalysisService,
      {} as CanvasContinuityService, studio,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "canvas_get_generation_routes")!;

    const result = await tool.execute({ toolCallId: "routes-detail", input: { routeIds: ["video-route"] } });

    expect(result.details).toEqual({
      detail: true,
      routes: [{
        id: "video-route", name: "Video", description: "Reference video", tags: ["reference"],
        product: "Video", providerId: "provider", capability: "multimodal-to-video", isDefault: false,
        defaults: { durationSeconds: 5 },
        assetInputs: [{
          key: "imageUrls", mediaType: "image", required: false, multiple: true,
          minFiles: undefined, maxFiles: undefined,
        }],
        inputSchema: {
          prompt: { required: true },
          parameters: [{
            key: "durationSeconds", type: "select", required: true, defaultValue: 5,
            optionValues: [5], min: undefined, max: undefined, minLength: undefined,
            maxLength: undefined, format: undefined,
          }],
          assets: [{
            key: "imageUrls", mediaType: "image", required: false, multiple: true,
            minFiles: undefined, maxFiles: undefined,
          }],
          constraints: [],
        },
      }],
    });
  });

  it("returns created canvas node IDs when applying a plan", async () => {
    const policies = new CanvasAgentTurnPolicyRegistry();
    policies.begin("pipeline-session", "turn-canvas-1", {
      type: "resolved", objective: "创建图片节点", requestedStage: "canvas", effectiveStage: "canvas",
      allowedStages: ["discuss", "canvas"], generationPermission: "not-requested", confidence: "high",
    });
    const planService = {
      apply: vi.fn(async () => ({
        id: "action-1", planId: "plan-1", status: "applied", appliedRevision: 2,
        forwardMutations: [{ type: "node.create", node: { id: "image-node-1", type: "image", data: { name: "图标图片" } } }],
      })),
    } as unknown as CanvasAgentPlanService;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      { getAgentConversation: vi.fn() } as unknown as PipelineRepository, policies, planService,
      {} as CanvasAssetAnalysisService, {} as CanvasContinuityService, {} as CanvasStudioService,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "canvas_apply_plan")!;

    const result = await tool.execute({ toolCallId: "apply-1", input: { planId: "plan-1" } });

    expect(result.details).toMatchObject({ createdNodes: [{ nodeId: "image-node-1", name: "图标图片", type: "image" }] });
  });

  it("returns compact result review input with take and downstream scope", async () => {
    const policies = reviewPolicy();
    const repository = {
      getAgentConversation: vi.fn(async () => ({ provider: "openai", modelId: "vision-model" })),
      listCanvasNodes: vi.fn(async () => [{ id: "image-1", data: { name: "镜头 1", artifactIds: ["artifact-current"], params: { prompt: "产品特写", routeId: "route-1" }, taskInfo: { runId: "run-1" } } }]),
      listCanvasEdges: vi.fn(async () => [{ sourceNodeId: "image-1", targetNodeId: "video-1" }, { sourceNodeId: "video-1", targetNodeId: "audio-1" }]),
    } as unknown as PipelineRepository;
    const analysisService = {
      inspect: vi.fn(async () => [{ analysis: {
        id: "analysis-1", nodeId: "image-1", sourceName: "image.png", mediaType: "image",
        content: { summary: "主体居中", subjects: ["产品"], composition: "居中", materials: [], style: "极简", lighting: "柔光", visibleText: [], brandElements: [], suggestedRoles: [], technicalMetadata: {} },
      }, cached: false }]),
    } as unknown as CanvasAssetAnalysisService;
    const studio = {
      listNodeGenerationRuns: vi.fn(async () => [{
        run: { id: "run-1", status: "succeeded", routeId: "route-1", createdAt: "now" },
        artifacts: [{ id: "artifact-current" }], jobs: [],
      }]),
    } as unknown as CanvasStudioService;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      repository, policies, {} as CanvasAgentPlanService, analysisService, {} as CanvasContinuityService, studio,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "canvas_review_results")!;

    const result = await tool.execute({ toolCallId: "review-1", input: { nodeIds: ["image-1"] } });

    expect(result.details).toMatchObject({ items: [{
      nodeId: "image-1",
      takes: [{ runId: "run-1", current: true }],
      affectedDownstreamNodeIds: ["video-1", "audio-1"],
    }] });
  });

  it("compares historical local artifacts and prioritizes the current selection", async () => {
    const repository = {
      getAgentConversation: vi.fn(async () => ({ provider: "openai", modelId: "vision-model" })),
      listCanvasNodes: vi.fn(async () => [{
        id: "image-1",
        data: { type: "image", name: "镜头 1", artifactIds: ["artifact-current"], params: { prompt: "产品特写" } },
      }]),
      listCanvasEdges: vi.fn(async () => []),
    } as unknown as PipelineRepository;
    const analysisService = {
      inspect: vi.fn(),
      inspectGenerationArtifacts: vi.fn(async () => [{
        nodeId: "image-1", runId: "run-current", artifactId: "artifact-current", cached: false,
        analysis: {
          id: "analysis-current", nodeId: "image-1", sourceName: "current.png", mediaType: "image",
          content: { summary: "产品位于画面中央", subjects: ["产品"], composition: "居中", materials: [], style: "商业摄影", lighting: "柔光", visibleText: [], brandElements: [], suggestedRoles: [], technicalMetadata: {} },
        },
      }, {
        nodeId: "image-1", runId: "run-old", artifactId: "artifact-old", cached: true,
        analysis: {
          id: "analysis-old", nodeId: "image-1", sourceName: "old.png", mediaType: "image",
          content: { summary: "产品偏左", subjects: ["产品"], composition: "偏左", materials: [], style: "商业摄影", lighting: "硬光", visibleText: [], brandElements: [], suggestedRoles: [], technicalMetadata: {} },
        },
      }]),
    } as unknown as CanvasAssetAnalysisService;
    const studio = {
      listNodeGenerationRuns: vi.fn(async () => [{
        run: { id: "run-current", status: "succeeded", createdAt: "2026-09-04T10:00:00.000Z" },
        artifacts: [{ id: "artifact-current", kind: "image", localPath: "generated/current.png" }], jobs: [],
      }, {
        run: { id: "run-old", status: "succeeded", createdAt: "2026-09-04T09:00:00.000Z" },
        artifacts: [{ id: "artifact-old", kind: "image", localPath: "generated/old.png" }], jobs: [],
      }]),
    } as unknown as CanvasStudioService;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      repository, reviewPolicy(), {} as CanvasAgentPlanService, analysisService, {} as CanvasContinuityService, studio,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "canvas_review_results")!;

    const result = await tool.execute({ toolCallId: "review-history", input: { nodeIds: ["image-1"] } });

    expect(analysisService.inspectGenerationArtifacts).toHaveBeenCalledWith(expect.objectContaining({
      artifacts: [
        { nodeId: "image-1", runId: "run-current", artifactId: "artifact-current" },
        { nodeId: "image-1", runId: "run-old", artifactId: "artifact-old" },
      ],
    }));
    const item = (result.details as { items: Array<Record<string, unknown>> }).items[0]!;
    expect(item).toMatchObject({
      analysis: { summary: "产品位于画面中央" },
      analyzedTakeCount: 2,
    });
    expect(item.takes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        artifacts: [expect.objectContaining({ artifactId: "artifact-current", current: true, summary: "产品位于画面中央" })],
      }),
    ]));
  });

  it("saves only completed result nodes as a reusable workflow", async () => {
    const policies = new CanvasAgentTurnPolicyRegistry();
    policies.begin("pipeline-session", "turn-canvas-save", {
      type: "resolved", objective: "保存这个成功工作流", requestedStage: "canvas", effectiveStage: "canvas",
      allowedStages: ["discuss", "canvas"], generationPermission: "not-requested", confidence: "high",
    });
    const studio = {
      getState: vi.fn(async () => ({
        nodes: [{ id: "image-1", data: { type: "image", taskInfo: { status: "completed" } } }],
        edges: [],
      })),
      saveWorkflow: vi.fn(async () => ({ id: "workflow-1", name: "产品镜头", nodes: [{ id: "image-1" }] })),
    } as unknown as CanvasStudioService;
    const provider = new PipelineAgentToolProvider(
      {} as ScriptAnalysisService, {} as StoryboardService, {} as AssetGenerationService, {} as VideoGenerationService,
      { getAgentConversation: vi.fn() } as unknown as PipelineRepository, policies, {} as CanvasAgentPlanService,
      {} as CanvasAssetAnalysisService, {} as CanvasContinuityService, studio,
    );
    const tool = provider.getTools({ sessionId: "pipeline-session", cwd: "D:\\project", pipelineProjectId: "project-1" })
      .find((candidate) => candidate.name === "canvas_save_workflow")!;

    const result = await tool.execute({
      toolCallId: "save-1",
      input: { name: "产品镜头", description: "已确认的产品特写", nodeIds: ["image-1"] },
    });

    expect(studio.saveWorkflow).toHaveBeenCalledWith({
      projectId: "project-1", name: "产品镜头", description: "已确认的产品特写", nodeIds: ["image-1"],
    });
    expect(result.details).toEqual({ workflowId: "workflow-1", name: "产品镜头", nodeCount: 1 });
  });

});

function createGenerationProvider(allowAgentGeneration: boolean) {
  const repository = {
    getAgentConversation: vi.fn(async () => ({ allowAgentGeneration, sessionId: "pipeline-session" })),
  } as unknown as PipelineRepository;
  const policies = new CanvasAgentTurnPolicyRegistry();
  policies.begin("pipeline-session", "turn-generate-1", {
    type: "resolved",
    objective: "生成完整视频",
    requestedStage: "generate",
    effectiveStage: "generate",
    allowedStages: ["discuss", "canvas", "generate"],
    generationPermission: "allowed",
    confidence: "high",
  });
  const studio = {
    prepareWorkflowGeneration: vi.fn().mockResolvedValue({
      nodeIds: ["video-1"], edges: [], nodes: [{ nodeId: "video-1", name: "Video", type: "video" }],
      decisions: [{ nodeId: "video-1", name: "Video", status: "ready", reason: "explicitly-requested" }],
    }),
    startWorkflowGeneration: vi.fn().mockResolvedValue({
      created: true,
      run: { id: "workflow-1", status: "running", steps: [{ nodeId: "video-1", status: "running" }] },
    }),
  } as unknown as CanvasStudioService;
  const provider = new PipelineAgentToolProvider(
    {} as ScriptAnalysisService,
    {} as StoryboardService,
    {} as AssetGenerationService,
    {} as VideoGenerationService,
    repository,
    policies,
    {} as CanvasAgentPlanService,
    {} as CanvasAssetAnalysisService,
    {} as CanvasContinuityService,
    studio,
  );
  return { provider, studio };
}

function createProvider(allowAgentGeneration: boolean) {
  const repository = {
    getAgentConversation: vi.fn(async () => ({ allowAgentGeneration, sessionId: "pipeline-session" })),
  } as unknown as PipelineRepository;
  const policies = new CanvasAgentTurnPolicyRegistry();
  policies.begin("pipeline-session", "turn-1", {
    type: "resolved",
    objective: "查看状态",
    requestedStage: "discuss",
    effectiveStage: "discuss",
    allowedStages: ["discuss"],
    generationPermission: "not-requested",
    confidence: "high",
  });
  return new PipelineAgentToolProvider(
    {} as ScriptAnalysisService,
    {} as StoryboardService,
    {} as AssetGenerationService,
    {} as VideoGenerationService,
    repository,
    policies,
    {} as CanvasAgentPlanService,
    {} as CanvasAssetAnalysisService,
    {} as CanvasContinuityService,
    {} as CanvasStudioService,
  );
}

function reviewPolicy() {
  const policies = new CanvasAgentTurnPolicyRegistry();
  policies.begin("pipeline-session", "turn-review-1", {
    type: "resolved", objective: "评审结果", requestedStage: "review", effectiveStage: "review",
    allowedStages: ["discuss", "review"], generationPermission: "not-requested", confidence: "high",
  });
  return policies;
}
