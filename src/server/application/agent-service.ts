import { randomUUID } from "node:crypto";
import type {
  AgentGenerationAsset,
  AgentCommandResponse,
  CreateAgentRequest,
  CreateAgentResponse,
  ForkAgentResponse,
} from "@/contracts/agent";
import type { JsonValue } from "@/contracts/generation";
import type { AgentCommand } from "@/server/domain/agent-command";
import { AppError } from "@/server/domain/app-error";
import type { AgentEvent } from "@/server/domain/agent-event";
import type {
  AgentRuntime,
  AgentRuntimeFactory,
  AgentRuntimeRegistry,
} from "@/server/ports/agent-runtime";
import type { AgentSessionScopeProvider, AgentToolProvider } from "@/server/ports/agent-tool";
import type { AgentPromptContextProvider } from "@/server/ports/agent-prompt-context-provider";
import type { GenerationReviewRegistry } from "@/server/application/content-generation/generation-review-registry";
import type { WorkspaceRootProvider } from "@/server/ports/file-system";
import type { SessionRepository } from "@/server/ports/session-repository";
import type { SessionLifecycleProjector } from "@/server/ports/session-lifecycle-projector";

/**
 * Agent 会话应用服务。
 *
 * 负责协调会话生命周期、命令执行与事件订阅，
 * 是 transport 层与领域/端口之间的用例边界。
 */
export class AgentService {
  private readonly activePrompts = new Set<string>();

  /**
   * @param sessions - 会话持久化仓库
   * @param runtimes - Agent 运行时注册表（缓存与保活）
   * @param runtimeFactory - Agent 运行时工厂
   * @param roots - 工作区根目录提供者
   */
  constructor(
    private readonly sessions: SessionRepository,
    private readonly runtimes: AgentRuntimeRegistry,
    private readonly runtimeFactory: AgentRuntimeFactory,
    private readonly roots: WorkspaceRootProvider,
    private readonly tools?: AgentToolProvider,
    private readonly generationReviews?: GenerationReviewRegistry,
    private readonly promptContextProvider?: AgentPromptContextProvider,
    private readonly sessionLifecycleProjector?: SessionLifecycleProjector,
    private readonly sessionScopeProvider?: AgentSessionScopeProvider,
  ) {}

  /**
   * 创建一个新的 Agent 会话。
   *
   * 注册工作区根目录、启动运行时，并按需配置模型、思考级别和工具。
   *
   * @param input - 创建请求参数
   * @returns 包含新会话 ID 的对象
   */
  async create(
    input: CreateAgentRequest,
    scope: { pipelineProjectId?: string } = {},
  ): Promise<CreateAgentResponse> {
    this.roots.addRoot(input.cwd);
    const requestedSessionId = randomUUID();
    const startKey = `new:${requestedSessionId}`;
    const runtime = await this.runtimes.getOrStart(startKey, () =>
      this.runtimeFactory.create({
        requestedSessionId,
        cwd: input.cwd,
        toolNames: input.toolNames,
        customTools: this.tools?.getTools({
          sessionId: requestedSessionId,
          cwd: input.cwd,
          pipelineProjectId: scope.pipelineProjectId,
        }),
      }),
    );
    try {
      if (input.provider && input.modelId) {
        await runtime.execute({
          type: "set_model",
          provider: input.provider,
          modelId: input.modelId,
        });
      }
      if (input.thinkingLevel) {
        await runtime.execute({
          type: "set_thinking_level",
          level: input.thinkingLevel,
        });
      }
      if (input.toolNames) {
        await runtime.execute({ type: "set_tools", toolNames: input.toolNames });
      }
      await this.sessionLifecycleProjector?.registerCreatedSession({
        sessionId: runtime.sessionId,
        cwd: input.cwd,
        sessionFile: runtime.sessionFile,
        createdAt: new Date().toISOString(),
      });
      return { sessionId: runtime.sessionId };
    } catch (error) {
      // 创建只允许全成或全败；投影失败后不能保留一个其他模块无法识别的 Runtime。
      this.runtimes.destroy(runtime.sessionId);
      throw error;
    }
  }

  /**
   * 向指定会话执行一条 Agent 命令。
   *
   * - prompt 命令会进入后台异步执行，立即返回 accepted。
   * - fork 命令会创建新会话并销毁原运行时。
   * - 其他命令直接同步执行。
   *
   * @param sessionId - 目标会话 ID
   * @param command - 要执行的命令
   * @returns 命令执行结果
   */
  async execute(
    sessionId: string,
    command: AgentCommand,
    options: { trustedPromptContext?: string; onPromptSettled?: () => void } = {},
  ): Promise<AgentCommandResponse> {
    const runtime = await this.getOrRestore(sessionId);
    this.runtimes.touch(sessionId);

    if (command.type === "prompt") {
      if (this.activePrompts.has(sessionId)) {
        throw new AppError(
          "AGENT_BUSY",
          "The Agent is already processing a turn",
          409,
        );
      }
      // Runtime 的 isStreaming 要到异步 Prompt 真正启动后才更新；先占位以封闭并发提交窗口。
      this.activePrompts.add(sessionId);
      const generation = command.generation
        ? { ...command.generation, originalPrompt: command.message }
        : command.generationReview
          ? {
              mode: { type: "generation-auto" } as const,
              reviewFirst: true,
              assets: [],
              originalPrompt: command.message,
            }
          : undefined;
      this.generationReviews?.begin(sessionId, generation);
      let generationContext: string | undefined;
      try {
        generationContext = await this.promptContextProvider?.getPromptContext(
          sessionId,
          generation,
          command.generationContextAssets,
        );
        generationContext = mergePromptContexts(generationContext, options.trustedPromptContext);
      } catch (error) {
        // 上下文构建失败时必须释放本轮策略，避免后续普通对话继承错误的生成授权。
        this.generationReviews?.end(sessionId);
        this.activePrompts.delete(sessionId);
        throw error;
      }
      this.runInBackground(runtime, { ...command, generationContext }, () => {
          this.generationReviews?.end(sessionId);
          this.activePrompts.delete(sessionId);
          options.onPromptSettled?.();
        });
      return { accepted: true };
    }
    if (command.type === "fork") {
      const result = await runtime.execute<ForkAgentResponse>(command);
      this.runtimes.destroy(sessionId);
      return result;
    }
    return (await runtime.execute<AgentCommandResponse | undefined>(command)) ?? {
      success: true,
    };
  }

  /**
   * 获取指定会话的运行时加载状态与当前状态。
   *
   * @param sessionId - 会话 ID
   * @returns 加载状态及状态对象；若未加载则只返回 loaded: false
   */
  async getSnapshot(sessionId: string) {
    const runtime = this.runtimes.get(sessionId);
    return runtime
      ? {
          loaded: true as const,
          state: this.withPendingPrompt(
            sessionId,
            await runtime.getState(),
          ),
        }
      : { loaded: false as const };
  }

  async recordGenerationTurn(
    sessionId: string,
    input: {
      turnId: string;
      message: string;
      assets: AgentGenerationAsset[];
      plan: {
        toolName: "generate_image" | "generate_video";
        routeId: string;
        prompt: string;
        parameters: Record<string, JsonValue>;
      };
    },
  ): Promise<void> {
    const runtime = await this.getOrRestore(sessionId);
    this.runtimes.touch(sessionId);
    if (this.activePrompts.has(sessionId) || (await runtime.getState()).isStreaming) {
      throw new AppError(
        "AGENT_BUSY",
        "The Agent is already processing a turn",
        409,
      );
    }
    const generationContext = await this.promptContextProvider?.getPromptContext(
      sessionId,
      undefined,
      input.assets,
    );
    await runtime.execute({
      type: "record_user_turn",
      turnId: input.turnId,
      message: input.message,
      assets: input.assets,
      plan: input.plan,
      generationContext,
    });
  }

  async recordGenerationTurnResult(
    sessionId: string,
    input: {
      turnId: string;
      toolName: "generate_image" | "generate_video";
      result: {
        content: Array<{ type: "text"; text: string }>;
        details?: unknown;
        isError: boolean;
      };
    },
  ): Promise<void> {
    const runtime = await this.getOrRestore(sessionId);
    this.runtimes.touch(sessionId);
    await runtime.execute({
      type: "record_generation_turn_result",
      ...input,
    });
  }

  async getState(sessionId: string) {
    const runtime = await this.getOrRestore(sessionId);
    this.runtimes.touch(sessionId);
    return this.withPendingPrompt(sessionId, await runtime.getState());
  }

  private withPendingPrompt(
    sessionId: string,
    state: Awaited<ReturnType<AgentRuntime["getState"]>>,
  ) {
    return this.activePrompts.has(sessionId) && !state.isStreaming
      ? { ...state, isStreaming: true }
      : state;
  }

  /**
   * 订阅指定会话的 Agent 事件。
   *
   * 会在订阅期间保持运行时活跃。
   *
   * @param sessionId - 会话 ID
   * @param listener - 事件监听器
   * @returns 取消订阅的清理函数
   */
  async subscribe(
    sessionId: string,
    listener: (event: AgentEvent) => void,
  ): Promise<() => void> {
    const runtime = await this.getOrRestore(sessionId);
    this.runtimes.touch(sessionId);
    return runtime.subscribe((event) => {
      this.runtimes.touch(sessionId);
      listener(event);
    });
  }

  /**
   * 获取内存中的运行时；若不存在则从持久化仓库恢复。
   *
   * @param sessionId - 会话 ID
   * @returns Agent 运行时实例
   * @throws AppError 当会话不存在时抛出 SESSION_NOT_FOUND 错误
   */
  private async getOrRestore(sessionId: string): Promise<AgentRuntime> {
    return this.runtimes.getOrStart(sessionId, async () => {
      const detail = await this.sessions.findById(sessionId);
      if (!detail) {
        throw new AppError(
          "SESSION_NOT_FOUND",
          `Session ${sessionId} was not found`,
          404,
        );
      }
      this.roots.addRoot(detail.info?.cwd ?? process.cwd());
      const pipelineProjectId = await this.sessionScopeProvider?.getPipelineProjectId(sessionId);
      return this.runtimeFactory.create({
        requestedSessionId: sessionId,
        sessionFile: detail.filePath,
        cwd: detail.info?.cwd ?? process.cwd(),
        // 第一批 Pipeline Agent 恢复后仍保持只读工具边界，避免默认内置工具绕过画布用例。
        toolNames: pipelineProjectId ? [] : undefined,
        customTools: this.tools?.getTools({
          sessionId,
          cwd: detail.info?.cwd ?? process.cwd(),
          pipelineProjectId: pipelineProjectId ?? undefined,
        }),
      });
    });
  }

  /**
   * 在后台执行命令，失败时仅记录错误而不向上抛出。
   *
   * 用于 prompt 等非阻塞命令。
   *
   * @param runtime - 当前运行时
   * @param command - 要执行的命令
   */
  private runInBackground(
    runtime: AgentRuntime,
    command: AgentCommand,
    onSettled?: () => void,
  ): void {
    void runtime.execute(command)
      .catch((error) => {
        console.error(`Agent command ${command.type} failed`, error);
      })
      .finally(onSettled);
  }
}

function mergePromptContexts(...contexts: Array<string | undefined>): string | undefined {
  const present = contexts.filter((context): context is string => Boolean(context));
  return present.length ? present.join("\n") : undefined;
}
