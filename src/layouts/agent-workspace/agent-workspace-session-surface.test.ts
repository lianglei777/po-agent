import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workspaceSource = readFileSync(
  fileURLToPath(new URL("./agent-workspace.tsx", import.meta.url)),
  "utf8",
);
const topBarSource = readFileSync(
  fileURLToPath(new URL("./workspace-top-bar.tsx", import.meta.url)),
  "utf8",
);
const storeSource = readFileSync(
  fileURLToPath(new URL("./state/workspace-store.ts", import.meta.url)),
  "utf8",
);

describe("unified session surfaces", () => {
  it("creates a normal session without a fixed mode selection dialog", () => {
    expect(workspaceSource).toContain(
      'requestNavigation("chat", () => handleNewSession(temporaryId, cwd))',
    );
    expect(workspaceSource).not.toContain("newSessionChoice");
    expect(workspaceSource).not.toContain("createContentGenerationSession");
  });

  it("lets persisted chat sessions switch between chat and generation", () => {
    expect(storeSource).toContain('sessionSurface: "chat"');
    expect(storeSource).toContain("setSessionSurface");
    expect(workspaceSource).toContain('sessionSurface === "generation"');
    expect(workspaceSource).toContain("onSessionSurfaceChange");
    expect(topBarSource).toContain("<Segmented");
    expect(topBarSource).toContain("t.workspace.sessionView");
    expect(topBarSource).toContain('value: "chat" as const');
    expect(topBarSource).toContain('value: "generation" as const');
  });

  it("does not special-case legacy generation-only sessions", () => {
    expect(storeSource).toContain('sessionSurface: "chat"');
    expect(workspaceSource).toContain("sessionSurface={selectedSession ? sessionSurface : undefined}");
    expect(workspaceSource).not.toContain('mode === "content-generation"');
  });
});
