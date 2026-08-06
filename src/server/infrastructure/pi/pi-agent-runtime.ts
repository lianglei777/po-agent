import {
  createAgentSession,
  findCutPoint,
  SessionManager,
  type AgentSession,
  type AgentSessionEvent,
  type SessionEntry,
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
import { createPiResourceLoader } from "./pi-resource-loader";

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
  async create(input: CreateRuntimeInput): Promise<AgentRuntime> {
    const manager = input.sessionFile
      ? SessionManager.open(input.sessionFile)
      : SessionManager.create(input.cwd);
    if (input.requestedSessionId && !input.sessionFile) {
      manager.newSession({ id: input.requestedSessionId });
    }
    const resourceLoader = await createPiResourceLoader({ cwd: input.cwd });
    const customTools = input.customTools?.map(toPiToolDefinition) ?? [];
    const requiredToolNames = customTools.map((tool) => tool.name);
    const selectedToolNames = [
      ...(input.toolNames ?? FULL_BUILTIN_TOOLS),
      ...requiredToolNames,
    ];
    const { session } = await createAgentSession({
      cwd: input.cwd,
      resourceLoader,
      sessionManager: manager,
      tools: [...new Set(selectedToolNames)],
      customTools,
      noTools:
        input.toolNames?.length === 0 && requiredToolNames.length === 0
          ? "all"
          : undefined,
    });
    return new PiAgentRuntime(session, requiredToolNames);
  }
}

export class PiAgentRuntime implements AgentRuntime {
  private alive = true;
  private modelConfigRevision = 0;
  private appliedModelConfigRevision = 0;

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

  async execute<T = unknown>(command: AgentCommand): Promise<T> {
    this.assertAlive();

    switch (command.type) {
      case "prompt":
        await this.refreshModelConfigIfNeeded();
        await this.session.prompt(command.message, {
          images: mapImages(command.images),
        });
        return undefined as T;
      case "abort":
        await this.session.abort();
        return undefined as T;
      case "get_state":
        return (await this.getState()) as T;
      case "set_model": {
        const model = this.session.modelRegistry.find(
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
        await this.session.setModel(model);
        return undefined as T;
      }
      case "fork": {
        const sessionFile =
          this.session.sessionManager.createBranchedSession(command.entryId);
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
      case "compact":
        try {
          if (
            !hasCompactableHistory(
              this.session.sessionManager.getBranch(),
              this.session.settingsManager.getCompactionSettings(),
            )
          ) {
            throw new AppError(
              "COMPACTION_NOT_AVAILABLE",
              "No older context is available to compact",
              409,
            );
          }
          return (await this.session.compact(command.customInstructions)) as T;
        } catch (cause) {
          if (cause instanceof AppError) throw cause;
          // Pi SDK 在上下文已压缩且无新消息时抛出 "Already compacted"
          if (
            cause instanceof Error &&
            /already compacted/i.test(cause.message)
          ) {
            throw new AppError(
              "COMPACTION_NOT_AVAILABLE",
              "Context already compacted",
              409,
            );
          }
          throw cause;
        }
      case "set_auto_compaction":
        this.session.setAutoCompactionEnabled(command.enabled);
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

  async getState(): Promise<AgentRuntimeState> {
    const usage = this.session.getContextUsage();
    return {
      sessionId: this.sessionId,
      sessionFile: this.sessionFile,
      isStreaming: this.session.isStreaming,
      isCompacting: this.session.isCompacting,
      compactionAvailable: hasCompactableHistory(
        this.session.sessionManager.getBranch(),
        this.session.settingsManager.getCompactionSettings(),
      ),
      autoCompactionEnabled: this.session.autoCompactionEnabled,
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
    this.session.modelRegistry.refresh();
    if (currentModel) {
      const refreshedModel = this.session.modelRegistry.find(
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
      await this.session.setModel(refreshedModel);
    }
    this.appliedModelConfigRevision = targetRevision;
  }
}

function toPiToolDefinition(
  definition: AgentToolDefinition,
): ToolDefinition {
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

function hasCompactableHistory(
  entries: SessionEntry[],
  settings: { keepRecentTokens: number },
): boolean {
  if (entries.at(-1)?.type === "compaction") return false;

  const previousCompactionIndex = entries.findLastIndex(
    (entry) => entry.type === "compaction",
  );
  let boundaryStart = 0;
  if (previousCompactionIndex >= 0) {
    const previous = entries[previousCompactionIndex];
    if (previous.type === "compaction") {
      const keptIndex = entries.findIndex(
        (entry) => entry.id === previous.firstKeptEntryId,
      );
      boundaryStart =
        keptIndex >= 0 ? keptIndex : previousCompactionIndex + 1;
    }
  }

  const cutPoint = findCutPoint(
    entries,
    boundaryStart,
    entries.length,
    settings.keepRecentTokens,
  );
  const historyEnd = cutPoint.isSplitTurn
    ? cutPoint.turnStartIndex
    : cutPoint.firstKeptEntryIndex;
  return (
    hasContextMessage(entries, boundaryStart, historyEnd) ||
    (cutPoint.isSplitTurn &&
      hasContextMessage(
        entries,
        cutPoint.turnStartIndex,
        cutPoint.firstKeptEntryIndex,
      ))
  );
}

function hasContextMessage(
  entries: SessionEntry[],
  start: number,
  end: number,
): boolean {
  return entries
    .slice(start, end)
    .some(
      (entry) =>
        entry.type === "message" ||
        entry.type === "custom_message" ||
        entry.type === "branch_summary",
    );
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
    return [
      mapped,
      { type: "agent_error", error: mapped.message.failure },
    ];
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

