import type {
  AgentTurnRequest,
  AgentTurnResponse,
} from "@/contracts/agent";
import { AppError } from "@/server/domain/app-error";
import type { AgentService } from "./agent-service";
import type { GenerationTurnPlanningService } from "./content-generation/generation-turn-planning-service";
import { generationRouteDto } from "./content-generation/generation-turn-planning-service";
import type { GenerationRunService } from "./content-generation/generation-run-service";
import type { GenerationTurnExecutor } from "./content-generation/generation-turn-executor";
import type { GenerationRunView } from "./content-generation/generation-run-service";
import { generationToolResult } from "./content-generation/generation-tool-result";

export type ChatTurnResult =
  | Exclude<AgentTurnResponse, { type: "accepted"; intent: "generation" }>
  | (Omit<
      Extract<AgentTurnResponse, { type: "accepted"; intent: "generation" }>,
      "run"
    > & { run: GenerationRunView });

const ACTIVE_GENERATION_STATUSES = new Set([
  "awaiting_confirmation",
  "queued",
  "running",
  "cancel_requested",
]);

export class ChatTurnService {
  private readonly activeTurns = new Set<string>();

  constructor(
    private readonly agents: AgentService,
    private readonly planner: GenerationTurnPlanningService,
    private readonly runs: GenerationRunService,
    private readonly generationExecutor: GenerationTurnExecutor,
  ) {}

  async submit(sessionId: string, input: AgentTurnRequest): Promise<ChatTurnResult> {
    if (this.activeTurns.has(sessionId)) {
      throw new AppError("AGENT_BUSY", "The Agent is already processing a turn", 409);
    }
    // 在任何异步状态读取前占位，封闭两个并发 Turn 同时通过检查的窗口。
    this.activeTurns.add(sessionId);
    try {
      return await this.submitReserved(sessionId, input);
    } finally {
      this.activeTurns.delete(sessionId);
    }
  }

  private async submitReserved(
    sessionId: string,
    input: AgentTurnRequest,
  ): Promise<ChatTurnResult> {
    const state = await this.agents.getState(sessionId);
    if (state.isStreaming || state.isCompacting) {
      throw new AppError("AGENT_BUSY", "The Agent is already processing a turn", 409);
    }
    const recentRuns = await this.runs.listRunsForContext(sessionId);
    const generationInput = input.generation;
    const existingTurn = generationInput
      ? recentRuns.find(({ run }) =>
          run.source === "chat-workflow" && run.sourceRef === input.turnId
        )
      : undefined;
    if (existingTurn && generationInput) {
      if (
        existingTurn.run.input.originalPrompt !== input.message ||
        (generationInput.mode.type === "generation-route" &&
          generationInput.mode.routeId !== existingTurn.run.routeId)
      ) {
        throw new AppError(
          "GENERATION_IDEMPOTENCY_CONFLICT",
          "The turnId is already associated with a different generation request",
          409,
        );
      }
      const route = await this.runs.getRoute(existingTurn.run.routeId);
      if (!route) {
        throw new AppError(
          "GENERATION_ROUTE_NOT_FOUND",
          `Generation route ${existingTurn.run.routeId} was not found`,
          404,
        );
      }
      // 网络重试应恢复同一持久化事实，不重复调用 Planner、创建 Run 或追加会话消息。
      return {
        type: "accepted",
        intent: "generation",
        run: existingTurn,
        route: generationRouteDto(route),
        effectivePrompt: existingTurn.run.prompt,
        parameters: existingTurn.run.input.parameters ?? {},
      };
    }
    if (recentRuns.some(({ run }) => ACTIVE_GENERATION_STATUSES.has(run.status))) {
      throw new AppError(
        "GENERATION_RUN_ACTIVE",
        "Wait for or cancel the active generation run before sending another turn",
        409,
      );
    }
    if (!input.generation) {
      await this.agents.execute(sessionId, {
        type: "prompt",
        message: input.message,
        images: input.images,
      });
      return { type: "accepted", intent: "chat" };
    }

    if (!state.model) {
      throw new AppError(
        "MODEL_NOT_FOUND",
        "A chat model must be selected before planning content generation",
        409,
      );
    }
    const planned = await this.planner.plan({
      sessionId,
      message: input.message,
      model: { provider: state.model.provider, modelId: state.model.id },
      mode: input.generation.mode,
      assets: input.generation.assets.map(({ mediaType, mimeType }) => ({
        mediaType,
        mimeType,
      })),
    });
    if (planned.type === "clarification" || planned.type === "invalid") {
      return planned;
    }
    if (planned.type === "chat") {
      // Planner 判定为普通对话后，不再向 Agent 暴露本轮生成授权。
      await this.agents.execute(sessionId, {
        type: "prompt",
        message: input.message,
        images: input.images,
        ...(input.generation.assets.length
          ? { generationContextAssets: input.generation.assets }
          : {}),
      });
      return { type: "accepted", intent: "chat" };
    }
    if (planned.type === "attachment-understanding") {
      if (!input.images?.length) {
        return {
          type: "clarification",
          reason: "MODEL_ATTACHMENT_UNSUPPORTED",
          question: "The selected chat model cannot inspect the attached media. Choose a vision-capable model or describe the asset in text.",
        };
      }
      await this.agents.execute(sessionId, {
        type: "prompt",
        message: input.message,
        images: input.images,
        generationContextAssets: input.generation.assets,
      });
      return { type: "accepted", intent: "attachment-understanding" };
    }

    const plan = {
      toolName: planned.route.capability.endsWith("-video")
        ? "generate_video" as const
        : "generate_image" as const,
      routeId: planned.route.id,
      prompt: planned.effectivePrompt,
      parameters: planned.parameters,
    };
    await this.agents.recordGenerationTurn(sessionId, {
      turnId: input.turnId,
      message: input.message,
      assets: input.generation.assets,
      plan,
    });
    let view: GenerationRunView;
    try {
      view = await this.generationExecutor.execute({
        sessionId,
        turnId: input.turnId,
        originalPrompt: input.message,
        reviewFirst: input.generation.reviewFirst,
        assets: input.generation.assets,
        plan,
      });
    } catch (error) {
      // 即使 Run 创建前失败，也闭合工具调用，避免会话刷新后永久显示为“执行中”。
      await this.agents.recordGenerationTurnResult(sessionId, {
        turnId: input.turnId,
        toolName: plan.toolName,
        result: {
          content: [{
            type: "text",
            text: error instanceof Error ? error.message : "Content generation failed",
          }],
          details: {
            error: {
              code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
              message: error instanceof Error
                ? error.message
                : "Content generation failed",
            },
          },
          isError: true,
        },
      });
      throw error;
    }
    const result = generationToolResult(view, { route: planned.route });
    await this.agents.recordGenerationTurnResult(sessionId, {
      turnId: input.turnId,
      toolName: plan.toolName,
      result: { ...result, isError: view.run.status === "failed" },
    });
    return {
      type: "accepted",
      intent: "generation",
      run: view,
      route: planned.route,
      effectivePrompt: planned.effectivePrompt,
      parameters: planned.parameters,
    };
  }

  async getSnapshot(sessionId: string) {
    const [agent, generationRuns] = await Promise.all([
      this.agents.getState(sessionId),
      this.runs.listRunsForContext(sessionId),
    ]);
    return { agent, generationRuns };
  }
}
