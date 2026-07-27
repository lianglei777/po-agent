import { describe, expect, it } from "vitest";
import { createConversationNavigatorEntries } from "./conversation-navigator-adapter";

describe("conversation navigator adapter", () => {
  it("creates one semantic navigation entry per user turn", () => {
    expect(
      createConversationNavigatorEntries({
        entryIds: ["user-1", "assistant-1", "tool-1", "user-2"],
        messages: [
          { role: "user", content: "First request" },
          {
            role: "assistant",
            content: [{ type: "text", text: "First response" }],
            provider: "test",
            model: "test",
          },
          {
            role: "toolResult",
            toolCallId: "tool-1",
            content: [{ type: "text", text: "Tool output" }],
          },
          {
            role: "user",
            content: [{ type: "text", text: "Second\nrequest" }],
          },
        ],
      }),
    ).toEqual([
      { id: "user-1", title: "First request" },
      { id: "user-2", title: "Second request" },
    ]);
  });

  it("uses the same fallback identity as the rendered user message", () => {
    expect(
      createConversationNavigatorEntries({
        entryIds: [],
        messages: [
          {
            role: "user",
            clientId: "pending-user",
            content: "Pending request",
          },
          {
            role: "user",
            timestamp: 42,
            content: "Persisted request",
          },
        ],
      }),
    ).toEqual([
      { id: "pending-user", title: "Pending request" },
      { id: "user-42-1", title: "Persisted request" },
    ]);
  });
});
