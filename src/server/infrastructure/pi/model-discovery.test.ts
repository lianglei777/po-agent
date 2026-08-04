import { describe, expect, it, vi } from "vitest";
import {
  buildModelDiscoverySuggestions,
  fetchAnthropicModels,
  fetchArkModels,
  fetchOpenAICompatibleModels,
  selectFetchModels,
} from "./model-discovery";

describe("buildModelDiscoverySuggestions", () => {
  it("enriches remote model ids with catalog metadata when available", async () => {
    const fetchModels = vi.fn().mockResolvedValue([
      { id: "gpt-4.1", name: "GPT 4.1" },
      { id: "provider-new-model" },
    ]);

    const result = await buildModelDiscoverySuggestions(
      {
        providerName: "custom-openai",
        provider: {
          api: "openai-completions",
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
        },
      },
      {
        fetchModels,
        catalogModels: [
          {
            id: "gpt-4.1",
            name: "GPT 4.1",
            api: "openai-responses",
            provider: "openai",
            baseUrl: "https://api.openai.com/v1",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 1 },
            contextWindow: 1047576,
            maxTokens: 32768,
          },
        ],
      },
    );

    expect(fetchModels).toHaveBeenCalledWith({
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      headers: undefined,
    });
    expect(result).toEqual({
      models: [
        {
          verification: "unverified",
          model: {
            id: "gpt-4.1",
            name: "GPT 4.1",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 1 },
            contextWindow: 1047576,
            maxTokens: 32768,
            api: "openai-completions",
          },
        },
        {
          verification: "unverified",
          model: {
            id: "provider-new-model",
            name: "provider-new-model",
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 16384,
            api: "openai-completions",
          },
        },
      ],
      remoteError: undefined,
    });
  });

  it("falls back to provider catalog models when remote discovery fails", async () => {
    const result = await buildModelDiscoverySuggestions(
      {
        providerName: "openai",
        provider: {
          api: "openai-responses",
          baseUrl: "https://api.openai.com/v1",
        },
      },
      {
        fetchModels: vi.fn().mockRejectedValue(new Error("unauthorized")),
        catalogModels: [
          {
            id: "gpt-4.1",
            name: "GPT 4.1",
            api: "openai-responses",
            provider: "openai",
            baseUrl: "https://api.openai.com/v1",
            reasoning: false,
            input: ["text"],
            cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 1 },
            contextWindow: 1047576,
            maxTokens: 32768,
          },
        ],
      },
    );

    expect(result.models).toEqual([
      {
        verification: "unverified",
        model: {
          id: "gpt-4.1",
          name: "GPT 4.1",
          reasoning: false,
          input: ["text"],
          cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 1 },
          contextWindow: 1047576,
          maxTokens: 32768,
          api: "openai-responses",
        },
      },
    ]);
    expect(result.remoteError).toBe("unauthorized");
  });

  it("preserves catalog compatibility without inferring settings from model ids", async () => {
    const result = await buildModelDiscoverySuggestions(
      {
        providerName: "custom-openai",
        provider: {
          api: "openai-completions",
          baseUrl: "https://api.example.com/v1",
        },
      },
      {
        fetchModels: vi.fn().mockResolvedValue([{ id: "deepseek-v4-pro" }]),
        catalogModels: [
          {
            id: "deepseek-v4-pro",
            name: "DeepSeek V4 Pro",
            api: "openai-completions",
            provider: "catalog-provider",
            baseUrl: "https://api.example.com/v1",
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 1_000_000,
            maxTokens: 384_000,
            compat: {
              requiresReasoningContentOnAssistantMessages: true,
              thinkingFormat: "deepseek",
            },
          },
        ],
      },
    );

    expect(result.models[0]).toMatchObject({
      verification: "unverified",
      model: {
        id: "deepseek-v4-pro",
        compat: {
          requiresReasoningContentOnAssistantMessages: true,
          thinkingFormat: "deepseek",
        },
      },
    });
    expect(result.models[0]?.model.compat).not.toHaveProperty(
      "supportsDeveloperRole",
    );
  });

  it("discovers models via Anthropic protocol with x-api-key header", async () => {
    const fetchModels = vi.fn().mockResolvedValue([
      { id: "claude-sonnet-4-5-20250929", name: "Claude Sonnet 4.5" },
    ]);

    const result = await buildModelDiscoverySuggestions(
      {
        providerName: "custom-anthropic",
        provider: {
          api: "anthropic-messages",
          baseUrl: "https://api.anthropic.com",
          apiKey: "sk-ant-test",
        },
      },
      {
        fetchModels,
        catalogModels: [],
      },
    );

    expect(fetchModels).toHaveBeenCalledWith({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
      headers: undefined,
    });
    expect(result.models).toHaveLength(1);
    expect(result.models[0]?.model.id).toBe("claude-sonnet-4-5-20250929");
    expect(result.models[0]?.model.api).toBe("anthropic-messages");
    expect(result.remoteError).toBeUndefined();
  });

  it("falls back to catalog when Anthropic remote discovery fails", async () => {
    const result = await buildModelDiscoverySuggestions(
      {
        providerName: "anthropic",
        provider: {
          api: "anthropic-messages",
          baseUrl: "https://api.anthropic.com",
        },
      },
      {
        fetchModels: vi.fn().mockRejectedValue(new Error("unauthorized")),
        catalogModels: [
          {
            id: "claude-sonnet-4-5-20250929",
            name: "Claude Sonnet 4.5",
            api: "anthropic-messages",
            provider: "anthropic",
            baseUrl: "https://api.anthropic.com",
            reasoning: true,
            input: ["text", "image"],
            cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
            contextWindow: 200000,
            maxTokens: 16384,
          },
        ],
      },
    );

    expect(result.models).toHaveLength(1);
    expect(result.models[0]?.model.id).toBe("claude-sonnet-4-5-20250929");
    expect(result.remoteError).toBe("unauthorized");
  });

  it("discovers models via anthropic-ark and maps model api to anthropic-messages", async () => {
    const fetchModels = vi.fn().mockResolvedValue([
      { id: "doubao-pro-32k", name: "Doubao Pro 32K" },
    ]);

    const result = await buildModelDiscoverySuggestions(
      {
        providerName: "volcengine-ark",
        provider: {
          api: "anthropic-ark",
          baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
          apiKey: "ark-test",
        },
      },
      {
        fetchModels,
        catalogModels: [],
      },
    );

    expect(fetchModels).toHaveBeenCalledWith({
      baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
      apiKey: "ark-test",
      headers: undefined,
    });
    expect(result.models).toHaveLength(1);
    expect(result.models[0]?.model.id).toBe("doubao-pro-32k");
    // 发现层协议为 anthropic-ark，但 model api 应映射为 pi-ai 可识别的 anthropic-messages
    expect(result.models[0]?.model.api).toBe("anthropic-messages");
    expect(result.remoteError).toBeUndefined();
  });
});

describe("fetchAnthropicModels", () => {
  it("sends x-api-key and anthropic-version headers to /v1/models", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: "claude-sonnet-4-5-20250929", display_name: "Claude Sonnet 4.5" },
            ],
          }),
          { status: 200 },
        ),
      );

    await fetchAnthropicModels({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      {
        headers: {
          "x-api-key": "sk-ant-test",
          "anthropic-version": "2023-06-01",
        },
      },
    );
    fetchMock.mockRestore();
  });

  it("does not double /v1 when baseUrl already includes it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ id: "claude-sonnet-4-5-20250929" }] }),
        { status: 200 },
      ),
    );

    await fetchAnthropicModels({
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "sk-ant-test",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.anything(),
    );
    fetchMock.mockRestore();
  });

  it("parses display_name as model name", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "claude-opus-4-5-20251101", display_name: "Claude Opus 4.5" },
            { id: "claude-haiku-4-5-20251001" },
          ],
        }),
        { status: 200 },
      ),
    );

    const models = await fetchAnthropicModels({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test",
    });

    expect(models).toEqual([
      { id: "claude-opus-4-5-20251101", name: "Claude Opus 4.5" },
      { id: "claude-haiku-4-5-20251001", name: undefined },
    ]);
    fetchMock.mockRestore();
  });

  it("throws on non-ok response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(
      fetchAnthropicModels({
        baseUrl: "https://api.anthropic.com",
        apiKey: "invalid",
      }),
    ).rejects.toThrow("Model discovery failed (401)");
    fetchMock.mockRestore();
  });

  it("throws when no models returned", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await expect(
      fetchAnthropicModels({
        baseUrl: "https://api.anthropic.com",
        apiKey: "sk-ant-test",
      }),
    ).rejects.toThrow("Model discovery returned no models");
    fetchMock.mockRestore();
  });
});

describe("fetchArkModels", () => {
  it("sends Authorization Bearer header to /v1/models", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              { id: "doubao-pro-32k", name: "Doubao Pro 32K" },
            ],
          }),
          { status: 200 },
        ),
      );

    const models = await fetchArkModels({
      baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
      apiKey: "ark-test",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.cn-beijing.volces.com/api/coding/v1/models",
      {
        headers: {
          Authorization: "Bearer ark-test",
        },
      },
    );
    expect(models).toEqual([
      { id: "doubao-pro-32k", name: "Doubao Pro 32K" },
    ]);
    fetchMock.mockRestore();
  });

  it("parses name field (OpenAI-compatible format)", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "doubao-pro-32k", name: "Doubao Pro 32K" },
            { id: "deepseek-r1" },
          ],
        }),
        { status: 200 },
      ),
    );

    const models = await fetchArkModels({
      baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
      apiKey: "ark-test",
    });

    expect(models).toEqual([
      { id: "doubao-pro-32k", name: "Doubao Pro 32K" },
      { id: "deepseek-r1", name: undefined },
    ]);
    fetchMock.mockRestore();
  });

  it("throws on non-ok response", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(
      fetchArkModels({
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
        apiKey: "invalid",
      }),
    ).rejects.toThrow("Model discovery failed (401)");
    fetchMock.mockRestore();
  });

  it("throws when no models returned", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );

    await expect(
      fetchArkModels({
        baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
        apiKey: "ark-test",
      }),
    ).rejects.toThrow("Model discovery returned no models");
    fetchMock.mockRestore();
  });
});

describe("selectFetchModels", () => {
  it("returns fetchAnthropicModels for anthropic-messages", () => {
    expect(selectFetchModels("anthropic-messages")).toBe(fetchAnthropicModels);
  });

  it("returns fetchArkModels for anthropic-ark", () => {
    expect(selectFetchModels("anthropic-ark")).toBe(fetchArkModels);
  });

  it("returns fetchOpenAICompatibleModels for openai-completions", () => {
    expect(selectFetchModels("openai-completions")).toBe(
      fetchOpenAICompatibleModels,
    );
  });

  it("returns fetchOpenAICompatibleModels for openai-responses", () => {
    expect(selectFetchModels("openai-responses")).toBe(
      fetchOpenAICompatibleModels,
    );
  });

  it("returns fetchOpenAICompatibleModels as default", () => {
    expect(selectFetchModels(undefined)).toBe(fetchOpenAICompatibleModels);
  });
});
