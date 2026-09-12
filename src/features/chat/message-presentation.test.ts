import { describe, expect, it } from "vitest";
import type {
  AgentMessage,
  AssistantMessage,
  ToolResultMessage,
} from "./agent-types";
import {
  buildMessagePresentation,
  executionProcessStatus,
  partitionAssistantTurn,
} from "./message-presentation";

const intermediate: AssistantMessage = {
  role: "assistant",
  provider: "deepseek",
  model: "deepseek-v4-pro",
  stopReason: "toolUse",
  content: [
    { type: "thinking", thinking: "Inspect the model configuration." },
    { type: "text", text: "I will inspect the relevant files." },
    {
      type: "toolCall",
      toolCallId: "tool-1",
      toolName: "read",
      input: { path: "src/server/domain/model.ts" },
    },
  ],
};

const finalAnswer: AssistantMessage = {
  role: "assistant",
  provider: "deepseek",
  model: "deepseek-v4-pro",
  stopReason: "stop",
  content: [
    { type: "thinking", thinking: "Synthesize the findings." },
    { type: "text", text: "The model configuration is valid." },
  ],
};

const toolResult: ToolResultMessage = {
  role: "toolResult",
  toolCallId: "tool-1",
  content: [{ type: "text", text: "export interface Model {}" }],
};

describe("chat message presentation", () => {
  it("groups assistant messages separated by tool results into one turn", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "Check the model configuration" },
      intermediate,
      toolResult,
      finalAnswer,
    ];

    const items = buildMessagePresentation(messages, [
      "user-1",
      "assistant-1",
      "tool-result-1",
      "assistant-2",
    ]);

    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      kind: "assistantTurn",
      entryIds: ["assistant-1", "assistant-2"],
      streaming: false,
    });
    if (items[1]?.kind === "assistantTurn") {
      expect(items[1].messages).toEqual([intermediate, finalAnswer]);
    }
  });

  it("moves intermediate content and final thinking into the process", () => {
    const partition = partitionAssistantTurn({
      kind: "assistantTurn",
      entryIds: ["assistant-1", "assistant-2"],
      messages: [intermediate, finalAnswer],
      originalIndexes: [1, 3],
      streaming: false,
    });

    expect(partition.process.map((step) => step.block.type)).toEqual([
      "thinking",
      "text",
      "toolCall",
      "thinking",
    ]);
    expect(partition.final).toEqual([
      {
        block: { type: "text", text: "The model configuration is valid." },
        message: finalAnswer,
        messageIndex: 1,
      },
    ]);
  });

  it("appends streaming output to the active assistant turn", () => {
    const items = buildMessagePresentation(
      [
        { role: "user", content: "Check the model configuration" },
        intermediate,
        toolResult,
      ],
      ["user-1", "assistant-1", "tool-result-1"],
      {
        role: "assistant",
        provider: "deepseek",
        model: "deepseek-v4-pro",
        content: [{ type: "thinking", thinking: "Continue inspecting." }],
      },
    );

    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      kind: "assistantTurn",
      streaming: true,
    });
    if (items[1]?.kind === "assistantTurn") {
      expect(items[1].messages).toHaveLength(2);
    }
  });

  it("keeps recovered tool failures local to the failed step", () => {
    const turn = {
      kind: "assistantTurn" as const,
      entryIds: ["assistant-1", "assistant-2"],
      messages: [intermediate, finalAnswer],
      originalIndexes: [1, 3],
      streaming: false,
    };

    expect(
      executionProcessStatus(
        partitionAssistantTurn(turn).process,
        new Map([["tool-1", toolResult]]),
        false,
      ),
    ).toEqual({
      completedCount: 4,
      errorCount: 0,
      runningCount: 0,
      state: "completed",
      stepCount: 4,
    });

    expect(
      executionProcessStatus(
        partitionAssistantTurn(turn).process,
        new Map(),
        true,
      ),
    ).toMatchObject({ runningCount: 1, state: "running" });

    expect(
      executionProcessStatus(
        partitionAssistantTurn(turn).process,
        new Map([["tool-1", { ...toolResult, isError: true }]]),
        false,
      ),
    ).toMatchObject({ errorCount: 1, state: "completed" });
  });

  it("keeps compaction summaries out of the chat presentation", () => {
    const summary = {
      role: "compactionSummary" as const,
      summary: "Previous model inspection was compacted.",
      tokensBefore: 12_000,
    };

    const items = buildMessagePresentation(
      [
        { role: "user", content: "Check the model configuration" },
        intermediate,
        summary,
        finalAnswer,
      ],
      ["user-1", "assistant-1", "summary-1", "assistant-2"],
    );

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.kind)).toEqual([
      "user",
      "assistantTurn",
      "assistantTurn",
    ]);
  });
});
