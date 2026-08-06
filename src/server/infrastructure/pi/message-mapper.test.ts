import { describe, expect, it } from "vitest";
import { mapPiMessage } from "./message-mapper";

describe("mapPiMessage", () => {
  it("preserves structured tool result details for the client", () => {
    expect(mapPiMessage({
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "generate_image",
      content: [{ type: "text", text: "queued" }],
      details: { runId: "run-1", status: "queued", artifacts: [] },
    })).toMatchObject({
      role: "toolResult",
      details: { runId: "run-1", status: "queued", artifacts: [] },
    });
  });
});
