import { describe, expect, it } from "vitest";
import type {
  AgentMessage,
  AssistantMessage,
  ToolResultMessage,
} from "./agent-types";
import {
  buildMessagePresentation,
  collapseGenerationQueries,
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
  it("keeps optimistic generation assets visible while the Agent is running", () => {
    const items = buildMessagePresentation(
      [{
        role: "user",
        content: "Create a matching character",
        status: "pending",
        generationAssets: [{
          slot: "imageUrls",
          name: "reference.png",
          mediaType: "image",
          mimeType: "image/png",
          ref: {
            type: "workspace-file",
            relativePath: ".po-agent/generation-inputs/reference.png",
          },
        }],
      }],
      [],
    );

    expect(items[0]).toMatchObject({
      kind: "user",
      message: {
        status: "pending",
        generationAssets: [{ name: "reference.png" }],
      },
    });
  });

  it.each([
    "po-agent-generation-context",
    "po-agent-generation-turn",
  ])("attaches persisted generation assets from %s to the following user message", (customType) => {
    const items = buildMessagePresentation(
      [
        {
          role: "custom",
          customType,
          content: "trusted policy",
          display: false,
          details: {
            assets: [{
              slot: "imageUrls",
              name: "reference.png",
              mediaType: "image",
              mimeType: "image/png",
              ref: {
                type: "workspace-file",
                relativePath: ".po-agent/generation-inputs/reference.png",
              },
            }],
          },
        },
        { role: "user", content: "Create a new poster" },
      ],
      ["generation-context-1", "user-1"],
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "user",
      entryId: "user-1",
      message: {
        generationAssets: [{
          name: "reference.png",
          ref: { relativePath: ".po-agent/generation-inputs/reference.png" },
        }],
      },
    });
  });

  it("hides the internal workflow acknowledgement used to persist a generation-only session", () => {
    const items = buildMessagePresentation([
      { role: "user", content: "Generate an image" },
      {
        role: "assistant",
        provider: "po-agent",
        model: "content-generation-workflow",
        stopReason: "stop",
        content: [{
          type: "text",
          text: "Content generation workflow accepted this request.",
        }],
      },
    ], ["user-1", "assistant-1"]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "user", entryId: "user-1" });
  });

  it("collapses repeated generation status queries to the latest step", () => {
    const query = (id: string): AssistantMessage => ({
      role: "assistant",
      provider: "provider",
      model: "model",
      stopReason: "toolUse",
      content: [{
        type: "toolCall",
        toolCallId: id,
        toolName: "get_generation",
        input: { runId: "run-1" },
      }],
    });
    const turn = {
      kind: "assistantTurn" as const,
      entryIds: [],
      messages: [query("query-1"), query("query-2"), query("query-3")],
      originalIndexes: [0, 1, 2],
      streaming: false,
    };

    const collapsed = collapseGenerationQueries(partitionAssistantTurn(turn).process);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]).toMatchObject({
      repeatCount: 3,
      block: { toolCallId: "query-3" },
    });
  });

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

  it("keeps a partially updated generation tool in the running state", () => {
    const process = partitionAssistantTurn({
      kind: "assistantTurn",
      entryIds: [],
      messages: [{
        role: "assistant",
        provider: "provider",
        model: "model",
        stopReason: "toolUse",
        content: [{
          type: "toolCall",
          toolCallId: "generation-1",
          toolName: "generate_image",
          input: { prompt: "lake" },
        }],
      }],
      originalIndexes: [0],
      streaming: false,
    }).process;
    const partial: ToolResultMessage = {
      role: "toolResult",
      toolCallId: "generation-1",
      content: [],
      details: { runId: "run-1", status: "running", artifacts: [] },
    };

    expect(executionProcessStatus(process, new Map([["generation-1", partial]]), false))
      .toMatchObject({ runningCount: 1, state: "running" });
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
