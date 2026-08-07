import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const picker = readFileSync(
  `${root}/src/features/sessions/project-picker.tsx`,
  "utf8",
);
const english = readFileSync(
  `${root}/src/i18n/dictionaries/en.ts`,
  "utf8",
);
const chinese = readFileSync(
  `${root}/src/i18n/dictionaries/zh.ts`,
  "utf8",
);

describe("project picker interaction contract", () => {
  it("keeps one stable dialog and uses desktop directory selection when available", () => {
    expect(picker).toContain("selectProjectDirectory");
    expect(picker).toContain("addSelectedProject");
    expect(picker).toContain("<Input");
    expect(picker).toContain("autoFocus");
    expect(picker).toContain('htmlType="submit"');
    expect(picker).toContain("max-h-[calc(100vh-2rem)]");
    expect(picker).toContain("{!browseOpen ? (");
    expect(picker).toMatch(/!browseOpen\s\?\s\([\s\S]*<DialogDescription>/);
    expect(picker).toContain('setBrowseOpen((value) => !value)');
    expect(picker).not.toContain("result?.current ?? t.sessions.loadingDirectories");
    expect(picker).not.toContain("result?.breadcrumbs.map");
  });

  it("provides matching English and Chinese copy", () => {
    for (const dictionary of [english, chinese]) {
      expect(dictionary).toContain("projectPath:");
      expect(dictionary).toContain("projectPathHint:");
      expect(dictionary).toContain("browseDirectories:");
      expect(dictionary).toContain("backToPathEntry:");
      expect(dictionary).toContain("addProject:");
    }
  });
});
