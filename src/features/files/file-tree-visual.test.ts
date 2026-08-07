import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./file-tree.tsx", import.meta.url)),
  "utf8",
);

describe("file tree", () => {
  it("keeps existing file operations without adding search", () => {
    expect(source).toContain("loadDirectory");
    expect(source).toContain("onOpenFile");
    expect(source).toContain("onAtMention");
    expect(source).toContain("t.files.refreshFiles");
    expect(source).not.toContain("<Input");
    expect(source).not.toContain("placeholder=");
    expect(source).toContain("compactGeneratedEntries");
    expect(source).toContain("isGeneratedArtifactsPath");
  });

  it("uses the white canvas background", () => {
    expect(source).toContain("bg-canvas");
    expect(source).toContain("min-w-0 flex-1 flex-col overflow-hidden");
    expect(source).not.toContain("bg-panel");
  });

  it("cancels directory requests when the project tree changes", () => {
    expect(source).toContain("treeRequestRef.current.abort()");
    expect(source).toContain("loadDirectory(path, signal)");
    expect(source).toContain("if (signal.aborted) return null");
  });
});
