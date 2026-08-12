import { describe, expect, it, vi } from "vitest";
import type { AgentRuntimeRegistry } from "@/server/ports/agent-runtime";
import type { AgentSettingsStore } from "@/server/ports/agent-settings";
import { AgentSettingsService } from "./agent-settings-service";

describe("AgentSettingsService", () => {
  it("persists the global preference and refreshes loaded runtimes", async () => {
    let enabled = true;
    const settings: AgentSettingsStore = {
      read: vi.fn(async () => ({ autoCompactionEnabled: enabled })),
      setAutoCompactionEnabled: vi.fn(async (next) => {
        enabled = next;
      }),
    };
    const runtimes = runtimeRegistryStub();
    const service = new AgentSettingsService(settings, runtimes);

    await expect(
      service.update({ autoCompactionEnabled: false }),
    ).resolves.toEqual({ autoCompactionEnabled: false });
    expect(settings.setAutoCompactionEnabled).toHaveBeenCalledWith(false);
    expect(runtimes.reloadAgentSettings).toHaveBeenCalledOnce();
  });

  it("does not refresh runtimes when persistence fails", async () => {
    const failure = new Error("write failed");
    const settings: AgentSettingsStore = {
      read: vi.fn(async () => ({ autoCompactionEnabled: true })),
      setAutoCompactionEnabled: vi.fn(async () => {
        throw failure;
      }),
    };
    const runtimes = runtimeRegistryStub();
    const service = new AgentSettingsService(settings, runtimes);

    await expect(
      service.update({ autoCompactionEnabled: false }),
    ).rejects.toBe(failure);
    expect(runtimes.reloadAgentSettings).not.toHaveBeenCalled();
  });
});

function runtimeRegistryStub(): AgentRuntimeRegistry {
  return {
    get: vi.fn(),
    getOrStart: vi.fn(),
    register: vi.fn(),
    remove: vi.fn(),
    destroy: vi.fn(),
    touch: vi.fn(),
    invalidateModelConfig: vi.fn(),
    invalidateWebAccessConfig: vi.fn(),
    reloadAgentSettings: vi.fn(async () => {}),
  };
}
