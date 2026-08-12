import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { PiCredentialProvider } from "./pi-credential-provider";

function createRuntime(overrides: Partial<ModelRuntime> = {}) {
  const providers = [
    {
      id: "oauth-provider",
      name: "OAuth Provider",
      auth: { oauth: {} },
    },
    {
      id: "api-provider",
      name: "API Provider",
      auth: { apiKey: { login: vi.fn() } },
    },
  ];
  return {
    getProviders: () => providers,
    getModels: () => [
      { provider: "api-provider" },
      { provider: "api-provider" },
    ],
    getProvider: (id: string) => providers.find((provider) => provider.id === id),
    getProviderAuthStatus: () => ({ configured: true, source: "stored" }),
    login: vi.fn(async () => ({ type: "oauth" })),
    logout: vi.fn(async () => {}),
    ...overrides,
  } as unknown as ModelRuntime;
}

describe("PiCredentialProvider", () => {
  it("lists OAuth and API Key providers from the shared runtime", async () => {
    const provider = new PiCredentialProvider(Promise.resolve(createRuntime()));

    await expect(provider.listOAuthProviders()).resolves.toEqual([
      { id: "oauth-provider", name: "OAuth Provider" },
    ]);
    await expect(provider.listApiKeyProviders()).resolves.toEqual([
      { id: "api-provider", name: "API Provider" },
    ]);
  });

  it("persists API keys through the runtime login path", async () => {
    const runtime = createRuntime();
    const provider = new PiCredentialProvider(Promise.resolve(runtime));

    await provider.setApiKey("api-provider", "secret-value");

    expect(runtime.login).toHaveBeenCalledWith(
      "api-provider",
      "api_key",
      expect.objectContaining({
        prompt: expect.any(Function),
        notify: expect.any(Function),
      }),
    );
    const interaction = vi.mocked(runtime.login).mock.calls[0][2];
    await expect(interaction.prompt({
      type: "secret",
      message: "API Key",
    })).resolves.toBe("secret-value");
  });

  it("maps OAuth notifications and prompts to the application callbacks", async () => {
    const login = vi.fn(async (_provider, _type, interaction) => {
      interaction.notify({
        type: "auth_url",
        url: "https://example.test/auth",
        instructions: "Open the browser",
      });
      interaction.notify({
        type: "device_code",
        userCode: "ABCD",
        verificationUri: "https://example.test/device",
      });
      interaction.notify({ type: "info", message: "Waiting" });
      await interaction.prompt({
        type: "select",
        message: "Choose account",
        options: [{ id: "one", label: "One", description: "First" }],
      });
      return { type: "oauth", access: "", refresh: "", expires: 0 };
    });
    const runtime = createRuntime({ login } as Partial<ModelRuntime>);
    const emit = vi.fn();
    const requestInput = vi.fn(async () => "one");
    const provider = new PiCredentialProvider(Promise.resolve(runtime));

    await provider.startOAuth(
      "oauth-provider",
      { emit, requestInput },
      new AbortController().signal,
    );

    expect(emit).toHaveBeenCalledWith({
      type: "auth",
      url: "https://example.test/auth",
      instructions: "Open the browser",
    });
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({
      type: "device_code",
      userCode: "ABCD",
    }));
    expect(emit).toHaveBeenCalledWith({ type: "progress", message: "Waiting" });
    expect(requestInput).toHaveBeenCalledWith({
      provider: "oauth-provider",
      message: "Choose account",
      placeholder: undefined,
      options: [{ id: "one", label: "One" }],
    });
    expect(emit).toHaveBeenLastCalledWith({ type: "complete" });
  });
});
