import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sessionTreeSource = readFileSync(
  fileURLToPath(new URL("./session-tree.tsx", import.meta.url)),
  "utf8",
);
const conversationSidebarSource = readFileSync(
  fileURLToPath(new URL("./conversation-sidebar.tsx", import.meta.url)),
  "utf8",
);

describe("session tree destructive actions", () => {
  it("uses the shared dialog instead of replacing the session row", () => {
    expect(sessionTreeSource).toContain("<Dialog");
    expect(sessionTreeSource).toContain("<DialogContent");
    expect(sessionTreeSource).toContain("<DialogDescription");
    expect(sessionTreeSource).not.toContain("if (confirming)");
    expect(sessionTreeSource).not.toContain("bg-destructive/8");
  });

  it("keeps row actions stable at narrow sidebar widths", () => {
    // 操作按钮使用绝对定位叠加在文本之上，确保窄 sidebar 也能完整显示
    expect(sessionTreeSource).toContain(
      "absolute right-1 top-1/2 -translate-y-1/2",
    );
    // hover 时通过 display 切换显示按钮，不使用透明度渐变
    expect(sessionTreeSource).toContain("hidden bg-inherit group-hover:flex");
    expect(sessionTreeSource).not.toContain("opacity-0");
    expect(sessionTreeSource).not.toContain("group-hover:opacity-100");
    expect(sessionTreeSource).not.toContain(
      "hidden items-center group-hover:flex",
    );
    expect(conversationSidebarSource).toContain(
      'viewportClassName="[&>div]:block!"',
    );
  });

  it("uses a dropdown menu for row actions", () => {
    // hover 时显示 "..." 按钮，点击展开菜单提供重命名和删除选项
    expect(sessionTreeSource).toContain("MoreHorizontal");
    expect(sessionTreeSource).toContain("<DropdownMenu");
    expect(sessionTreeSource).toContain("<DropdownMenuTrigger");
    expect(sessionTreeSource).toContain("<DropdownMenuContent");
    expect(sessionTreeSource).toContain("<DropdownMenuItem");
    expect(sessionTreeSource).toContain("t.sessions.sessionActions");
    // 菜单项保留图标 + 文字，维持可发现性
    expect(sessionTreeSource).toContain("<Pencil");
    expect(sessionTreeSource).toContain("<Trash2");
    // 支持双击行标题直接进入重命名模式
    expect(sessionTreeSource).toContain("onDoubleClick");
  });

  it("uses the shared start-aligned menu behavior in the session sidebar", () => {
    expect(sessionTreeSource).toContain("<DropdownMenuContent");
    expect(sessionTreeSource).toContain('align="start"');
  });

  it("uses compact single-line Codex-style session rows", () => {
    expect(sessionTreeSource).toContain('h-9 min-w-0');
    expect(sessionTreeSource).toContain('min-w-0 flex-1 truncate text-xs');
    expect(sessionTreeSource).toContain(
      'ml-2 min-w-0 max-w-28 flex-none truncate text-caption',
    );
    expect(sessionTreeSource).toContain("max-w-28");
    expect(sessionTreeSource).toContain("truncate");
    expect(sessionTreeSource).not.toContain('h-[44px]');
    expect(sessionTreeSource).not.toContain('mt-0.5 truncate');
  });

  it("defaults focus to cancel and uses explicit deletion copy", () => {
    expect(sessionTreeSource).toContain("t.sessions.deleteSessionTitle");
    expect(sessionTreeSource).toContain("t.sessions.deleteSessionDescription");
    expect(sessionTreeSource).toContain("t.sessions.deleteSessionAction");
    expect(sessionTreeSource).toContain("autoFocus");
  });
});
