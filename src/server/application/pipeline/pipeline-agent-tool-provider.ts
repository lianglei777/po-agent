import { createHash } from "node:crypto";
import { AppError } from "@/server/domain/app-error";
import type { AgentToolContext, AgentToolDefinition, AgentToolExecutionContext, AgentToolProvider, AgentToolResult } from "@/server/ports/agent-tool";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { ScriptAnalysisService } from "./script-analysis-service";
import type { StoryboardService } from "./storyboard-service";
import type { AssetGenerationService } from "./asset-generation-service";
import type { VideoGenerationService } from "./video-generation-service";
import type { CanvasAgentTurnPolicyRegistry } from "./canvas-agent-turn-policy-registry";
import type { CanvasAgentPlanOperation, CanvasNode } from "@/server/domain/pipeline";
import type { GenerationRunView } from "@/server/application/content-generation/generation-run-service";
import type { CanvasAgentPlanService } from "./canvas-agent-plan-service";
import type { CanvasAssetAnalysisService } from "./canvas-asset-analysis-service";
import type { CanvasContinuityOperation, CanvasContinuityService } from "./canvas-continuity-service";
import type { CanvasStudioService } from "./canvas-studio-service";

// PipelineAgentToolProvider — 将 pipeline 操作暴露为 Agent 工具。
// 实现 AgentToolProvider 接口，可注入到 AgentService 让 LLM 通过 tool call 驱动 pipeline。
export class PipelineAgentToolProvider implements AgentToolProvider {
  constructor(
    private readonly scriptService: ScriptAnalysisService,
    private readonly storyboardService: StoryboardService,
    private readonly assetService: AssetGenerationService,
    private readonly videoService: VideoGenerationService,
    private readonly repo: PipelineRepository,
    private readonly turnPolicies: CanvasAgentTurnPolicyRegistry,
    private readonly planService: CanvasAgentPlanService,
    private readonly assetAnalysisService: CanvasAssetAnalysisService,
    private readonly continuityService: CanvasContinuityService,
    private readonly canvasStudioService: CanvasStudioService,
  ) {}

  getTools(input: AgentToolContext): AgentToolDefinition[] {
    if (!input.pipelineProjectId) return [];
    const projectId = input.pipelineProjectId;
    // 第一批只开放只读状态；画布写入与生成工具会随意图和计划边界一起启用。
    return [
      this.getPipelineStateTool(input.sessionId, projectId),
      this.createPlanTool(input.sessionId, projectId),
      this.updatePlanTool(input.sessionId, projectId),
      this.applyPlanTool(input.sessionId, projectId),
      this.undoActionTool(input.sessionId, projectId),
      this.inspectAssetsTool(input.sessionId, projectId),
      this.reviewResultsTool(input.sessionId, projectId),
      this.updateContinuityTool(input.sessionId, projectId),
      this.saveWorkflowTool(input.sessionId, projectId),
      this.prepareGenerationTool(input.sessionId, projectId),
      this.runGenerationTool(input.sessionId, projectId),
      this.recoverGenerationTool(input.sessionId, projectId),
    ];
  }

  private recoverGenerationTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_recover_generation",
      label: "恢复画布生成",
      description: "恢复一个失败的画布生成。服务端会根据结构化诊断选择仅重新下载已有输出，或重新提交供应商任务；重新提交可能再次计费，并要求当前用户明确要求生成且已开启自动生成。",
      parameters: {
        type: "object",
        properties: {
          nodeId: { type: "string" },
          runId: { type: "string" },
        },
        required: ["nodeId", "runId"],
        additionalProperties: false,
      },
      execute: async ({ input, toolCallId }) => {
        this.turnPolicies.requireStage(sessionId, "discuss");
        const nodeId = String(input.nodeId ?? "").trim();
        const runId = String(input.runId ?? "").trim();
        const view = (await this.canvasStudioService.listNodeGenerationRuns(nodeId))
          .find((candidate) => candidate.run.id === runId);
        if (!view) throw new AppError("GENERATION_RUN_NOT_FOUND", "Generation run was not found for this canvas node", 404);
        const failure = view.jobs.at(-1)?.failure;
        if (failure?.recoveryAction === "none") {
          throw new AppError("GENERATION_DOWNLOAD_RECOVERY_UNAVAILABLE", "This generation failure cannot be recovered automatically", 409);
        }
        if (failure?.recoveryAction !== "redownload") {
          await this.requireGenerationPermission(sessionId, projectId);
        }
        const result = await this.canvasStudioService.recoverNodeGeneration(
          nodeId,
          runId,
          `pipeline-agent-recovery:${sessionId}:${toolCallId}`,
        );
        return {
          content: [{
            type: "text",
            text: result.action === "redownload"
              ? "已重新开始下载供应商已经生成的结果，不会重新提交生成任务。"
              : "已重新提交失败的供应商任务；该操作可能产生新的生成费用。",
          }],
          details: { action: result.action, nodeId, runId, failure, generation: result.view },
        };
      },
    };
  }

  private reviewResultsTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_review_results",
      label: "评审生成结果",
      description: "读取并分析已有图片、视频或音频结果，同时返回各节点最近的生成 take、当前选择和下游受影响范围。只提供事实、问题与建议；不得替用户锁定主观最佳结果，也不会触发生成。",
      promptGuidelines: [
        "按主体、构图、动作或节奏、镜头、风格与项目连续性分别说明观察结果。",
        "清楚区分客观观察、改进建议和用户尚未确认的最终选择。",
        "用户要求修改时，先用 canvas_create_plan/canvas_apply_plan 更新受影响节点；只有本轮明确要求重生成时才可继续生成。",
      ],
      parameters: {
        type: "object",
        properties: {
          nodeIds: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
        },
        required: ["nodeIds"],
        additionalProperties: false,
      },
      execute: async ({ input }) => {
        this.turnPolicies.requireStage(sessionId, "review");
        const nodeIds = [...new Set((input.nodeIds as string[]).map((id) => id.trim()).filter(Boolean))];
        const conversation = await this.repo.getAgentConversation(projectId);
        const model = conversation?.provider && conversation.modelId
          ? { provider: conversation.provider, modelId: conversation.modelId }
          : null;
        const [nodes, edges, histories] = await Promise.all([
          this.repo.listCanvasNodes(projectId),
          this.repo.listCanvasEdges(projectId),
          Promise.all(nodeIds.map((nodeId) => this.canvasStudioService.listNodeGenerationRuns(nodeId))),
        ]);
        const nodesById = new Map(nodes.map((node) => [node.id, node]));
        const perNodeArtifactLimit = Math.max(1, Math.floor(8 / nodeIds.length));
        const targets = nodeIds.flatMap((nodeId, index) => {
          const node = nodesById.get(nodeId);
          return node ? reviewArtifactTargets(node, histories[index]!, perNodeArtifactLimit) : [];
        });
        const historicalAnalyses = targets.length
          ? await this.assetAnalysisService.inspectGenerationArtifacts({ projectId, artifacts: targets, model })
          : [];
        const analyzedNodeIds = new Set(historicalAnalyses.map((result) => result.nodeId));
        const fallbackNodeIds = nodeIds.filter((nodeId) => !analyzedNodeIds.has(nodeId));
        const currentAnalyses = fallbackNodeIds.length
          ? await this.assetAnalysisService.inspect({ projectId, nodeIds: fallbackNodeIds, model })
          : [];
        const reviewByArtifact = new Map(historicalAnalyses.map((result) => [
          artifactReviewKey(result.nodeId, result.runId, result.artifactId), result,
        ]));
        const currentByNode = new Map(currentAnalyses.map((result) => [result.analysis.nodeId, result]));
        const items = nodeIds.map((nodeId, index) => {
          const node = nodesById.get(nodeId);
          if (!node?.data) {
            throw new AppError("PIPELINE_CANVAS_NODE_NOT_FOUND", "A selected canvas asset no longer exists in this project", 404, { nodeId });
          }
          const currentArtifactIds = currentArtifactIdsForNode(node);
          const takes = histories[index]!.slice(0, 6).map((view) => {
            const artifacts = view.artifacts
              .filter((artifact) => artifact.kind === node.data!.type)
              .map((artifact) => {
                const review = reviewByArtifact.get(artifactReviewKey(node.id, view.run.id, artifact.id));
                return {
                  artifactId: artifact.id,
                  current: currentArtifactIds.has(artifact.id),
                  analyzed: Boolean(review),
                  cached: review?.cached,
                  analysisId: review?.analysis.id,
                  summary: review?.analysis.content.summary,
                  technicalMetadata: review?.analysis.content.technicalMetadata,
                };
              });
            return {
              runId: view.run.id,
              status: view.run.status,
              routeId: view.run.routeId,
              createdAt: view.run.createdAt,
              completedAt: view.run.completedAt,
              artifactCount: view.artifacts.length,
              current: artifacts.some((artifact) => artifact.current),
              artifacts,
              errorMessage: view.run.errorMessage,
            };
          });
          const primaryReview = takes.flatMap((take) => take.artifacts)
            .find((artifact) => artifact.current && artifact.analyzed)
            ?? takes.flatMap((take) => take.artifacts).find((artifact) => artifact.analyzed);
          const fallback = currentByNode.get(nodeId);
          return {
            nodeId,
            name: node.data.name,
            mediaType: node.data.type,
            currentRunId: node.data.taskInfo?.runId,
            prompt: node.data.params?.prompt,
            routeId: node.data.params?.routeId,
            analysisId: primaryReview?.analysisId ?? fallback?.analysis.id,
            cached: fallback?.cached ?? primaryReview?.cached ?? false,
            analysis: primaryReview?.summary
              ? { summary: primaryReview.summary, technicalMetadata: primaryReview.technicalMetadata }
              : fallback?.analysis.content,
            takes,
            analyzedTakeCount: takes.flatMap((take) => take.artifacts).filter((artifact) => artifact.analyzed).length,
            affectedDownstreamNodeIds: downstreamNodeIds(nodeId, edges),
          };
        });
        return {
          content: [{ type: "text", text: JSON.stringify({ items }) }],
          details: { items },
        };
      },
    };
  }

  private saveWorkflowTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_save_workflow",
      label: "保存成功工作流",
      description: "仅在用户明确要求保存复用模板时，将已完成的成功子图保存为普通 workflow。不会生成内容，也不会自动替用户保存。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1, maxLength: 120 },
          description: { type: "string", maxLength: 1_000 },
          nodeIds: { type: "array", minItems: 1, maxItems: 30, items: { type: "string" } },
        },
        required: ["name", "nodeIds"],
        additionalProperties: false,
      },
      execute: async ({ input }) => {
        this.turnPolicies.requireStage(sessionId, "canvas");
        const nodeIds = [...new Set((input.nodeIds as string[]).map((id) => id.trim()).filter(Boolean))];
        const state = await this.canvasStudioService.getState(projectId);
        const byId = new Map(state.nodes.map((node) => [node.id, node]));
        const invalidNodeIds = nodeIds.filter((nodeId) => {
          const node = byId.get(nodeId);
          return !node?.data || (node.data.type !== "text" && node.data.generatorType !== "resource" && node.data.taskInfo?.status !== "completed");
        });
        if (invalidNodeIds.length) {
          throw new AppError("VALIDATION_ERROR", "Only completed results, text nodes, and source assets can be saved as a workflow", 409, { nodeIds: invalidNodeIds });
        }
        const workflow = await this.canvasStudioService.saveWorkflow({
          projectId,
          name: input.name as string,
          description: typeof input.description === "string" ? input.description : undefined,
          nodeIds,
        });
        return {
          content: [{ type: "text", text: `已保存工作流“${workflow.name}”（${workflow.nodes.length} 个节点）。` }],
          details: { workflowId: workflow.id, name: workflow.name, nodeCount: workflow.nodes.length },
        };
      },
    };
  }

  private prepareGenerationTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_prepare_generation",
      label: "预检画布生成",
      description: "解析待生成节点及缺失或过期的上游依赖，并校验 Route、参数和素材绑定。此操作不会创建 Generation Run，也不会产生内容生成费用。完成画布编排后应先调用此工具。",
      parameters: generationNodeParameters,
      execute: async ({ input }) => {
        this.turnPolicies.requireStage(sessionId, "canvas");
        const prepared = await this.canvasStudioService.prepareWorkflowGeneration({
          projectId,
          nodeIds: input.nodeIds as string[],
        });
        const conversation = await this.repo.getAgentConversation(projectId);
        const automaticGenerationEnabled = conversation?.allowAgentGeneration === true;
        return {
          content: [{
            type: "text",
            text: automaticGenerationEnabled
              ? `生成预检通过，共 ${prepared.nodeIds.length} 个节点。只有当前用户明确要求生成时，才可继续调用 canvas_run_generation。`
              : `生成预检通过，共 ${prepared.nodeIds.length} 个节点。自动生成已关闭，请用户在节点上手动点击生成。`,
          }],
          details: { ...prepared, automaticGenerationEnabled },
        };
      },
    };
  }

  private runGenerationTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_run_generation",
      label: "运行画布生成",
      description: "仅当当前用户明确要求实际生成内容，且项目已开启自动生成时，按依赖顺序启动已准备的节点。重复调用同一回合和同一节点集合会复用 Workflow Run，不会重复创建付费任务。",
      promptGuidelines: [
        "必须先调用 canvas_prepare_generation 并使用相同的 nodeIds。",
        "写剧本、修改提示词、搭建节点或讨论方案时禁止调用。",
      ],
      parameters: generationNodeParameters,
      execute: async ({ input }) => {
        await this.requireGenerationPermission(sessionId, projectId);
        const active = this.turnPolicies.getActive(sessionId);
        if (!active) {
          throw new AppError("PIPELINE_AGENT_ACTION_NOT_ALLOWED", "No active Agent turn is available for generation", 403);
        }
        const nodeIds = [...new Set((input.nodeIds as string[]).map((id) => id.trim()).filter(Boolean))].sort();
        const workflowRunId = stableWorkflowRunId(projectId, sessionId, active.turnId, nodeIds);
        const result = await this.canvasStudioService.startWorkflowGeneration({
          id: workflowRunId,
          projectId,
          nodeIds,
        });
        return {
          content: [{
            type: "text",
            text: result.created
              ? `已启动画布生成，共 ${result.run.steps.length} 个节点。Workflow Run ID: ${result.run.id}`
              : `已复用本回合已经创建的画布生成任务。Workflow Run ID: ${result.run.id}`,
          }],
          details: {
            workflowRunId: result.run.id,
            created: result.created,
            status: result.run.status,
            steps: result.run.steps,
          },
        };
      },
    };
  }

  private inspectAssetsTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_inspect_assets",
      label: "分析画布素材",
      description: "分析当前项目中的图片、视频或音频节点。图片使用当前 Canvas Agent 模型的视觉能力；视频先采样少量帧再分析镜头与运动；音频提取节奏、动态和静音比例。相同素材和分析配置会复用缓存。",
      parameters: {
        type: "object",
        properties: {
          nodeIds: {
            type: "array", minItems: 1, maxItems: 8,
            items: { type: "string" },
            description: "要分析的画布素材节点 ID，优先使用用户选中或 @ 引用的节点",
          },
        },
        required: ["nodeIds"],
        additionalProperties: false,
      },
      execute: async ({ input }) => {
        this.turnPolicies.requireStage(sessionId, "discuss");
        const conversation = await this.repo.getAgentConversation(projectId);
        const results = await this.assetAnalysisService.inspect({
          projectId,
          nodeIds: input.nodeIds as string[],
          model: conversation?.provider && conversation.modelId
            ? { provider: conversation.provider, modelId: conversation.modelId }
            : null,
        });
        return {
          content: [{
            type: "text",
            text: JSON.stringify(results.map(({ analysis, cached }) => ({
              analysisId: analysis.id,
              nodeId: analysis.nodeId,
              cached,
              ...analysis.content,
            }))),
          }],
          details: {
            analyses: results.map(({ analysis, cached }) => ({
              id: analysis.id, nodeId: analysis.nodeId, mediaType: analysis.mediaType,
              cached, summary: analysis.content.summary,
            })),
          },
        };
      },
    };
  }

  private updateContinuityTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_update_continuity",
      label: "更新连续性设定",
      description: "仅当当前用户消息明确要求记住、确认、更正或删除设定时，保存项目连续性事实。confirmationQuote 必须原样引用当前用户消息；分析建议本身不能直接保存为已确认事实。",
      parameters: {
        type: "object",
        properties: {
          operations: {
            type: "array", minItems: 1, maxItems: 20,
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["upsert", "remove"] },
                entryId: { type: "string" },
                category: { type: "string", enum: ["character", "product", "scene", "wardrobe", "palette", "style", "camera"] },
                label: { type: "string" },
                value: { type: "string" },
                sourceAnalysisIds: { type: "array", items: { type: "string" }, maxItems: 20 },
                confirmationQuote: { type: "string", description: "当前用户消息中的原文短句" },
              },
              required: ["type", "confirmationQuote"],
              additionalProperties: false,
            },
          },
        },
        required: ["operations"],
        additionalProperties: false,
      },
      execute: async ({ input }) => {
        const bible = await this.continuityService.update({
          projectId,
          sessionId,
          operations: input.operations as CanvasContinuityOperation[],
        });
        return {
          content: [{ type: "text", text: `已保存项目连续性设定（版本 ${bible.revision}，共 ${bible.entries.length} 条）。` }],
          details: { revision: bible.revision, entries: bible.entries },
        };
      },
    };
  }

  private createPlanTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_create_plan",
      label: "创建画布计划",
      description: "为当前要求创建结构化画布修改计划。先调用此工具，再根据结果调用 canvas_apply_plan。只写剧本时只能创建或更新文本节点；搭建画布时可创建媒体节点、提示词和引用。",
      promptGuidelines: [
        "每个 node.create 必须同时提供 tempId、mediaType、name；tempId 只在当前计划内使用。",
        "可提供 column 和 row 表示期望顺序；服务端会自动避让重复或缺失的网格位置，不能依赖重叠布局。",
        "first-frame 和 last-frame 仅用于图片节点连接到视频节点；其它任何连线必须使用 reference。last-frame 必须和同一视频节点的 first-frame 一起提供。",
        "当前回合要求澄清时不要调用此工具，直接提出服务器给出的澄清问题。",
      ],
      parameters: planParameters(false),
      execute: async ({ input }) => {
        const plan = await this.planService.create({
          projectId,
          sessionId,
          summary: input.summary as string,
          operations: input.operations as CanvasAgentPlanOperation[],
        });
        return {
          content: [{ type: "text", text: `计划已创建：${plan.summary}（${plan.operations.length} 项操作）。计划 ID: ${plan.id}` }],
          details: { planId: plan.id, status: plan.status, summary: plan.summary, operationCount: plan.operations.length },
        };
      },
    };
  }

  private updatePlanTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_update_plan",
      label: "更新画布计划",
      description: "根据用户反馈替换尚未应用的计划内容。不能修改已经应用的计划。",
      parameters: planParameters(true),
      execute: async ({ input }) => {
        const plan = await this.planService.update({
          projectId,
          sessionId,
          planId: input.planId as string,
          summary: input.summary as string,
          operations: input.operations as CanvasAgentPlanOperation[],
        });
        return {
          content: [{ type: "text", text: `计划已更新：${plan.summary}（${plan.operations.length} 项操作）。` }],
          details: { planId: plan.id, status: plan.status, summary: plan.summary, operationCount: plan.operations.length },
        };
      },
    };
  }

  private applyPlanTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_apply_plan",
      label: "应用画布计划",
      description: "原子应用已创建的画布计划。仅使用 canvas_create_plan 或 canvas_update_plan 返回的计划 ID。不会触发图片、视频或音频生成。",
      parameters: { type: "object", properties: { planId: { type: "string" } }, required: ["planId"], additionalProperties: false },
      execute: async ({ input }) => {
        const action = await this.planService.apply(projectId, sessionId, input.planId as string);
        const createdNodes = action.forwardMutations.flatMap((mutation) =>
          mutation.type === "node.create"
            ? [{
                nodeId: mutation.node.id,
                name: mutation.node.data?.name ?? mutation.node.id,
                type: mutation.node.type,
              }]
            : [],
        );
        return {
          content: [{
            type: "text",
            text: `画布计划已应用。操作 ID: ${action.id}。${createdNodes.length ? `已创建节点：${JSON.stringify(createdNodes)}。后续预检或生成必须原样使用其中的 nodeId。` : ""}如需撤销，可调用 canvas_undo_action。`,
          }],
          details: {
            actionId: action.id,
            planId: action.planId,
            status: action.status,
            revision: action.appliedRevision,
            createdNodes,
          },
        };
      },
    };
  }

  private undoActionTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "canvas_undo_action",
      label: "撤销 Agent 修改",
      description: "撤销一组刚刚应用的 Agent 画布修改。画布随后被用户修改时会拒绝自动撤销，以免覆盖用户工作。",
      parameters: { type: "object", properties: { actionId: { type: "string" } }, required: ["actionId"], additionalProperties: false },
      execute: async ({ input }) => {
        const action = await this.planService.undo(projectId, sessionId, input.actionId as string);
        return {
          content: [{ type: "text", text: "Agent 的画布修改已撤销。" }],
          details: { actionId: action.id, planId: action.planId, status: action.status },
        };
      },
    };
  }

  private analyzeScriptTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "pipeline_analyze_script",
      label: "剧本分析",
      description: "分析剧本文本，提取角色、场景、道具实体，在画布上创建节点。当用户想要分析剧本、提取角色或场景时调用。",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (): Promise<AgentToolResult> => {
        this.turnPolicies.requireStage(sessionId, "canvas");
        const assets = await this.scriptService.extractEntities(projectId);
        return {
          content: [{ type: "text", text: `已提取 ${assets.length} 个实体（角色/场景/道具），节点已添加到画布` }],
          details: { count: assets.length, assetIds: assets.map((a) => a.id) },
        };
      },
    };
  }

  private extractStoryboardTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "pipeline_extract_storyboard",
      label: "分镜提取",
      description: "从剧本生成分镜帧，创建画布节点并连接资产。当用户想要切分分镜、生成镜头列表时调用。",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (): Promise<AgentToolResult> => {
        this.turnPolicies.requireStage(sessionId, "canvas");
        const frames = await this.storyboardService.extractFrames(projectId);
        return {
          content: [{ type: "text", text: `已提取 ${frames.length} 个分镜帧，节点和连接已添加到画布` }],
          details: { count: frames.length, frameIds: frames.map((f) => f.id) },
        };
      },
    };
  }

  private generateAssetImageTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "pipeline_generate_asset_image",
      label: "生成资产图",
      description: "为角色、场景或道具生成参考图。当用户想要生成角色的外观图、场景的环境图时调用。",
      parameters: {
        type: "object",
        properties: {
          assetId: { type: "string", description: "资产 ID" },
        },
        required: ["assetId"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        await this.requireGenerationPermission(sessionId, projectId);
        const variant = await this.assetService.generateAssetImage(
          projectId, ctx.input.assetId as string, "agent-tool",
        );
        return {
          content: [{ type: "text", text: `已创建资产生成任务，正在处理中。变体 ID: ${variant.id}` }],
          details: { variantId: variant.id, runId: variant.runId },
        };
      },
    };
  }

  private generateFrameImageTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "pipeline_generate_frame_image",
      label: "生成分镜图",
      description: "为分镜帧生成图片（image-to-image），使用关联角色的参考图。当用户想要生成某个镜头的画面时调用。",
      parameters: {
        type: "object",
        properties: {
          frameId: { type: "string", description: "分镜帧 ID" },
        },
        required: ["frameId"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        await this.requireGenerationPermission(sessionId, projectId);
        const runId = await this.storyboardService.generateFrameImage(
          projectId, ctx.input.frameId as string, "agent-tool",
        );
        return {
          content: [{ type: "text", text: `已创建分镜图生成任务，正在处理中。Run ID: ${runId}` }],
          details: { runId },
        };
      },
    };
  }

  private generateVideoTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "pipeline_generate_video",
      label: "生成视频",
      description: "为分镜帧生成视频。mode 为 i2v 时用分镜图作为源图生成视频（画面优先）；mode 为 r2v 时用角色参考图直接生成视频（节奏优先）。",
      parameters: {
        type: "object",
        properties: {
          frameId: { type: "string", description: "分镜帧 ID" },
          mode: { type: "string", description: "生成模式: i2v 或 r2v", enum: ["i2v", "r2v"] },
        },
        required: ["frameId", "mode"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        await this.requireGenerationPermission(sessionId, projectId);
        const mode = ctx.input.mode as "i2v" | "r2v";
        const runId = mode === "i2v"
          ? await this.videoService.generateI2V(projectId, ctx.input.frameId as string, "agent-tool")
          : await this.videoService.generateR2V(projectId, ctx.input.frameId as string, "agent-tool");
        return {
          content: [{ type: "text", text: `已创建视频生成任务（${mode}），正在处理中。Run ID: ${runId}` }],
          details: { runId, mode },
        };
      },
    };
  }

  private selectFinalTakeTool(sessionId: string): AgentToolDefinition {
    return {
      name: "pipeline_select_final_take",
      label: "选择最终视频",
      description: "为分镜帧选择最终视频 take。当用户对某个生成的视频满意，想要将其作为最终版本时调用。",
      parameters: {
        type: "object",
        properties: {
          frameId: { type: "string", description: "分镜帧 ID" },
          runId: { type: "string", description: "要选为最终版本的视频 Run ID" },
        },
        required: ["frameId", "runId"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        this.turnPolicies.requireStage(sessionId, "review");
        await this.videoService.selectFinalTake(ctx.input.frameId as string, ctx.input.runId as string);
        return {
          content: [{ type: "text", text: `已将 Run ${ctx.input.runId} 选为分镜 ${ctx.input.frameId} 的最终视频` }],
          details: {},
        };
      },
    };
  }

  private getPipelineStateTool(sessionId: string, projectId: string): AgentToolDefinition {
    return {
      name: "pipeline_get_state",
      label: "获取进度",
      description: "读取当前 pipeline 的阶段进度、资产数量、分镜数量及画布节点 ID。当用户询问项目状态，或在应用计划后需要对具体节点预检或生成时调用。",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (): Promise<AgentToolResult> => {
        this.turnPolicies.requireStage(sessionId, "discuss");
        const [stages, assets, frames, workflowRuns, canvas] = await Promise.all([
          this.repo.getStageStatuses(projectId),
          this.repo.listAssets(projectId),
          this.repo.listFrames(projectId),
          this.repo.listCanvasWorkflowRuns(projectId, 10),
          this.canvasStudioService.getState(projectId),
        ]);
        const canvasNodes = await Promise.all(canvas.nodes.map(async (node) => {
          const status = node.data?.taskInfo?.status ?? "idle";
          const latest = status === "failed"
            ? (await this.canvasStudioService.listNodeGenerationRuns(node.id))[0]
            : undefined;
          return {
            nodeId: node.id,
            name: node.data?.name ?? node.id,
            type: node.type,
            status,
            runId: latest?.run.id ?? node.data?.taskInfo?.runId,
            errorCode: latest?.run.errorCode,
            errorMessage: latest?.run.errorMessage,
            failure: latest?.jobs.at(-1)?.failure,
          };
        }));
        return {
          content: [{ type: "text", text: JSON.stringify({ stages, assetCount: assets.length, frameCount: frames.length, workflowRuns, canvasNodes }) }],
          details: { stages, assetCount: assets.length, frameCount: frames.length, workflowRuns, canvasNodes },
        };
      },
    };
  }

  private async requireGenerationPermission(sessionId: string, projectId: string): Promise<void> {
    this.turnPolicies.requireStage(sessionId, "generate");
    const conversation = await this.repo.getAgentConversation(projectId);
    if (!conversation || conversation.sessionId !== sessionId) {
      throw new AppError(
        "PIPELINE_AGENT_ACTION_NOT_ALLOWED",
        "The active Agent session is not bound to this Pipeline project",
        403,
      );
    }
    if (!conversation.allowAgentGeneration) {
      throw new AppError(
        "AGENT_GENERATION_DISABLED",
        "Automatic generation is disabled for this Pipeline project",
        403,
      );
    }
  }
}

const generationNodeParameters = {
  type: "object" as const,
  properties: {
    nodeIds: {
      type: "array",
      minItems: 1,
      maxItems: 30,
      items: { type: "string" },
      description: "用户明确要求生成的画布节点 ID；服务端会补齐缺失或过期的上游生成依赖",
    },
  },
  required: ["nodeIds"],
  additionalProperties: false,
};

function stableWorkflowRunId(projectId: string, sessionId: string, turnId: string, nodeIds: string[]): string {
  const hex = createHash("sha256")
    .update(JSON.stringify({ projectId, sessionId, turnId, nodeIds }))
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function planParameters(includePlanId: boolean) {
  return {
    type: "object" as const,
    properties: {
      ...(includePlanId ? { planId: { type: "string", description: "要替换的草稿计划 ID" } } : {}),
      summary: { type: "string", description: "3 至 7 行以内的计划摘要" },
      operations: {
        type: "array",
        description: "按语义描述节点和引用；临时 ID 只在本计划中使用",
        maxItems: 60,
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["node.create", "node.update", "edge.create"] },
            tempId: { type: "string" },
            mediaType: { type: "string", enum: ["text", "image", "video", "audio"] },
            nodeId: { type: "string" },
            name: { type: "string" },
            text: { type: "string" },
            prompt: { type: "string" },
            routeId: { type: "string", description: "可选的已启用生成 Route ID；修改后必须重新预检" },
            column: { type: "integer", minimum: 0, maximum: 20 },
            row: { type: "integer", minimum: 0, maximum: 20 },
            source: { type: "string" },
            target: { type: "string" },
            role: { type: "string", enum: ["reference", "first-frame", "last-frame"] },
          },
          required: ["type"],
        },
      },
    },
    required: includePlanId ? ["planId", "summary", "operations"] : ["summary", "operations"],
    additionalProperties: false,
  };
}

function downstreamNodeIds(sourceNodeId: string, edges: Array<{ sourceNodeId: string; targetNodeId: string }>): string[] {
  const result: string[] = [];
  const visited = new Set([sourceNodeId]);
  const queue = [sourceNodeId];
  while (queue.length && result.length < 40) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.sourceNodeId !== current || visited.has(edge.targetNodeId)) continue;
      visited.add(edge.targetNodeId);
      result.push(edge.targetNodeId);
      queue.push(edge.targetNodeId);
    }
  }
  return result;
}

function reviewArtifactTargets(node: CanvasNode, histories: GenerationRunView[], limit: number) {
  const currentArtifactIds = currentArtifactIdsForNode(node);
  return histories.flatMap((view) => view.run.status === "succeeded"
    ? view.artifacts
      .filter((artifact) => artifact.kind === node.data?.type && Boolean(artifact.localPath))
      .map((artifact) => ({
        nodeId: node.id,
        runId: view.run.id,
        artifactId: artifact.id,
        current: currentArtifactIds.has(artifact.id),
      }))
    : [])
    // 当前选择优先进入有限的视觉分析预算，随后才是最新的历史版本。
    .sort((left, right) => Number(right.current) - Number(left.current))
    .slice(0, limit)
    .map(({ nodeId, runId, artifactId }) => ({ nodeId, runId, artifactId }));
}

function currentArtifactIdsForNode(node: CanvasNode): Set<string> {
  return new Set([
    ...(node.data?.artifactIds ?? []),
    ...(node.data?.videoSelection?.artifactId ? [node.data.videoSelection.artifactId] : []),
  ]);
}

function artifactReviewKey(nodeId: string, runId: string, artifactId: string): string {
  return `${nodeId}:${runId}:${artifactId}`;
}
