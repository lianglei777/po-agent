import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./use-chat-controller.ts", import.meta.url)),
  "utf8",
);

describe("chat runtime state synchronization", () => {
  it("restores Agent state from the turn snapshot", () => {
    expect(source).toContain("loadAgentTurnSnapshot(session.id)");
    expect(source).toContain("syncRuntimeState(turnSnapshot.agent)");
    expect(source).not.toContain("generationRuns");
    expect(source).not.toContain("submitAgentTurn");
  });

  it("ignores a session load after its effect loses ownership", () => {
    expect(source).toContain("let active = true");
    expect(source).toContain("if (!active) return");
    expect(source).toContain("active = false");
  });
});
