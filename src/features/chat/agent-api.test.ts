import { afterEach, describe, expect, it, vi } from "vitest";
import { createAgent, sendCommand } from "./agent-api";

afterEach(() => vi.unstubAllGlobals());

describe("agent API adapter", () => {
  it("creates a configured runtime without sending the initial prompt", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        {
          void _input;
          void _init;
          return Response.json({ sessionId: "new-session" });
        },
    );
    vi.stubGlobal("fetch", fetchMock);
    await createAgent({
      cwd: "C:\\work",
      provider: "provider",
      modelId: "model",
      thinkingLevel: "high",
      toolNames: ["read"],
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      cwd: "C:\\work",
      provider: "provider",
      modelId: "model",
      thinkingLevel: "high",
      toolNames: ["read"],
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty(
      "message",
    );
  });

  it.each([
    { type: "fork", entryId: "entry" },
    { type: "navigate_tree", targetId: "leaf" },
    { type: "abort_compaction" },
    { type: "set_auto_retry", enabled: false },
  ] as const)("passes through $type commands", async (command) => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        {
          void _input;
          void _init;
          return Response.json({ success: true });
        },
    );
    vi.stubGlobal("fetch", fetchMock);
    await sendCommand("session", command);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(command);
  });
});
