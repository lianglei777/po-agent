import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const css = readFileSync(`${root}/src/app/globals.css`, "utf8");
const layout = readFileSync(`${root}/src/app/layout.tsx`, "utf8");
const designSidecar = readFileSync(
  `${root}/.impeccable/design.json`,
  "utf8",
);
const chatInput = readFileSync(
  `${root}/src/features/chat/chat-input.tsx`,
  "utf8",
);
const messageView = readFileSync(
  `${root}/src/features/chat/message-view.tsx`,
  "utf8",
);
const topBar = readFileSync(
  `${root}/src/layouts/agent-workspace/workspace-top-bar.tsx`,
  "utf8",
);
const agentWorkspace = readFileSync(
  `${root}/src/layouts/agent-workspace/agent-workspace.tsx`,
  "utf8",
);

describe("visual foundation contract", () => {
  test("defines the approved Codex light tokens", () => {
    expect(css).toContain("--bg: #ffffff");
    expect(css).toContain("--workspace-bg: #f5f5f3");
    expect(css).toContain("--bg-panel: #ffffff");
    expect(css).toContain("--bg-elevated: #ffffff");
    expect(css).toContain("--sidebar-bg: #f5f5f3");
    expect(css).toContain("--conversation-bg: #ffffff");
    expect(css).toContain("--dock-bg: #ffffff");
    expect(css).toContain("--bg-subtle: #f7f7f5");
    expect(css).toContain("--bg-hover: #ecece9");
    expect(css).toContain("--bg-selected: #e7e7e3");
    expect(css).toContain("--text: #1f201e");
    expect(css).toContain("--text-muted: #686b68");
    expect(css).toContain("--text-dim: #969995");
    expect(css).toContain("--border-subtle: #ecece8");
    expect(css).toContain("--border-strong: #d9d9d4");
    expect(css).toContain("--accent: #339cff");
    expect(css).toContain("--accent-deep: #0670d3");
    expect(css).toContain("--ring: #0670d3");
    expect(css).toContain("--user-bg: #f1f1f1");
    expect(css).toContain("--tool-bg: #f7f7f7");
    expect(css).toContain("--primary-foreground: #ffffff");
    expect(css).toContain("color-scheme: light");
    expect(css).not.toContain("#10a37f");

    // 暗色主题已被移除
    expect(css).not.toContain("html.dark");
    expect(css).not.toContain("color-scheme: dark");
  });

  test("uses the Codex system sans and mono stacks without display serifs", () => {
    expect(layout).toContain("Noto_Sans_Mono");
    expect(layout).not.toContain("Playfair_Display");
    expect(layout).not.toContain("Noto_Serif_SC");
    expect(css).toContain("-apple-system, BlinkMacSystemFont");
    expect(css).not.toContain("--font-display:");
  });

  test("defines reduced-motion fallback and shared motion durations", () => {
    expect(css).toContain("--motion-fast: 150ms");
    expect(css).toContain("--motion-standard: 200ms");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms");
  });

  test("applies the visual foundation to the chat sample", () => {
    expect(topBar).toContain("truncate text-sm font-semibold text-primary");
    expect(chatInput).not.toContain("rounded-[20px]");
    expect(chatInput).not.toContain("linear-gradient");
    expect(chatInput).toContain("rounded-composer");
    expect(messageView).toContain("border-line-subtle");
  });

  test("uses a quiet canvas with distinct panel surfaces", () => {
    expect(agentWorkspace).toContain("bg-transparent");
    expect(agentWorkspace).toContain("bg-canvas");
    expect(agentWorkspace).toContain(
      "overflow-hidden rounded-xl bg-canvas",
    );
    expect(topBar).toContain("border-line-subtle bg-canvas");
    expect(topBar).not.toContain("backdrop-blur");
    expect(chatInput).not.toContain("rounded-[14px]");
    expect(chatInput).toContain("shadow-[var(--shadow-composer)]");
  });

  test("enforces the desktop workspace floor", () => {
    expect(css).toContain("min-width: 1024px");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("overflow-y: hidden");
  });

  test("keeps the design sidecar synchronized with the approved theme", () => {
    expect(designSidecar).toContain('"canonical": "#ffffff"');
    expect(designSidecar).toContain('"canonical": "#339cff"');
    expect(designSidecar).toContain("Coze-inspired neutral light");
    expect(designSidecar).not.toContain("Deep Focus");
    expect(designSidecar).not.toContain("Adaptive Workbench");
    expect(designSidecar).not.toContain("rounded-20px");
  });
});
