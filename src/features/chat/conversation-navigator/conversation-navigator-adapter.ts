import type { AgentMessage, TextContent, UserMessage } from "../agent-types";

const PREVIEW_LIMIT = 160;

export type ConversationNavigatorEntry = {
  id: string;
  title: string;
};

export function createConversationNavigatorEntries({
  entryIds,
  messages,
}: {
  entryIds: string[];
  messages: AgentMessage[];
}): ConversationNavigatorEntry[] {
  return messages.flatMap((message, index) => {
    if (message.role !== "user") return [];
    const title = userPreview(message);
    if (!title) return [];
    return [
      {
        id:
          entryIds[index] ??
          message.clientId ??
          `user-${message.timestamp ?? "untimed"}-${index}`,
        title,
      },
    ];
  });
}

function userPreview(message: UserMessage) {
  const text =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter(
            (block): block is TextContent =>
              block.type === "text" && Boolean(block.text),
          )
          .map((block) => block.text)
          .join("\n");

  return text.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LIMIT);
}
