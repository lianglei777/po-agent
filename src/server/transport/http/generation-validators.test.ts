import { describe, expect, it } from "vitest";
import {
  parseConfirmGenerationRun,
  parseCreateGenerationRun,
  parseRetryGenerationRun,
} from "./generation-validators";

describe("parseCreateGenerationRun", () => {
  it("parses named artifact and workspace asset references", () => {
    expect(parseCreateGenerationRun({
      capability: "image-to-video",
      prompt: "camera pushes in",
      originalPrompt: "make it move",
      idempotencyKey: "request-1",
      reviewFirst: true,
      assets: [
        {
          slot: "firstFrameUrl",
          ref: { type: "artifact", artifactId: "artifact-1" },
        },
        {
          slot: "lastFrameUrl",
          ref: { type: "workspace-file", relativePath: "last.png" },
        },
      ],
      parameters: { durationSeconds: 5, generateAudio: true },
    })).toEqual({
      capability: "image-to-video",
      prompt: "camera pushes in",
      originalPrompt: "make it move",
      idempotencyKey: "request-1",
      reviewFirst: true,
      assets: [
        {
          slot: "firstFrameUrl",
          ref: { type: "artifact", artifactId: "artifact-1" },
        },
        {
          slot: "lastFrameUrl",
          ref: { type: "workspace-file", relativePath: "last.png" },
        },
      ],
      parameters: { durationSeconds: 5, generateAudio: true },
    });
  });

  it("rejects unsupported capabilities and invalid asset references", () => {
    expect(() => parseCreateGenerationRun({
      capability: "text-to-music",
      prompt: "test",
      idempotencyKey: "request-1",
    })).toThrow("capability is not supported");
    expect(() => parseCreateGenerationRun({
      capability: "image-to-video",
      prompt: "test",
      idempotencyKey: "request-1",
      assets: [{ slot: "firstFrameUrl", ref: { type: "url" } }],
    })).toThrow("must be artifact or workspace-file");
  });

  it("allows an empty prompt for routes whose application schema marks it optional", () => {
    expect(parseCreateGenerationRun({
      capability: "image-to-video",
      prompt: "",
      idempotencyKey: "request-1",
    }).prompt).toBe("");
  });
});

describe("parseRetryGenerationRun", () => {
  it("requires an idempotency key", () => {
    expect(parseRetryGenerationRun({ idempotencyKey: "retry-1" })).toEqual({
      idempotencyKey: "retry-1",
    });
    expect(() => parseRetryGenerationRun({})).toThrowError();
  });
});

describe("parseConfirmGenerationRun", () => {
  it("accepts an editable prompt and JSON parameters", () => {
    expect(parseConfirmGenerationRun({
      prompt: "revised prompt",
      parameters: { durationSeconds: 10, generateAudio: false },
    })).toEqual({
      prompt: "revised prompt",
      parameters: { durationSeconds: 10, generateAudio: false },
    });
    expect(() => parseConfirmGenerationRun({ prompt: 1 })).toThrowError();
  });
});
