import { describe, expect, it } from "vitest";
import type {
  GenerationRouteDto,
  GenerationRunViewDto,
} from "@/contracts/generation";
import type { AgentMessage } from "./agent-types";
import { projectChatWorkflowRuns } from "./chat-workflow-presentation";
import { buildMessagePresentation, partitionAssistantTurn } from "./message-presentation";

const route: GenerationRouteDto = {
  id: "image-to-image",
  name: "Image to image",
  capability: "image-to-image",
  product: "Image",
  providerId: "provider",
  enabled: true,
  isDefault: true,
  revision: 1,
  defaults: {},
  inputSchema: { prompt: { required: true } },
};

function run(status: GenerationRunViewDto["run"]["status"]): GenerationRunViewDto {
  return {
    run: {
      id: "run-1",
      sessionId: "session-1",
      routeId: route.id,
      capability: "image-to-image",
      status,
      source: "chat-workflow",
      sourceRef: "turn-1",
      prompt: "将男性人物改为女性并保持原构图",
      input: {
        prompt: "将男性人物改为女性并保持原构图",
        originalPrompt: "把附件人物改为女性",
        parameters: {},
      },
      createdAt: "2026-08-15T09:46:47.707Z",
      updatedAt: "2026-08-15T09:47:44.921Z",
    },
    jobs: [],
    artifacts: [],
  };
}

const persistedMessages: AgentMessage[] = [
  {
    role: "custom",
    customType: "po-agent-generation-turn",
    content: "trusted metadata",
    display: false,
    details: { turnId: "turn-1", assets: [] },
  },
  { role: "user", content: "把附件人物改为女性", timestamp: 1 },
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
];

describe("chat workflow presentation", () => {
  it("renders one user message followed by the standard assistant execution process", () => {
    const projected = projectChatWorkflowRuns({
      messages: persistedMessages,
      entryIds: ["custom-1", "user-1", "ack-1"],
      runs: [run("succeeded")],
      routes: [route],
      model: { provider: "new-api", id: "glm-5.2" },
    });
    const items = buildMessagePresentation(projected.messages, projected.entryIds);

    expect(projected.messages.filter((message) => message.role === "user"))
      .toHaveLength(1);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ kind: "user", entryId: "user-1" });
    expect(items[1]).toMatchObject({
      kind: "assistantTurn",
      messages: [expect.objectContaining({
        provider: "new-api",
        model: "glm-5.2",
        stopReason: "toolUse",
      })],
    });
    if (items[1]?.kind !== "assistantTurn") throw new Error("missing assistant turn");
    expect(partitionAssistantTurn(items[1]).process).toEqual([
      expect.objectContaining({
        block: expect.objectContaining({
          type: "toolCall",
          toolName: "generate_image",
        }),
      }),
    ]);
  });

  it("keeps review-first configuration in the assistant action projection", () => {
    const projected = projectChatWorkflowRuns({
      messages: persistedMessages,
      entryIds: ["custom-1", "user-1", "ack-1"],
      runs: [run("awaiting_confirmation")],
      routes: [route],
    });
    const result = projected.messages.find((message) => message.role === "toolResult");

    expect(result).toMatchObject({
      details: {
        runId: "run-1",
        status: "awaiting_confirmation",
        review: { route: { id: route.id } },
      },
    });
  });

  it("does not synthesize a second process when a persisted tool result already references the run", () => {
    const existing: AgentMessage[] = [
      persistedMessages[0]!,
      persistedMessages[1]!,
      {
        role: "assistant",
        provider: "new-api",
        model: "glm-5.2",
        stopReason: "toolUse",
        content: [{
          type: "toolCall",
          toolCallId: "chat-workflow:turn-1",
          toolName: "generate_image",
          input: { prompt: "将男性人物改为女性并保持原构图" },
        }],
      },
      {
        role: "toolResult",
        toolCallId: "chat-workflow:turn-1",
        content: [{ type: "text", text: "done" }],
        details: {
          runId: "run-1",
          status: "succeeded",
          phase: "completed",
          artifacts: [],
        },
      },
    ];
    const projected = projectChatWorkflowRuns({
      messages: existing,
      entryIds: ["custom-1", "user-1", "tool-call-1", "result-1"],
      runs: [run("succeeded")],
      routes: [route],
    });

    expect(projected.messages.filter((message) => message.role === "toolResult"))
      .toHaveLength(1);
    expect(projected.messages).toEqual(existing);
  });
});
