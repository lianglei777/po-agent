import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PiWebAccessSettingsStore } from "./pi-web-access-settings-store";

describe("PiWebAccessSettingsStore", () => {
  it("reads the conservative config as auto mode without exposing fake keys", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-web-settings-"));
    const filePath = path.join(root, "web-search.json");
    await fs.writeFile(filePath, JSON.stringify({ workflow: "none" }));
    try {
      const settings = await new PiWebAccessSettingsStore(filePath).read();
      expect(settings.mode).toBe("auto");
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
        mode: "custom",
        providers: [
          { id: "brave", enabled: true, apiKey: "brave-secret" },
          { id: "exa", enabled: true, apiKey: "exa-secret" },
          { id: "duckduckgo", enabled: true, apiKey: "" },
          { id: "tavily", enabled: false, apiKey: "" },
        ],
        fallbackOn: ["network", "quota"],
      });

      await expect(store.read()).resolves.toMatchObject({
        mode: "custom",
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

  it("removes custom routing and cleared keys when auto mode is saved", async () => {
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
        mode: "auto",
        providers: [
          { id: "brave", enabled: true, apiKey: "" },
          { id: "tavily", enabled: true, apiKey: "" },
          { id: "exa", enabled: true, apiKey: "" },
          { id: "duckduckgo", enabled: true, apiKey: "" },
        ],
        fallbackOn: ["transient", "quota", "network", "invalid-response"],
      });
      const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
      expect(raw.provider).toBeUndefined();
      expect(raw.searchRouting).toBeUndefined();
      expect(raw.braveApiKey).toBeUndefined();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
