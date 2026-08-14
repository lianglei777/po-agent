import { describe, expect, it } from "vitest";
import { parsePlanGenerationTurnRequest } from "./generation-validators";

describe("parsePlanGenerationTurnRequest", () => {
  it("accepts a route selection and safe attachment metadata", () => {
    expect(parsePlanGenerationTurnRequest({
      message: "生成视频",
      sessionId: "session-1",
      model: { provider: "provider", modelId: "chat-model" },
      mode: { type: "generation-route", routeId: "route-1" },
      assets: [{ mediaType: "image", mimeType: "image/png" }],
    })).toEqual({
      message: "生成视频",
      sessionId: "session-1",
      model: { provider: "provider", modelId: "chat-model" },
      mode: { type: "generation-route", routeId: "route-1" },
      assets: [{ mediaType: "image", mimeType: "image/png" }],
    });
  });

  it("rejects media metadata that disagrees with its MIME type", () => {
    expect(() => parsePlanGenerationTurnRequest({
      message: "生成视频",
      model: { provider: "provider", modelId: "chat-model" },
      mode: { type: "generation-auto" },
      assets: [{ mediaType: "video", mimeType: "image/png" }],
    })).toThrow("mimeType does not match mediaType");
  });
});
