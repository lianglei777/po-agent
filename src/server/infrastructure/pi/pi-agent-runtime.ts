import {
  createAgentSession,
  type ModelRuntime,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AgentCommand, ImageInput } from "@/server/domain/agent-command";
import { AppError } from "@/server/domain/app-error";
import type { AgentEvent } from "@/server/domain/agent-event";
import type { AgentRuntimeState } from "@/server/domain/agent-state";
import type {
  AgentRuntime,
  AgentRuntimeFactory,
  CreateRuntimeInput,
  ModelConfigInvalidation,
} from "@/server/ports/agent-runtime";
import type { AgentToolDefinition } from "@/server/ports/agent-tool";
import { mapPiMessage } from "./message-mapper";
import {
  createPiResourceLoader,
  getAvailableBuiltinWebToolNames,
} from "./pi-resource-loader";
import { normalizePiModelBaseUrl } from "./pi-model-base-url";

const FULL_BUILTIN_TOOLS = [
  "bash",
  "read",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
];

export class PiAgentRuntimeFactory implements AgentRuntimeFactory {
  constructor(private readonly modelRuntime: Promise<ModelRuntime>) {}

  async create(input: CreateRuntimeInput): Promise<AgentRuntime> {
    const manager = input.sessionFile
      ? SessionManager.open(input.sessionFile)
      : SessionManager.create(
          input.cwd,
          undefined,
          input.requestedSessionId ? { id: input.requestedSessionId } : undefined,
        );
    if (!input.sessionFile) {
      // Pi 会在首个 assistant entry 到达前延迟创建 JSONL。空助手记录仅用于落盘，面板会滤除它，避免新项目首次加载历史接口时找不到会话。
      manager.appendMessage({
        role: "assistant",
        content: [],
        api: "openai-completions",
        provider: "po-agent",
        model: "po-agent-runtime-bootstrap",
        stopReason: "stop",
        usage: emptyUsage(),
        timestamp: Date.now(),
      });
    }
    const resourceLoader = await createPiResourceLoader({ cwd: input.cwd });
    const customTools = input.customTools?.map(toPiToolDefinition) ?? [];
    const requiredToolNames = [
      ...getAvailableBuiltinWebToolNames(resourceLoader),
      ...customTools.map((tool) => tool.name),
    ];
    const selectedToolNames = [
      ...(input.toolNames ?? FULL_BUILTIN_TOOLS),
      ...requiredToolNames,
    ];
    const modelRuntime = await this.modelRuntime;
    const { session } = await createAgentSession({
      cwd: input.cwd,
      resourceLoader,
      sessionManager: manager,
      modelRuntime,
      tools: [...new Set(selectedToolNames)],
      customTools,
      noTools:
        input.toolNames?.length === 0 && requiredToolNames.length === 0
          ? "all"
          : undefined,
    });
    if (session.model) {
      await session.setModel(normalizePiModelBaseUrl(session.model));
    }
    return new PiAgentRuntime(session, requiredToolNames);
  }
}

export class PiAgentRuntime implements AgentRuntime {
  private alive = true;
  private modelConfigRevision = 0;
  private appliedModelConfigRevision = 0;
  private webAccessConfigRevision = 0;
  private appliedWebAccessConfigRevision = 0;

  constructor(
    private readonly session: AgentSession,
    private readonly requiredToolNames: string[] = [],
  ) {}

  get sessionId(): string {
    return this.session.sessionId;
  }

  get sessionFile(): string {
    return this.session.sessionFile ?? "";
  }

  isAlive(): boolean {
    return this.alive;
  }

  invalidateModelConfig(invalidation: ModelConfigInvalidation): void {
    if (!matchesCurrentModel(this.session, invalidation)) return;
    this.modelConfigRevision += 1;
  }

  invalidateWebAccessConfig(): void {
    this.webAccessConfigRevision += 1;
  }

  async reloadAgentSettings(): Promise<void> {
    await this.session.settingsManager.reload();
  }

  async execute<T = unknown>(command: AgentCommand): Promise<T> {
    this.assertAlive();

    switch (command.type) {
      case "record_user_turn": {
        const alreadyRecorded = this.session.sessionManager.getBranch().some(
          (entry) =>
            entry.type === "custom_message" &&
            entry.customType === "po-agent-generation-turn" &&
            isGenerationTurnDetails(entry.details, command.turnId),
        );
        if (alreadyRecorded) return undefined as T;
        // 附件引用只作为可信展示元数据持久化；生成 Worker 会从 Run 输入读取素材，不把本地路径交给聊天模型。
        this.session.sessionManager.appendCustomMessageEntry(
          "po-agent-generation-turn",
          command.generationContext ?? "",
          false,
          { turnId: command.turnId, assets: command.assets },
        );
        this.session.sessionManager.appendMessage({
          role: "user",
          content: [{ type: "text", text: command.message }],
          timestamp: Date.now(),
        });
        // 标准 assistant tool call 既让纯生成会话立即落盘，也让刷新和后续模型上下文保留真实执行语义。
        this.session.sessionManager.appendMessage({
          role: "assistant",
          content: [{
            type: "toolCall",
            id: generationWorkflowToolCallId(command.turnId),
            name: command.plan.toolName,
            arguments: {
              prompt: command.plan.prompt,
              routeId: command.plan.routeId,
              parameters: command.plan.parameters,
            },
          }],
          api: this.session.model?.api ?? "openai-completions",
          provider: this.session.model?.provider ?? "po-agent",
          model: this.session.model?.id ?? "content-generation-workflow",
          stopReason: "toolUse",
          usage: emptyUsage(),
          timestamp: Date.now(),
        });
        return undefined as T;
      }
      case "record_generation_turn_result": {
        const toolCallId = generationWorkflowToolCallId(command.turnId);
        const alreadyRecorded = this.session.sessionManager.getBranch().some(
          (entry) =>
            entry.type === "message" &&
            entry.message.role === "toolResult" &&
            entry.message.toolCallId === toolCallId &&
            sameGenerationResult(entry.message.details, command.result.details),
        );
        if (alreadyRecorded) return undefined as T;
        this.session.sessionManager.appendMessage({
          role: "toolResult",
          toolCallId,
          toolName: command.toolName,
          content: command.result.content,
          details: command.result.details,
          isError: command.result.isError,
          timestamp: Date.now(),
        });
        return undefined as T;
      }
      case "prompt":
        await this.refreshWebAccessConfigIfNeeded();
        await this.refreshModelConfigIfNeeded();
        if (command.generationContext) {
          const latestContext = [...this.session.sessionManager.getBranch()]
            .reverse()
            .find((entry) =>
              entry.type === "custom_message" &&
              entry.customType === "po-agent-generation-context"
            );
          if (
            command.generation ||
            latestContext?.type !== "custom_message" ||
            latestContext.content !== command.generationContext
          ) {
            // 每个生成回合都要保留素材呈现元数据；仅普通历史快照允许去重，避免后续追问不断堆叠上下文。
            this.session.sessionManager.appendCustomMessageEntry(
              "po-agent-generation-context",
              command.generationContext,
              false,
              (command.generation?.assets.length || command.generationContextAssets?.length)
                ? { assets: command.generation?.assets ?? command.generationContextAssets }
                : undefined,
            );
          }
        }
        await this.promptWithGenerationPlan(command);
        return undefined as T;
      case "abort":
        await this.session.abort();
        return undefined as T;
      case "get_state":
        return (await this.getState()) as T;
      case "set_model": {
        const model = this.session.modelRuntime.getModel(
          command.provider,
          command.modelId,
        );
        if (!model) {
          throw new AppError(
            "MODEL_NOT_FOUND",
            `Model ${command.provider}/${command.modelId} was not found`,
            404,
          );
        }
        await this.session.setModel(normalizePiModelBaseUrl(model));
        return undefined as T;
      }
      case "fork": {
        const sessionFile = this.session.sessionManager.createBranchedSession(
          command.entryId,
        );
        if (!sessionFile) {
          throw new AppError(
            "SESSION_NOT_FOUND",
            `Entry ${command.entryId} could not be forked`,
            404,
          );
        }
        const manager = SessionManager.open(sessionFile);
        return {
          sessionId: manager.getSessionId(),
          sessionFile,
        } as T;
      }
      case "navigate_tree":
        return (await this.session.navigateTree(command.targetId)) as T;
      case "set_thinking_level":
        if (command.level !== "auto") {
          this.session.setThinkingLevel(command.level);
        }
        return undefined as T;
      case "steer":
        await this.session.steer(command.message, mapImages(command.images));
        return undefined as T;
      case "follow_up":
        await this.session.followUp(command.message, mapImages(command.images));
        return undefined as T;
      case "get_tools":
        return {
          active: this.session.getActiveToolNames(),
          available: this.session.getAllTools(),
        } as T;
      case "set_tools":
        this.session.setActiveToolsByName([
          ...new Set([...command.toolNames, ...this.requiredToolNames]),
        ]);
        return undefined as T;
      case "abort_compaction":
        this.session.abortCompaction();
        return undefined as T;
      case "set_auto_retry":
        this.session.setAutoRetryEnabled(command.enabled);
        return undefined as T;
      case "reload_instructions": {
        // 繁忙守卫：流式输出或压缩进行中时拒绝重载
        if (this.session.isStreaming || this.session.isCompacting) {
          throw new AppError(
            "AGENT_BUSY",
            "Cannot reload instructions while the agent is streaming or compacting",
            409,
          );
        }
        try {
          await this.session.reload();
        } catch (cause) {
          throw new AppError(
            "INSTRUCTION_RELOAD_FAILED",
            cause instanceof Error
              ? cause.message
              : "Failed to reload instructions",
            500,
          );
        }
        return (await this.getState()) as T;
      }
      default:
        throw new AppError(
          "UNSUPPORTED_COMMAND",
          "Unsupported agent command",
          400,
        );
    }
  }

  private async promptWithGenerationPlan(
    command: Extract<AgentCommand, { type: "prompt" }>,
  ): Promise<void> {
    const toolName = command.generation?.plan?.toolName;
    if (!toolName) {
      await this.session.prompt(command.message, { images: mapImages(command.images) });
      return;
    }

    const activeToolNames = this.session.getActiveToolNames();
    const originalStream = this.session.agent.streamFunction;
    let firstProviderRequest = true;
    // planner 已确认生成后，首个模型请求只允许并强制调用目标工具；工具结果后的最终回复恢复自动选择。
    this.session.setActiveToolsByName([toolName]);
    this.session.agent.streamFunction = (model, context, options) => {
      const forceTool = firstProviderRequest;
      firstProviderRequest = false;
      const generationOptions = {
        ...options,
        // 同一工具回合必须保持推理模式一致，否则部分代理要求补传首轮并不存在的 reasoning_content。
        reasoning: undefined,
      };
      const forcedOptions = {
        ...generationOptions,
        toolChoice: model.api === "anthropic-messages" ||
            model.api === "bedrock-converse-stream" ||
            model.api === "google-generative-ai" ||
            model.api === "google-vertex"
          ? "any" as const
          : "required" as const,
      } as NonNullable<typeof options> & { toolChoice: "any" | "required" };
      return originalStream(
        model,
        context,
        forceTool ? forcedOptions : generationOptions,
      );
    };
    try {
      await this.session.prompt(command.message, { images: mapImages(command.images) });
    } finally {
      this.session.agent.streamFunction = originalStream;
      this.session.setActiveToolsByName(activeToolNames);
    }
  }

  private async refreshWebAccessConfigIfNeeded(): Promise<void> {
    if (this.appliedWebAccessConfigRevision === this.webAccessConfigRevision) {
      return;
    }
    await this.session.reload();
    this.appliedWebAccessConfigRevision = this.webAccessConfigRevision;
  }

  async getState(): Promise<AgentRuntimeState> {
    const usage = this.session.getContextUsage();
    return {
      sessionId: this.sessionId,
      sessionFile: this.sessionFile,
      isStreaming: this.session.isStreaming,
      isCompacting: this.session.isCompacting,
      autoRetryEnabled: this.session.autoRetryEnabled,
      model: this.session.model
        ? {
            id: this.session.model.id,
            provider: this.session.model.provider,
          }
        : undefined,
      contextUsage: usage
        ? {
            percent: usage.percent,
            contextWindow: usage.contextWindow,
            tokens: usage.tokens,
          }
        : null,
      systemPrompt: this.session.systemPrompt,
      thinkingLevel: this.session.thinkingLevel,
    };
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.assertAlive();
    return this.session.subscribe((event) => {
      for (const mapped of mapEvents(event)) listener(mapped);
    });
  }

  destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.session.dispose();
  }

  private assertAlive(): void {
    if (!this.alive) {
      throw new AppError(
        "INTERNAL_ERROR",
        `Runtime ${this.sessionId} has been destroyed`,
        409,
      );
    }
  }

  private async refreshModelConfigIfNeeded(): Promise<void> {
    if (this.appliedModelConfigRevision === this.modelConfigRevision) return;

    const targetRevision = this.modelConfigRevision;
    const currentModel = this.session.model;
    const result = await this.session.modelRuntime.refresh({
      allowNetwork: false,
    });
    if (result.aborted || result.errors.size > 0) {
      const details = [...result.errors.entries()].map(
        ([provider, error]) => `${provider}: ${error.message}`,
      );
      throw new AppError(
        "INTERNAL_ERROR",
        result.aborted
          ? "Model config refresh was aborted"
          : `Model config refresh failed: ${details.join("; ")}`,
        500,
      );
    }
    // 仅在刷新完整成功后提交 revision；失败时下一次 Prompt 必须继续重试。
    if (currentModel) {
      const refreshedModel = this.session.modelRuntime.getModel(
        currentModel.provider,
        currentModel.id,
      );
      if (!refreshedModel) {
        throw new AppError(
          "MODEL_NOT_FOUND",
          `Model ${currentModel.provider}/${currentModel.id} was not found after refreshing model config`,
          404,
        );
      }
      await this.session.setModel(normalizePiModelBaseUrl(refreshedModel));
    }
    this.appliedModelConfigRevision = targetRevision;
  }
}

function isGenerationTurnDetails(value: unknown, turnId: string): boolean {
  return Boolean(
    value &&
    typeof value === "object" &&
    "turnId" in value &&
    value.turnId === turnId,
  );
}

function generationWorkflowToolCallId(turnId: string): string {
  return `chat-workflow:${turnId}`;
}

function sameGenerationResult(previous: unknown, next: unknown): boolean {
  const previousRunId = generationRunId(previous);
  const nextRunId = generationRunId(next);
  if (previousRunId || nextRunId) return previousRunId === nextRunId;
  return JSON.stringify(previous) === JSON.stringify(next);
}

function generationRunId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("runId" in value)) return undefined;
  return typeof value.runId === "string" ? value.runId : undefined;
}

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function toPiToolDefinition(definition: AgentToolDefinition): ToolDefinition {
  return {
    name: definition.name,
    label: definition.label,
    description: definition.description,
    promptSnippet: definition.promptSnippet,
    promptGuidelines: definition.promptGuidelines,
    parameters: Type.Unsafe<Record<string, unknown>>(definition.parameters),
    execute: async (toolCallId, params, signal, onUpdate) =>
      definition.execute({
        toolCallId,
        input: params as Record<string, unknown>,
        signal,
        onUpdate,
      }),
  };
}

function matchesCurrentModel(
  session: AgentSession,
  invalidation: ModelConfigInvalidation,
): boolean {
  if (invalidation.scope === "all") return true;
  const model = session.model;
  if (!model) return false;
  return invalidation.targets.some(
    (target) =>
      target.provider === model.provider &&
      (target.modelId === undefined || target.modelId === model.id),
  );
}

function mapImages(images?: ImageInput[]) {
  return images?.map((image) => ({
    type: "image" as const,
    data: image.data,
    mimeType: image.mimeType,
  }));
}

export function mapEvents(event: AgentSessionEvent): AgentEvent[] {
  const mapped = mapEvent(event);
  if (!mapped) return [];
  if (
    mapped.type === "message_end" &&
    mapped.message.role === "assistant" &&
    mapped.message.failure
  ) {
    return [mapped, { type: "agent_error", error: mapped.message.failure }];
  }
  return [mapped];
}

function mapEvent(event: AgentSessionEvent): AgentEvent | null {
  switch (event.type) {
    case "agent_start":
      return { type: "agent_start" };
    case "agent_end":
      return { type: "agent_end" };
    case "message_start": {
      const message = mapPiMessage(event.message);
      return message.role === "assistant"
        ? { type: "message_start", message }
        : null;
    }
    case "message_update": {
      const message = mapPiMessage(event.message);
      return message.role === "assistant"
        ? { type: "message_update", message }
        : null;
    }
    case "message_end":
      return { type: "message_end", message: mapPiMessage(event.message) };
    case "tool_execution_start":
      return {
        type: "tool_execution_start",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
      };
    case "tool_execution_update":
      return {
        type: "tool_execution_update",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        content: event.partialResult.content ?? [],
        details: event.partialResult.details,
      };
    case "tool_execution_end":
      return {
        type: "tool_execution_end",
        toolCallId: event.toolCallId,
        isError: event.isError,
      };
    case "auto_retry_start":
      return {
        type: "retry_start",
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
        errorMessage: event.errorMessage,
      };
    case "auto_retry_end":
      return { type: "retry_end" };
    case "compaction_start":
      return { type: "compaction_start" };
    case "compaction_end":
      return {
        type: "compaction_end",
        aborted: event.aborted,
        errorMessage: event.errorMessage,
      };
    default:
      return null;
  }
}
