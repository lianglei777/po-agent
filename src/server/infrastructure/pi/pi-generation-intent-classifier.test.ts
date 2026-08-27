import { describe, expect, it, vi } from "vitest";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { GenerationRouteDto } from "@/contracts/generation";
import {
  parseGenerationIntentDecision,
  PiGenerationIntentClassifier,
} from "./pi-generation-intent-classifier";

describe("parseGenerationIntentDecision", () => {
  it("uses the final valid object when a model emits an example before its answer", () => {
    const text = [
      'Example: {"intent":"chat"}',
      'Answer: {"intent":"generation","capability":"image-to-image","routeId":"image-image","effective_prompt":"create a new poster","parameters":{"width":1024}}',
    ].join("\n");

    expect(parseGenerationIntentDecision(text)).toEqual({
      intent: "generation",
      capability: "image-to-image",
      routeId: "image-image",
      effectivePrompt: "create a new poster",
      parameters: { width: 1024 },
      question: undefined,
    });
  });

  it("accepts common structured aliases without inferring intent from keywords", () => {
    expect(parseGenerationIntentDecision(
      '```json\n{"plan":{"type":"content-generation","capability":"image_to_image","prompt":"new composition"}}\n```',
    )).toMatchObject({
      intent: "generation",
      capability: "image-to-image",
      effectivePrompt: "new composition",
    });
  });
});

describe("PiGenerationIntentClassifier", () => {
  it("retries once when the selected model returns a non-JSON response", async () => {
    const completeSimple = vi.fn()
      .mockResolvedValueOnce(response([{ type: "text", text: "I will explain first" }]))
      .mockResolvedValueOnce(response([{
        type: "thinking",
        thinking: '{"intent":"generation","capability":"image-to-image","effectivePrompt":"new poster","parameters":{}}',
      }]));
    const runtime = {
      getModel: vi.fn(() => ({ provider: "provider", id: "model" })),
      completeSimple,
    } as unknown as ModelRuntime;
    const classifier = new PiGenerationIntentClassifier(Promise.resolve(runtime));

    await expect(classifier.classify({
      model: { provider: "provider", modelId: "model" },
      message: "create a new poster from this image",
      assets: [{ mediaType: "image", mimeType: "image/png" }],
      routes: [route],
      conversation: [],
      recentRuns: [],
    })).resolves.toMatchObject({
      intent: "generation",
      capability: "image-to-image",
      effectivePrompt: "new poster",
    });
    expect(completeSimple).toHaveBeenCalledTimes(2);
  });

  it("asks for clarification instead of failing the request when both responses violate the protocol", async () => {
    const completeSimple = vi.fn()
      .mockResolvedValueOnce(response([{ type: "text", text: "not json" }]))
      .mockResolvedValueOnce(response([{ type: "text", text: "still not json" }]));
    const runtime = {
      getModel: vi.fn(() => ({ provider: "provider", id: "model" })),
      completeSimple,
    } as unknown as ModelRuntime;
    const classifier = new PiGenerationIntentClassifier(Promise.resolve(runtime));

    await expect(classifier.classify({
      model: { provider: "provider", modelId: "model" },
      message: "do something with this image",
      assets: [{ mediaType: "image", mimeType: "image/png" }],
      routes: [route],
      conversation: [],
      recentRuns: [],
    })).resolves.toEqual({ intent: "clarification" });
    expect(completeSimple).toHaveBeenCalledTimes(2);
  });

  it("repairs a generation decision whose effective prompt is only a placeholder", async () => {
    const completeSimple = vi.fn()
      .mockResolvedValueOnce(response([{
        type: "text",
        text: '{"intent":"generation","capability":"image-to-image","effectivePrompt":"..."}',
      }]))
      .mockResolvedValueOnce(response([{
        type: "text",
        text: '{"intent":"generation","capability":"image-to-image","effectivePrompt":"Create a completely new character poster using the reference image style."}',
      }]));
    const runtime = {
      getModel: vi.fn(() => ({ provider: "provider", id: "model" })),
      completeSimple,
    } as unknown as ModelRuntime;
    const classifier = new PiGenerationIntentClassifier(Promise.resolve(runtime));

    await expect(classifier.classify({
      model: { provider: "provider", modelId: "model" },
      message: "create a new poster from this image",
      assets: [{ mediaType: "image", mimeType: "image/png" }],
      routes: [route],
      conversation: [],
      recentRuns: [],
    })).resolves.toMatchObject({
      intent: "generation",
      effectivePrompt: "Create a completely new character poster using the reference image style.",
    });
    expect(completeSimple).toHaveBeenCalledTimes(2);
  });
});

const route: GenerationRouteDto = {
  id: "image-image",
  name: "Image to image",
  description: "Create a new image from a reference image",
  tags: ["Reference image"],
  capability: "image-to-image",
  product: "Product",
  providerId: "provider",
  enabled: true,
  isDefault: true,
  revision: 1,
  defaults: {},
  inputSchema: { prompt: { required: true } },
};

function response(content: unknown[]) {
  return {
    role: "assistant",
    content,
    api: "openai-responses",
    provider: "provider",
    model: "model",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}
