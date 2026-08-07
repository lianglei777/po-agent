import { describe, expect, it } from "vitest";
import type { UserMessage } from "../agent-types";
import { createChatStore } from "./chat-store";

const userMessage: UserMessage = {
  role: "user",
  content: [{ type: "text", text: "hello" }],
  timestamp: 1,
};

describe("chat store", () => {
  it("applies functional message updates against the latest state", () => {
    const store = createChatStore();

    store.getState().setMessages([userMessage]);
    store
      .getState()
      .setMessages((current) => [...current, { ...userMessage, timestamp: 2 }]);

    expect(store.getState().messages).toHaveLength(2);
  });

  it("reduces streaming events inside the store", () => {
    const store = createChatStore();

    store.getState().dispatchStream({ type: "start" });
    store.getState().dispatchStream({
      type: "update",
      message: { role: "assistant", content: [] },
    });
    expect(store.getState().stream.isStreaming).toBe(true);

    store.getState().dispatchStream({ type: "end" });
    expect(store.getState().stream).toEqual({
      isStreaming: false,
      streamingMessage: null,
    });
  });

  it("does not share mutable collections between chat instances", () => {
    const first = createChatStore();
    const second = createChatStore();

    first
      .getState()
      .setPartialToolResults(
        (current) => new Map(current).set("tool-1", {} as never),
      );

    expect(first.getState().partialToolResults.size).toBe(1);
    expect(second.getState().partialToolResults.size).toBe(0);
  });
});
