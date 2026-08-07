import { afterEach, describe, expect, it, vi } from "vitest";
import {
  discoverModelsConfig,
  loadModelsConfigData,
  normalizeModelsConfig,
  saveModelsConfig,
} from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("models config client contract", () => {
  it("normalizes invalid config values", () => {
    expect(normalizeModelsConfig(null)).toEqual({ providers: {} });
    expect(normalizeModelsConfig({ providers: [] })).toEqual({
      providers: {},
    });
  });

  it("preserves valid config data", () => {
    const config = {
      providers: { local: { api: "openai-completions" } },
      extra: true,
    };
    expect(normalizeModelsConfig(config)).toEqual(config);
  });

  it("loads bootstrap data without per-provider API key status requests", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      expect(String(input)).toBe("/api/models-config/bootstrap");
      return Response.json({
        config: { providers: { custom: { api: "openai-completions" } } },
        oauthProviders: [{ id: "openai-codex", name: "OpenAI Codex" }],
        apiKeyProviders: [
          {
            id: "anthropic",
            name: "Anthropic",
            configured: true,
            source: "stored",
            label: "Stored API key",
            modelCount: 2,
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadModelsConfigData()).resolves.toEqual({
      config: { providers: { custom: { api: "openai-completions" } } },
      oauthProviders: [{ id: "openai-codex", name: "OpenAI Codex" }],
      apiKeyProviders: [
        {
          id: "anthropic",
          name: "Anthropic",
          configured: true,
          source: "stored",
          label: "Stored API key",
          modelCount: 2,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requests model discovery for a provider draft", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("/api/models-config/discover");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(
        JSON.stringify({
          providerName: "custom",
          provider: {
            api: "openai-completions",
            baseUrl: "https://api.example.com/v1",
          },
        }),
      );
      return Response.json({
        models: [
          {
            source: "defaulted",
            confidence: "low",
            model: { id: "remote-model" },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      discoverModelsConfig({
        providerName: "custom",
        provider: {
          api: "openai-completions",
          baseUrl: "https://api.example.com/v1",
        },
      }),
    ).resolves.toEqual({
      models: [
        {
          source: "defaulted",
          confidence: "low",
          model: { id: "remote-model" },
        },
      ],
    });
  });

  it("removes cross-protocol compatibility fields before saving", async () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toBe("/api/models-config");
        expect(init?.body).toBe(
          JSON.stringify({
            providers: {
              custom: {
                api: "openai-responses",
                compat: { sendSessionIdHeader: false },
              },
            },
          }),
        );
        return Response.json({ success: true });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    await saveModelsConfig(
      {
        providers: {
          custom: {
            api: "openai-responses",
            compat: {
              sendSessionIdHeader: false,
              supportsDeveloperRole: false,
            },
          },
        },
      },
      controller.signal,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
