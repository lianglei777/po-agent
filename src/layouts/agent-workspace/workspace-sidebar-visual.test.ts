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
    expect(source).toContain('import { Button, Tooltip } from "antd"');
    expect(source).toContain('"size-6! shrink-0! p-0!"');
    expect(source).toContain('"size-8! shrink-0! p-0!"');
    expect(source).toContain('<Settings className="size-4" />');
    expect(source).toContain('<Languages className="size-4" />');
    expect(topBarSource).not.toContain("onOpenSystemPrompt");
  });

  it("keeps project titles stable when the more action appears", () => {
    expect(projectSource).toContain("justify-start!");
    expect(projectSource).toContain("flex w-8 shrink-0 transition-opacity");
    expect(projectSource).toContain("group-hover:opacity-100");
    expect(projectSource).toContain("openProjectMenu === project.path");
    expect(projectSource).not.toContain("hidden group-hover:flex");
  });

  it("supports compact, expanded, and fully hidden navigation without glass effects", () => {
    expect(source).toContain('compact ? "px-1.5 py-2.5" : "px-3 py-3"');
    expect(source).not.toContain("t.workspace.expandPrimaryNavigation");
    expect(source).toContain("t.workspace.collapsePrimaryNavigation");
    expect(conversationSource).toContain("primaryNavigationHidden");
    expect(conversationSource).toContain(
      "t.workspace.expandPrimaryNavigation",
    );
    expect(conversationSource).toContain(
      "h-11 flex-none items-center border-b border-line-subtle",
    );
    expect(workspaceSource).toContain(
      "primaryNavigationHidden={primaryNavHidden}",
    );
    expect(workspaceSource).toContain(
      "effectivePrimaryNavWidth === HIDDEN_PRIMARY_NAV_WIDTH",
    );
    expect(source).not.toContain("backdrop-blur");
    expect(workspaceSource).toContain("bg-[var(--workspace-bg)]");
    expect(topBarSource).toContain("flex h-11 flex-none items-center bg-canvas");
  });

  it("keeps primary navigation and conversation reveal controls visually distinct", () => {
    expect(topBarSource).toContain("<PanelLeft />");
    expect(conversationSource).toContain("<PanelRight />");
    expect(topBarSource).toContain("t.workspace.expandPrimaryNavigation");
    expect(topBarSource).toContain("t.workspace.showConversations");
    expect(topBarSource).toContain("mx-1 h-4 w-px flex-none bg-line-subtle");
  });

  it("animates panel entry and exit while respecting reduced motion", () => {
    expect(workspaceSource).toContain(
      'import { AnimatePresence, motion, useReducedMotion } from "motion/react"',
    );
    expect(workspaceSource).toContain("const reduceMotion = useReducedMotion()");
    expect(workspaceSource).toContain('key="primary-navigation"');
    expect(workspaceSource).toContain('key="conversation-panel"');
    expect(workspaceSource).toContain('key="desktop-project-panel"');
    expect(workspaceSource).toContain('key="narrow-project-panel"');
    expect(workspaceSource).toContain("exit={{ opacity: 0, width: 0");
  });

  it("separates continuous surfaces with a subtle resize handle line instead of panel borders", () => {
    expect(conversationSource).not.toMatch(/\bborder-l(?:-\d|\s|")/);
    expect(conversationSource).not.toMatch(/\bborder-r(?:-\d|\s|")/);
    expect(workspaceSource).toContain(
      "flex min-w-0 flex-1 overflow-hidden rounded-l-xl rounded-r-sm bg-canvas",
    );
    expect(resizeHandleSource).toContain("bg-line-subtle");
    expect(resizeHandleSource).toContain("hover:bg-line-emphasis");
  });
});
