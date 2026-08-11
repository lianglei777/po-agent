import { describe, expect, it, vi } from "vitest";
import { PiAgentSettingsStore } from "./pi-agent-settings-store";

describe("PiAgentSettingsStore", () => {
  it("reads the SDK default when the global preference is absent", async () => {
    const store = new PiAgentSettingsStore({
      getGlobalSettings: () => ({}),
      setCompactionEnabled: vi.fn(),
      flush: vi.fn(async () => {}),
    });

    await expect(store.read()).resolves.toEqual({
      autoCompactionEnabled: true,
    });
  });

  it("flushes the persisted preference before completing", async () => {
    const setCompactionEnabled = vi.fn();
    const flush = vi.fn(async () => {});
    const store = new PiAgentSettingsStore({
      getGlobalSettings: () => ({ compaction: { enabled: false } }),
      setCompactionEnabled,
      flush,
    });

    await store.setAutoCompactionEnabled(false);

    expect(setCompactionEnabled).toHaveBeenCalledWith(false);
    expect(flush).toHaveBeenCalledOnce();
  });
});
