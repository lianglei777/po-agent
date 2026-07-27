import { describe, expect, it } from "vitest";
import { createConversationNavigatorEntries } from "./conversation-navigator-adapter";

describe("conversation navigator adapter", () => {
  it("pairs each user title with the following assistant summary", () => {
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
      {
        id: "user-1",
        summary: "First response",
        title: "First request",
      },
      { id: "user-2", summary: "", title: "Second request" },
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
      { id: "pending-user", summary: "", title: "Pending request" },
      { id: "user-42-1", summary: "", title: "Persisted request" },
    ]);
  });

  it("uses streaming assistant text for the latest turn preview", () => {
    expect(
      createConversationNavigatorEntries({
        entryIds: ["latest-user"],
        messages: [{ role: "user", content: "Latest request" }],
        streamingMessage: {
          content: [{ type: "text", text: "Work is still in progress" }],
        },
      }),
    ).toEqual([
      {
        id: "latest-user",
        summary: "Work is still in progress",
        title: "Latest request",
      },
    ]);
  });
});
