import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PiWebAccessSettingsStore } from "./pi-web-access-settings-store";

describe("PiWebAccessSettingsStore", () => {
  it("reads the conservative config without exposing fake keys", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-web-settings-"));
    const filePath = path.join(root, "web-search.json");
    await fs.writeFile(filePath, JSON.stringify({ workflow: "none" }));
    try {
      const settings = await new PiWebAccessSettingsStore(filePath).read();
      expect(settings.enabled).toBe(false);
      expect(settings.providers.map(({ id, apiKey }) => [id, apiKey])).toEqual([
        ["brave", ""],
        ["tavily", ""],
        ["exa", ""],
        ["duckduckgo", ""],
      ]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("preserves unrelated pi-web-access fields and returns saved API keys", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-web-settings-"));
    const filePath = path.join(root, "web-search.json");
    await fs.writeFile(
      filePath,
      JSON.stringify({
        workflow: "none",
        fetchRouting: { providers: ["http"] },
      }),
    );
    const store = new PiWebAccessSettingsStore(filePath);
    try {
      await store.write({
        enabled: true,
        providers: [
          { id: "brave", enabled: true, apiKey: "brave-secret" },
          { id: "exa", enabled: true, apiKey: "exa-secret" },
          { id: "duckduckgo", enabled: true, apiKey: "" },
          { id: "tavily", enabled: false, apiKey: "" },
        ],
        fallbackOn: ["network", "quota"],
      });

      await expect(store.read()).resolves.toMatchObject({
        enabled: true,
        providers: [
          { id: "brave", enabled: true, apiKey: "brave-secret" },
          { id: "exa", enabled: true, apiKey: "exa-secret" },
          { id: "duckduckgo", enabled: true, apiKey: "" },
          { id: "tavily", enabled: false, apiKey: "" },
        ],
        fallbackOn: ["network", "quota"],
      });
      const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
      expect(raw).toMatchObject({
        workflow: "none",
        poAgentWebAccessEnabled: true,
        tools: {
          webSearch: { enabled: true },
          fetchContent: { enabled: true },
          getSearchContent: { enabled: true },
          sourceCheck: { enabled: true },
        },
        fetchRouting: { providers: ["http"] },
        braveApiKey: "brave-secret",
        exaApiKey: "exa-secret",
        searchRouting: {
          providers: ["brave", "exa", "duckduckgo"],
          fallbackOn: ["network", "quota"],
        },
      });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("keeps an empty provider route while Web Search is disabled", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-web-settings-"));
    const filePath = path.join(root, "web-search.json");
    await fs.writeFile(
      filePath,
      JSON.stringify({
        provider: "brave",
        braveApiKey: "old-key",
        searchRouting: { providers: ["brave"], fallbackOn: ["network"] },
      }),
    );
    const store = new PiWebAccessSettingsStore(filePath);
    try {
      await store.write({
        enabled: false,
        providers: [
          { id: "brave", enabled: false, apiKey: "" },
          { id: "tavily", enabled: false, apiKey: "" },
          { id: "exa", enabled: false, apiKey: "" },
          { id: "duckduckgo", enabled: false, apiKey: "" },
        ],
        fallbackOn: ["transient", "quota", "network", "invalid-response"],
      });
      const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
      expect(raw.provider).toBeUndefined();
      expect(raw.searchRouting).toEqual({
        providers: [],
        fallbackOn: ["transient", "quota", "network", "invalid-response"],
      });
      expect(raw.braveApiKey).toBeUndefined();
      expect(raw.poAgentWebAccessEnabled).toBe(false);
      const settings = await store.read();
      expect(settings.enabled).toBe(false);
      expect(settings.providers.every((provider) => !provider.enabled)).toBe(true);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
