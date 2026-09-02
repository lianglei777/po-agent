import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeRegistry } from "@/server/ports/agent-runtime";
import type { WebAccessSettingsStore } from "@/server/ports/web-access-settings";
import { WebAccessSettingsService } from "./web-access-settings-service";

describe("WebAccessSettingsService", () => {
  it("persists settings and invalidates loaded Web Access extensions", async () => {
    const input = {
      enabled: false,
      providers: [
        { id: "brave" as const, enabled: true, apiKey: "key" },
        { id: "tavily" as const, enabled: true, apiKey: "" },
        { id: "exa" as const, enabled: true, apiKey: "" },
        { id: "duckduckgo" as const, enabled: true, apiKey: "" },
      ],
      fallbackOn: ["network" as const],
    };
    const settings: WebAccessSettingsStore = {
      read: vi.fn(async () => input),
      write: vi.fn(async () => {}),
    };
    const runtimes = {
      invalidateWebAccessConfig: vi.fn(),
    } as unknown as AgentRuntimeRegistry;

    await expect(
      new WebAccessSettingsService(settings, runtimes).update(input),
    ).resolves.toEqual(input);
    expect(settings.write).toHaveBeenCalledWith(input);
    expect(runtimes.invalidateWebAccessConfig).toHaveBeenCalledOnce();
  });
});
