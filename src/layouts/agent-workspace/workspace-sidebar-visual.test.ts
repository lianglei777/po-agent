import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./workspace-sidebar.tsx", import.meta.url)),
  "utf8",
);
const projectSource = readFileSync(
  fileURLToPath(
    new URL("../../features/sessions/project-navigation.tsx", import.meta.url),
  ),
  "utf8",
);
const conversationSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../features/sessions/conversation-sidebar.tsx",
      import.meta.url,
    ),
  ),
  "utf8",
);
const topBarSource = readFileSync(
  fileURLToPath(new URL("./workspace-top-bar.tsx", import.meta.url)),
  "utf8",
);
const workspaceSource = readFileSync(
  fileURLToPath(new URL("./agent-workspace.tsx", import.meta.url)),
  "utf8",
);
const resizeHandleSource = readFileSync(
  fileURLToPath(
    new URL("../../components/ui/resize-handle.tsx", import.meta.url),
  ),
  "utf8",
);

describe("workspace primary navigation", () => {
  it("separates project navigation from project conversations", () => {
    expect(source).toContain("<ProjectNavigation");
    expect(source).not.toContain("<SessionTree");
    expect(conversationSource).toContain("<SessionTree");
    expect(conversationSource).toContain("t.sessions.searchSessions");
    expect(projectSource).toContain("navigation.projects.map");
  });

  it("keeps icon-only settings and locale actions in the bottom group", () => {
    expect(source).toContain("mt-auto");
    expect(source).toContain("t.workspace.settings");
    expect(source).toContain("setLocale(nextLocale)");
    expect(source).toContain("border-line-strong");
    expect(source).toContain("flex items-center");
    expect(source).not.toContain("onOpenSystemPrompt");
    expect(source).toContain("<TooltipContent");
    expect(topBarSource).not.toContain("onOpenSystemPrompt");
  });

  it("explains project-dependent Files and Skills actions", () => {
    expect(source).toContain("t.workspace.selectProjectForSkills");
    expect(source).toContain("t.workspace.selectProjectForFiles");
    expect(source).toContain("aria-disabled");
    expect(source).toContain("disabledReason ?? label");
  });

  it("supports compact and expanded navigation without glass effects", () => {
    expect(source).toContain('compact ? "px-1.5 py-2.5" : "px-3 py-3"');
    expect(source).toContain("t.workspace.expandPrimaryNavigation");
    expect(source).toContain("t.workspace.collapsePrimaryNavigation");
    expect(source).not.toContain("backdrop-blur");
    expect(workspaceSource).toContain("bg-[var(--workspace-bg)]");
    expect(topBarSource).toContain("border-line-subtle bg-canvas");
  });

  it("uses surface contrast instead of resting vertical divider lines", () => {
    expect(conversationSource).not.toContain("border-l");
    expect(conversationSource).not.toContain("border-r");
    expect(workspaceSource).toContain(
      "flex min-w-0 flex-1 overflow-hidden rounded-xl bg-canvas",
    );
    expect(resizeHandleSource).toContain("bg-transparent");
  });
});
