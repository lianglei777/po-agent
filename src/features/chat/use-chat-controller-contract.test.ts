import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./use-chat-controller.ts", import.meta.url)),
  "utf8",
);

describe("chat runtime state synchronization", () => {
  it("restores runtime state when an opened session is not loaded", () => {
    expect(source).toContain('type: "get_state"');
    expect(source).toContain("syncRuntimeState(runtimeState)");
  });

  it("ignores a session load after its effect loses ownership", () => {
    expect(source).toContain("let active = true");
    expect(source).toContain("if (!active) return");
    expect(source).toContain("active = false");
  });
});
