import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./project-panel.tsx", import.meta.url)),
  "utf8",
);

describe("project panel", () => {
  it("uses an always-available vertical dock with complete tab semantics", () => {
    expect(source).toContain('"files",');
    expect(source).toContain('"skills",');
    expect(source).toContain('"settings"');
    expect(source).toContain('aria-orientation="vertical"');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("aria-controls");
    expect(source).toContain("aria-selected");
    expect(source).toContain('event.key === "ArrowUp"');
    expect(source).toContain('event.key === "ArrowDown"');
  });

  it("passes the selected project context to Files, Skills, and settings", () => {
    expect(source).toContain("<FilePanel");
    expect(source).toContain("<SkillsPage");
    expect(source).toContain("settingsContent");
    expect(source).toContain("cwd={cwd}");
    expect(source).toContain("projectName={projectName}");
    expect(source).toContain("key={cwd}");
  });

  it("owns the close action for the expanded inspector", () => {
    expect(source).toContain("t.workspace.hideProjectPanel");
    expect(source).toContain("onClick={onClose}");
  });

  it("uses the same white canvas surface for the dock and inspector", () => {
    expect(source).toContain(
      "w-[44px] flex-none flex-col items-center bg-canvas",
    );
    expect(source).not.toContain("bg-[var(--dock-bg)]");
  });
});
