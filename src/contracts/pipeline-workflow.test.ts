import { describe, expect, it } from "vitest";
import { canvasWorkflowNodeIsRunnable, type CanvasNodeData } from "./pipeline";

function data(patch: Partial<CanvasNodeData>): CanvasNodeData {
  return { type: "image", name: "Node", action: "generate", ...patch };
}

describe("canvasWorkflowNodeIsRunnable", () => {
  it("accepts generative media and text with an effective prompt", () => {
    expect(canvasWorkflowNodeIsRunnable(data({ type: "image" }))).toBe(true);
    expect(canvasWorkflowNodeIsRunnable(data({ type: "video" }))).toBe(true);
    expect(canvasWorkflowNodeIsRunnable(data({ type: "text", params: { prompt: "Write this" } }))).toBe(true);
    expect(canvasWorkflowNodeIsRunnable(data({
      type: "text",
      params: {
        prompt: "",
        promptDocument: { schemaVersion: 1, format: "tiptap-json", plainText: "Rich prompt", content: { type: "doc" } },
      },
    }))).toBe(true);
  });

  it("rejects resources, audio, and blank text", () => {
    expect(canvasWorkflowNodeIsRunnable(data({ generatorType: "resource" }))).toBe(false);
    expect(canvasWorkflowNodeIsRunnable(data({ type: "audio" }))).toBe(false);
    expect(canvasWorkflowNodeIsRunnable(data({ type: "text", params: { prompt: "  " } }))).toBe(false);
  });
});
