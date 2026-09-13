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

  it("maps local tool artifacts into the generic Chat presentation contract", () => {
    expect(mapPiMessage({
      role: "toolResult",
      toolCallId: "call-1",
      toolName: "generate_image",
      content: [{ type: "text", text: "succeeded" }],
      details: {
        artifacts: [{
          id: "artifact-1",
          kind: "image",
          localPath: ".po-agent/generated/run-1/blue boat.png",
          contentType: "image/png",
        }, {
          id: "remote-only",
          kind: "image",
          remoteUrl: "https://provider.example/output.png",
        }],
      },
    })).toMatchObject({
      role: "toolResult",
      artifacts: [{
        id: "artifact-1",
        kind: "image",
        name: "blue boat.png",
        contentType: "image/png",
      }],
    });
  });
});
