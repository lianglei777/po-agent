import type {
  AgentMessage,
  AssistantMessage,
  TextContent,
  UserMessage,
} from "../agent-types";

const TITLE_LIMIT = 140;
const SUMMARY_LIMIT = 240;

export type ConversationNavigatorEntry = {
  id: string;
  title: string;
  summary: string;
};

export function createConversationNavigatorEntries({
  entryIds,
  messages,
  streamingMessage,
}: {
  entryIds: string[];
  messages: AgentMessage[];
  streamingMessage?: Partial<AssistantMessage> | null;
}): ConversationNavigatorEntry[] {
  return messages.flatMap((message, index) => {
    if (message.role !== "user") return [];
    const title = normalizePreview(userText(message), TITLE_LIMIT);
    if (!title) return [];

    const responseParts: string[] = [];
    for (
      let nextIndex = index + 1;
      nextIndex < messages.length;
      nextIndex += 1
    ) {
      const nextMessage = messages[nextIndex];
      if (!nextMessage || nextMessage.role === "user") break;
      if (nextMessage.role === "assistant") {
        const text = assistantText(nextMessage);
        if (text) responseParts.push(text);
      }
    }
    const isLastUser = !messages
      .slice(index + 1)
      .some((candidate) => candidate.role === "user");
    if (isLastUser && streamingMessage) {
      const streamingText = assistantText(streamingMessage);
      if (streamingText) responseParts.push(streamingText);
    }

    return [
      {
        id:
          entryIds[index] ??
          message.clientId ??
          `user-${message.timestamp ?? "untimed"}-${index}`,
        summary: normalizePreview(responseParts.join(" "), SUMMARY_LIMIT),
        title,
      },
    ];
  });
}

function userText(message: UserMessage) {
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter(
      (block): block is TextContent =>
        block.type === "text" && Boolean(block.text),
    )
    .map((block) => block.text)
    .join("\n");
}

function assistantText(message: Partial<AssistantMessage>) {
  return (message.content ?? [])
    .filter(
      (block): block is TextContent =>
        block.type === "text" && Boolean(block.text),
    )
    .map((block) => block.text)
    .join("\n");
}

function normalizePreview(value: string, limit: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}
