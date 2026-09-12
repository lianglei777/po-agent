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

describe("chat session surface", () => {
  it("creates a normal session without a fixed mode selection dialog", () => {
    expect(workspaceSource).toContain(
      'requestNavigation("chat", () => handleNewSession(temporaryId, cwd))',
    );
    expect(workspaceSource).not.toContain("newSessionChoice");
    expect(workspaceSource).not.toContain("createContentGenerationSession");
  });

  it("keeps external sessions on the chat surface", () => {
    expect(storeSource).not.toContain("sessionSurface");
    expect(workspaceSource).not.toContain("ContentGenerationCenter");
    expect(workspaceSource).not.toContain("onSessionSurfaceChange");
    expect(topBarSource).not.toContain("<Segmented");
  });

  it("does not special-case legacy generation-only sessions", () => {
    expect(storeSource).not.toContain("sessionSurface");
    expect(workspaceSource).not.toContain('mode === "content-generation"');
  });
});
