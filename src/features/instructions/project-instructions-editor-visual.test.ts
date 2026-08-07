import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./project-instructions-editor.tsx", import.meta.url)),
  "utf8",
);

describe("project instructions editor visual contract", () => {
  it("offers an explicit apply action after the saved file becomes stale", () => {
    expect(source).toContain("agentId && needsApply");
    expect(source).toContain("reloadInstructions(agentId)");
    expect(source).toContain("t.instructions.applyToSession");
    expect(source).toContain("onApplied?.()");
    expect(source).toContain("!needsApply && applySuccess");
    expect(source).toContain("t.instructions.applied");
  });

  it("does not apply unsaved edits or reload a busy session", () => {
    expect(source).toContain("disabled={dirty || isRunning || applying}");
    expect(source).toContain("t.instructions.saveBeforeApply");
    expect(source).toContain("t.instructions.reloadUnavailableWhileRunning");
  });

  it("isolates and cancels project-specific instruction loads", () => {
    expect(source).toContain("key={props.cwd}");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("getProjectInstructions(cwd, signal)");
    expect(source).toContain("controller.abort()");
  });
});
