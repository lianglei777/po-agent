import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./file-panel.tsx", import.meta.url)),
  "utf8",
);

describe("file panel visual contract", () => {
  it("uses the panel hierarchy without inventing context content", () => {
    expect(source).toContain("bg-canvas");
    expect(source).not.toContain("bg-panel");
    expect(source).toContain("border-line-subtle");
    expect(source).toContain("t.files.noFileOpen");
    expect(source).not.toContain("Context Inspector");
    expect(source).not.toContain("Active Files");
    expect(source).not.toContain("Card");
  });

  it("uses the file tree as the primary surface and opens previews beside it", () => {
    expect(source).toContain("<FileTree");
    expect(source).toContain("cwd");
    expect(source.indexOf("<FileTree")).toBeLessThan(
      source.indexOf("<LoadedFile"),
    );
    expect(source).toContain('file ?');
    expect(source).toContain(': "w-full"');
    expect(source).not.toContain("Tabs");
    expect(source).not.toContain("Editor");
    expect(source).not.toContain("Search");
  });

  it("uses the same quiet header and rail widths as settings", () => {
    expect(source).toContain('h-9 flex-none');
    expect(source).toContain('border-line-subtle bg-canvas');
    expect(source).toContain('w-[clamp(160px,42%,224px)]');
  });

  it("shows the current project-relative file hierarchy without a shortcut action", () => {
    expect(source).toContain("relativePath(cwd, currentPath)");
    expect(source).toContain("t.files.currentFilePath");
    expect(source).toContain("<ChevronRight");
    expect(source).not.toContain("headerAction");
  });
});
