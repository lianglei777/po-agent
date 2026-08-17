import type {
  AgentGenerationAsset,
  AgentMessage,
  AssistantMessage,
  ImageContent,
  TextContent,
  ThinkingContent,
  ToolCallContent,
  ToolResultMessage,
  UserMessage,
} from "./agent-types";

type AssistantContent =
  | TextContent
  | ImageContent
  | ThinkingContent
  | ToolCallContent;

export type UserPresentationItem = {
  kind: "user";
  entryId?: string;
  message: UserMessage;
  originalIndex: number;
};

export type AssistantTurnPresentationItem = {
  kind: "assistantTurn";
  entryIds: string[];
  messages: AssistantMessage[];
  originalIndexes: number[];
  streaming: boolean;
};

export type MessagePresentationItem =
  | UserPresentationItem
  | AssistantTurnPresentationItem;

export type AssistantTurnBlock = {
  block: AssistantContent;
  message: AssistantMessage;
  messageIndex: number;
  repeatCount?: number;
};

export type FinalAssistantTurnBlock = AssistantTurnBlock & {
  block: TextContent | ImageContent;
};

export type ExecutionProcessState = {
  completedCount: number;
  errorCount: number;
  runningCount: number;
  state: "completed" | "running";
  stepCount: number;
};

export function buildMessagePresentation(
  messages: AgentMessage[],
  entryIds: string[],
  streamingMessage?: Partial<AssistantMessage> | null,
): MessagePresentationItem[] {
  const items: MessagePresentationItem[] = [];
  let activeTurn: AssistantTurnPresentationItem | null = null;
  let pendingGenerationAssets: AgentGenerationAsset[] | undefined;

  messages.forEach((message, index) => {
    const entryId = entryIds[index];
    if (
      message.role === "custom" &&
      (message.customType === "po-agent-generation-context" ||
        message.customType === "po-agent-generation-turn")
    ) {
      pendingGenerationAssets = generationAssetsFromDetails(message.details);
      return;
    }
    if (message.role === "user") {
      activeTurn = null;
      items.push({
        kind: "user",
        entryId,
        message: pendingGenerationAssets?.length
          ? { ...message, generationAssets: pendingGenerationAssets }
          : message,
        originalIndex: index,
      });
      pendingGenerationAssets = undefined;
      return;
    }
    if (message.role === "compactionSummary") {
      activeTurn = null;
      return;
    }
    if (message.role !== "assistant") return;
    // 该内部确认消息只用于触发 Pi 会话落盘，生成 Run 卡片才是用户可见结果。
    if (
      message.provider === "po-agent" &&
      message.model === "content-generation-workflow" &&
      message.content.length === 1 &&
      message.content[0]?.type === "text" &&
      message.content[0].text === "Content generation workflow accepted this request."
    ) return;

    if (!activeTurn) {
      activeTurn = {
        kind: "assistantTurn",
        entryIds: [],
        messages: [],
        originalIndexes: [],
        streaming: false,
      };
      items.push(activeTurn);
    }
    activeTurn.messages.push(message);
    activeTurn.originalIndexes.push(index);
    if (entryId) activeTurn.entryIds.push(entryId);
  });

  if (streamingMessage) {
    const normalized = completeAssistantMessage(streamingMessage);
    const last = items.at(-1);
    const turn =
      last?.kind === "assistantTurn"
        ? last
        : {
            kind: "assistantTurn" as const,
            entryIds: [],
            messages: [],
            originalIndexes: [],
            streaming: false,
          };
    if (last !== turn) items.push(turn);
    turn.messages.push(normalized);
    turn.originalIndexes.push(messages.length);
    turn.streaming = true;
  }

  return items;
}

function generationAssetsFromDetails(
  details: unknown,
): AgentGenerationAsset[] | undefined {
  if (!details || typeof details !== "object" || !("assets" in details)) {
    return undefined;
  }
  const { assets } = details as { assets?: unknown };
  if (!Array.isArray(assets)) return undefined;
  return assets.filter((asset): asset is AgentGenerationAsset => {
    if (!asset || typeof asset !== "object") return false;
    const value = asset as Partial<AgentGenerationAsset>;
    return (
      typeof value.slot === "string" &&
      typeof value.name === "string" &&
      typeof value.mimeType === "string" &&
      (value.mediaType === "image" ||
        value.mediaType === "video" ||
        value.mediaType === "audio") &&
      typeof value.ref === "object" &&
      value.ref !== null
    );
  });
}

export function partitionAssistantTurn(turn: AssistantTurnPresentationItem) {
  const process: AssistantTurnBlock[] = [];
  const final: FinalAssistantTurnBlock[] = [];

  turn.messages.forEach((message, messageIndex) => {
    const intermediate = message.stopReason === "toolUse";
    message.content.forEach((block) => {
      if (
        intermediate ||
        block.type === "thinking" ||
        block.type === "toolCall"
      ) {
        process.push({ block, message, messageIndex });
      } else {
        final.push({ block, message, messageIndex });
      }
    });
  });

  return { final, process };
}

export function collapseGenerationQueries(process: AssistantTurnBlock[]) {
  const groups = new Map<string, { count: number; lastIndex: number }>();
  process.forEach((step, index) => {
    const key = generationQueryKey(step);
    if (!key) return;
    const previous = groups.get(key);
    groups.set(key, { count: (previous?.count ?? 0) + 1, lastIndex: index });
  });
  return process.flatMap((step, index) => {
    const key = generationQueryKey(step);
    if (!key) return [step];
    const group = groups.get(key)!;
    return group.lastIndex === index
      ? [{ ...step, repeatCount: group.count }]
      : [];
  });
}

function generationQueryKey(step: AssistantTurnBlock) {
  if (step.block.type !== "toolCall" || step.block.toolName !== "get_generation") {
    return null;
  }
  const runId = step.block.input.runId;
  return typeof runId === "string" && runId ? `get_generation:${runId}` : null;
}

export function executionProcessStatus(
  process: AssistantTurnBlock[],
  results: Map<string, ToolResultMessage>,
  streaming: boolean,
): ExecutionProcessState {
  let errorCount = 0;
  let runningCount = 0;

  for (const step of process) {
    if (step.block.type !== "toolCall") continue;
    const result = results.get(step.block.toolCallId);
    if (result?.isError) errorCount += 1;
    else if (!result || isRunningGenerationResult(result.details)) runningCount += 1;
  }

  if (streaming && runningCount === 0 && process.length > 0) {
    runningCount = 1;
  }

  const completedCount = Math.max(
    0,
    process.length - errorCount - runningCount,
  );
  return {
    completedCount,
    errorCount,
    runningCount,
    state: runningCount > 0 ? "running" : "completed",
    stepCount: process.length,
  };
}

function isRunningGenerationResult(details: unknown) {
  if (!details || typeof details !== "object") return false;
  const status = (details as { status?: unknown }).status;
  const runId = (details as { runId?: unknown }).runId;
  return typeof runId === "string" &&
    (status === "queued" || status === "running" || status === "cancel_requested");
}

function completeAssistantMessage(
  message: Partial<AssistantMessage>,
): AssistantMessage {
  return {
    ...message,
    role: "assistant",
    content: message.content ?? [],
    provider: message.provider ?? "",
    model: message.model ?? "",
  };
}
