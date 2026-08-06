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

describe("unified session surfaces", () => {
  it("creates a normal session without a fixed mode selection dialog", () => {
    expect(workspaceSource).toContain(
      'requestNavigation("chat", () => handleNewSession(temporaryId, cwd))',
    );
    expect(workspaceSource).not.toContain("newSessionChoice");
    expect(workspaceSource).not.toContain("createContentGenerationSession");
  });

  it("lets persisted chat sessions switch between chat and generation", () => {
    expect(workspaceSource).toContain('useState<"chat" | "generation">("chat")');
    expect(workspaceSource).toContain('sessionSurface === "generation"');
    expect(workspaceSource).toContain("onSessionSurfaceChange");
    expect(topBarSource).toContain('role="tablist"');
    expect(topBarSource).toContain('role="tab"');
  });

  it("keeps legacy generation-only sessions on their compatible surface", () => {
    expect(workspaceSource).toContain(
      'session.mode === "content-generation" ? "generation" : "chat"',
    );
    expect(workspaceSource).toContain(
      'selectedSession?.mode === "content-generation"',
    );
  });
});
