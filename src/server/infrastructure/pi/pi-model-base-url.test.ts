import { describe, expect, it } from "vitest";
import type { Model } from "@earendil-works/pi-ai";
import {
  normalizeAnthropicBaseUrl,
  normalizePiModelBaseUrl,
} from "./pi-model-base-url";

describe("normalizeAnthropicBaseUrl", () => {
  it("removes a trailing Anthropic API version", () => {
    expect(normalizeAnthropicBaseUrl("https://api.example.com/v1")).toBe(
      "https://api.example.com",
    );
    expect(normalizeAnthropicBaseUrl("https://api.example.com/proxy/v1/")).toBe(
      "https://api.example.com/proxy",
    );
  });

  it("preserves an unversioned proxy base path", () => {
    expect(
      normalizeAnthropicBaseUrl("https://ark.example.com/api/coding"),
    ).toBe("https://ark.example.com/api/coding");
  });
});

describe("normalizePiModelBaseUrl", () => {
  const model = {
    id: "model",
    name: "Model",
    provider: "custom",
    baseUrl: "https://api.example.com/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8_192,
  } satisfies Omit<Model<"anthropic-messages">, "api">;

  it("normalizes Anthropic models without changing the configured model", () => {
    const source: Model<"anthropic-messages"> = {
      ...model,
      api: "anthropic-messages",
    };
    const normalized = normalizePiModelBaseUrl(source);

    expect(normalized.baseUrl).toBe("https://api.example.com");
    expect(source.baseUrl).toBe("https://api.example.com/v1");
  });

  it("does not alter OpenAI-compatible model URLs", () => {
    const source: Model<"openai-completions"> = {
      ...model,
      api: "openai-completions",
    };

    expect(normalizePiModelBaseUrl(source)).toBe(source);
  });
});
