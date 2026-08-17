import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./use-chat-controller.ts", import.meta.url)),
  "utf8",
);

describe("chat runtime state synchronization", () => {
  it("uploads assets before submitting one server-orchestrated Agent turn", () => {
    const uploadIndex = source.indexOf("await uploadChatGenerationAsset(");
    const submitIndex = source.indexOf("await submitAgentTurn(");

    expect(uploadIndex).toBeGreaterThan(-1);
    expect(submitIndex).toBeGreaterThan(uploadIndex);
    expect(source).not.toContain("await planGenerationTurn({");
    expect(source).not.toContain("toolName: planned.route.capability");
    expect(source).toContain("const turnId = crypto.randomUUID()");
    expect(source).toContain("turnId,");
  });

  it("renders a server-created generation run without waiting for Agent streaming", () => {
    expect(source).toContain('result.intent === "generation"');
    expect(source).toContain("result.run");
    expect(source).toContain("closeSource()");
  });

  it("restores Agent and generation state from one turn snapshot", () => {
    expect(source).toContain("loadAgentTurnSnapshot(session.id)");
    expect(source).toContain("syncRuntimeState(turnSnapshot.agent)");
    expect(source).toContain("setGenerationRuns(turnSnapshot.generationRuns)");
  });

  it("ignores a session load after its effect loses ownership", () => {
    expect(source).toContain("let active = true");
    expect(source).toContain("if (!active) return");
    expect(source).toContain("active = false");
  });
});
