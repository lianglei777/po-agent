import type {
  GenerationRouteDto,
  GenerationRunViewDto,
  GenerationToolDetails,
} from "@/contracts/generation";
import type {
  AgentMessage,
  AssistantMessage,
  ToolResultMessage,
  UserMessage,
} from "./agent-types";
import {
  generationDetailsWithView,
  generationToolDetails,
} from "./generation-tool-presentation";

const WORKFLOW_ACK = "Content generation workflow accepted this request.";

export function projectChatWorkflowRuns(input: {
  messages: AgentMessage[];
  entryIds: string[];
  runs: GenerationRunViewDto[];
  routes: GenerationRouteDto[];
  model?: { provider: string; id: string };
}) {
  const messages: AgentMessage[] = [];
  const entryIds: string[] = [];
  input.messages.forEach((message, index) => {
    if (isLegacyWorkflowAcknowledgement(message)) return;
    messages.push(message);
    entryIds.push(input.entryIds[index] ?? "");
  });

  const referencedRunIds = new Set(
    messages.flatMap((message) => {
      if (message.role !== "toolResult") return [];
      const details = generationToolDetails(message.details);
      return details ? [details.runId] : [];
    }),
  );
  const turnUserIndexes = workflowTurnUserIndexes(messages);
  const additions = new Map<number, AgentMessage[]>();

  for (const view of input.runs) {
    if (view.run.source !== "chat-workflow" || referencedRunIds.has(view.run.id)) {
      continue;
    }
    const userIndex = findWorkflowUserIndex(
      messages,
      turnUserIndexes,
      view,
    );
    const insertionIndex = userIndex ?? messages.length - 1;
    const current = additions.get(insertionIndex) ?? [];
    current.push(...workflowAssistantMessages(view, input.routes, input.model));
    additions.set(insertionIndex, current);
  }

  const projectedMessages: AgentMessage[] = [];
  const projectedEntryIds: string[] = [];
  messages.forEach((message, index) => {
    projectedMessages.push(message);
    projectedEntryIds.push(entryIds[index] ?? "");
    for (const addition of additions.get(index) ?? []) {
      projectedMessages.push(addition);
      // 合成的工作流步骤不是 Pi 树节点，不能暴露编辑或分支操作。
      projectedEntryIds.push("");
    }
  });
  if (messages.length === 0) {
    for (const addition of additions.get(-1) ?? []) {
      projectedMessages.push(addition);
      projectedEntryIds.push("");
    }
  }
  return { messages: projectedMessages, entryIds: projectedEntryIds };
}

function workflowTurnUserIndexes(messages: AgentMessage[]) {
  const result = new Map<string, number>();
  let pendingTurnId: string | undefined;
  messages.forEach((message, index) => {
    if (
      message.role === "custom" &&
      message.customType === "po-agent-generation-turn"
    ) {
      pendingTurnId = turnIdFromDetails(message.details);
      return;
    }
    if (message.role === "user") {
      if (pendingTurnId) result.set(pendingTurnId, index);
      pendingTurnId = undefined;
    }
  });
  return result;
}

function findWorkflowUserIndex(
  messages: AgentMessage[],
  turnUserIndexes: Map<string, number>,
  view: GenerationRunViewDto,
) {
  const sourceRef = view.run.sourceRef;
  if (sourceRef) {
    const persisted = turnUserIndexes.get(sourceRef);
    if (persisted !== undefined) return persisted;
    const optimistic = messages.findIndex(
      (message) => message.role === "user" && message.clientId === sourceRef,
    );
    if (optimistic >= 0) return optimistic;
  }
  const originalPrompt = view.run.input.originalPrompt;
  if (!originalPrompt) return undefined;
  const candidates = messages.flatMap((message, index) =>
    message.role === "user" && userMessageText(message) === originalPrompt
      ? [index]
      : [],
  );
  return candidates.at(-1);
}

function workflowAssistantMessages(
  view: GenerationRunViewDto,
  routes: GenerationRouteDto[],
  model?: { provider: string; id: string },
): [AssistantMessage, ToolResultMessage] {
  const toolCallId = `chat-workflow:${view.run.sourceRef ?? view.run.id}`;
  const toolName = view.run.capability.endsWith("-video")
    ? "generate_video"
    : "generate_image";
  const route = routes.find((candidate) => candidate.id === view.run.routeId);
  const baseDetails: GenerationToolDetails = {
    runId: view.run.id,
    routeId: view.run.routeId,
    status: view.run.status,
    phase: "queued",
    artifacts: [],
    ...(view.run.status === "awaiting_confirmation" && route
      ? { review: { route, input: view.run.input } }
      : {}),
  };
  const details = generationDetailsWithView(baseDetails, view);
  const timestamp = Date.parse(view.run.createdAt);
  return [
    {
      role: "assistant",
      provider: model?.provider ?? "po-agent",
      model: model?.id ?? "content-generation-workflow",
      stopReason: "toolUse",
      timestamp,
      content: [{
        type: "toolCall",
        toolCallId,
        toolName,
        input: {
          prompt: view.run.prompt,
          routeId: view.run.routeId,
          parameters: view.run.input.parameters ?? {},
          assets: view.run.input.assets ?? [],
        },
      }],
    },
    {
      role: "toolResult",
      toolCallId,
      toolName,
      timestamp,
      content: [{
        type: "text",
        text: `Generation run ${view.run.id} is ${view.run.status}.`,
      }],
      details,
      isError: view.run.status === "failed",
    },
  ];
}

function isLegacyWorkflowAcknowledgement(message: AgentMessage) {
  return message.role === "assistant" &&
    message.provider === "po-agent" &&
    message.model === "content-generation-workflow" &&
    message.content.length === 1 &&
    message.content[0]?.type === "text" &&
    message.content[0].text === WORKFLOW_ACK;
}

function turnIdFromDetails(details: unknown) {
  if (!details || typeof details !== "object" || !("turnId" in details)) {
    return undefined;
  }
  return typeof details.turnId === "string" ? details.turnId : undefined;
}

function userMessageText(message: UserMessage) {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}
