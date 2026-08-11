import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadAgentSettings,
  updateAgentSettings,
} from "./agent-settings-api";

afterEach(() => vi.unstubAllGlobals());

describe("Agent settings API", () => {
  it("loads the global Agent settings", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ autoCompactionEnabled: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadAgentSettings()).resolves.toEqual({
      autoCompactionEnabled: true,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/agent-settings", undefined);
  });

  it("patches the auto-compaction preference", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ autoCompactionEnabled: false }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateAgentSettings({ autoCompactionEnabled: false });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agent-settings",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ autoCompactionEnabled: false }),
      }),
    );
  });
});
