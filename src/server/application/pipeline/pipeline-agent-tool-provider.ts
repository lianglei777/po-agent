import type { AgentToolDefinition, AgentToolExecutionContext, AgentToolProvider, AgentToolResult } from "@/server/ports/agent-tool";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { ScriptAnalysisService } from "./script-analysis-service";
import type { StoryboardService } from "./storyboard-service";
import type { AssetGenerationService } from "./asset-generation-service";
import type { VideoGenerationService } from "./video-generation-service";

// PipelineAgentToolProvider — 将 pipeline 操作暴露为 Agent 工具。
// 实现 AgentToolProvider 接口，可注入到 AgentService 让 LLM 通过 tool call 驱动 pipeline。
export class PipelineAgentToolProvider implements AgentToolProvider {
  constructor(
    private readonly scriptService: ScriptAnalysisService,
    private readonly storyboardService: StoryboardService,
    private readonly assetService: AssetGenerationService,
    private readonly videoService: VideoGenerationService,
    private readonly repo: PipelineRepository,
  ) {}

  getTools(): AgentToolDefinition[] {
    return [
      this.analyzeScriptTool(),
      this.extractStoryboardTool(),
      this.generateAssetImageTool(),
      this.generateFrameImageTool(),
      this.generateVideoTool(),
      this.selectFinalTakeTool(),
      this.getPipelineStateTool(),
    ];
  }

  private analyzeScriptTool(): AgentToolDefinition {
    return {
      name: "pipeline_analyze_script",
      label: "剧本分析",
      description: "分析剧本文本，提取角色、场景、道具实体，在画布上创建节点。当用户想要分析剧本、提取角色或场景时调用。",
      parameters: {
        type: "object",
        properties: { projectId: { type: "string", description: "Pipeline 项目 ID" } },
        required: ["projectId"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        const assets = await this.scriptService.extractEntities(ctx.input.projectId as string);
        return {
          content: [{ type: "text", text: `已提取 ${assets.length} 个实体（角色/场景/道具），节点已添加到画布` }],
          details: { count: assets.length, assetIds: assets.map((a) => a.id) },
        };
      },
    };
  }

  private extractStoryboardTool(): AgentToolDefinition {
    return {
      name: "pipeline_extract_storyboard",
      label: "分镜提取",
      description: "从剧本生成分镜帧，创建画布节点并连接资产。当用户想要切分分镜、生成镜头列表时调用。",
      parameters: {
        type: "object",
        properties: { projectId: { type: "string", description: "Pipeline 项目 ID" } },
        required: ["projectId"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        const frames = await this.storyboardService.extractFrames(ctx.input.projectId as string);
        return {
          content: [{ type: "text", text: `已提取 ${frames.length} 个分镜帧，节点和连接已添加到画布` }],
          details: { count: frames.length, frameIds: frames.map((f) => f.id) },
        };
      },
    };
  }

  private generateAssetImageTool(): AgentToolDefinition {
    return {
      name: "pipeline_generate_asset_image",
      label: "生成资产图",
      description: "为角色、场景或道具生成参考图。当用户想要生成角色的外观图、场景的环境图时调用。",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Pipeline 项目 ID" },
          assetId: { type: "string", description: "资产 ID" },
        },
        required: ["projectId", "assetId"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        const variant = await this.assetService.generateAssetImage(
          ctx.input.projectId as string, ctx.input.assetId as string, "agent-tool",
        );
        return {
          content: [{ type: "text", text: `已创建资产生成任务，正在处理中。变体 ID: ${variant.id}` }],
          details: { variantId: variant.id, runId: variant.runId },
        };
      },
    };
  }

  private generateFrameImageTool(): AgentToolDefinition {
    return {
      name: "pipeline_generate_frame_image",
      label: "生成分镜图",
      description: "为分镜帧生成图片（image-to-image），使用关联角色的参考图。当用户想要生成某个镜头的画面时调用。",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Pipeline 项目 ID" },
          frameId: { type: "string", description: "分镜帧 ID" },
        },
        required: ["projectId", "frameId"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        const runId = await this.storyboardService.generateFrameImage(
          ctx.input.projectId as string, ctx.input.frameId as string, "agent-tool",
        );
        return {
          content: [{ type: "text", text: `已创建分镜图生成任务，正在处理中。Run ID: ${runId}` }],
          details: { runId },
        };
      },
    };
  }

  private generateVideoTool(): AgentToolDefinition {
    return {
      name: "pipeline_generate_video",
      label: "生成视频",
      description: "为分镜帧生成视频。mode 为 i2v 时用分镜图作为源图生成视频（画面优先）；mode 为 r2v 时用角色参考图直接生成视频（节奏优先）。",
      parameters: {
        type: "object",
        properties: {
          projectId: { type: "string", description: "Pipeline 项目 ID" },
          frameId: { type: "string", description: "分镜帧 ID" },
          mode: { type: "string", description: "生成模式: i2v 或 r2v", enum: ["i2v", "r2v"] },
        },
        required: ["projectId", "frameId", "mode"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        const mode = ctx.input.mode as "i2v" | "r2v";
        const runId = mode === "i2v"
          ? await this.videoService.generateI2V(ctx.input.projectId as string, ctx.input.frameId as string, "agent-tool")
          : await this.videoService.generateR2V(ctx.input.projectId as string, ctx.input.frameId as string, "agent-tool");
        return {
          content: [{ type: "text", text: `已创建视频生成任务（${mode}），正在处理中。Run ID: ${runId}` }],
          details: { runId, mode },
        };
      },
    };
  }

  private selectFinalTakeTool(): AgentToolDefinition {
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
        await this.videoService.selectFinalTake(ctx.input.frameId as string, ctx.input.runId as string);
        return {
          content: [{ type: "text", text: `已将 Run ${ctx.input.runId} 选为分镜 ${ctx.input.frameId} 的最终视频` }],
          details: {},
        };
      },
    };
  }

  private getPipelineStateTool(): AgentToolDefinition {
    return {
      name: "pipeline_get_state",
      label: "获取进度",
      description: "读取当前 pipeline 的阶段进度、资产数量和分镜数量。当用户询问项目状态或你想了解当前进度时调用。",
      parameters: {
        type: "object",
        properties: { projectId: { type: "string", description: "Pipeline 项目 ID" } },
        required: ["projectId"],
      },
      execute: async (ctx: AgentToolExecutionContext): Promise<AgentToolResult> => {
        const projectId = ctx.input.projectId as string;
        const stages = await this.repo.getStageStatuses(projectId);
        const assets = await this.repo.listAssets(projectId);
        const frames = await this.repo.listFrames(projectId);
        return {
          content: [{ type: "text", text: JSON.stringify({ stages, assetCount: assets.length, frameCount: frames.length }) }],
          details: { stages, assetCount: assets.length, frameCount: frames.length },
        };
      },
    };
  }
}
