import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./file-tree.tsx", import.meta.url)),
  "utf8",
);

describe("file tree", () => {
  it("keeps existing file operations without adding search", () => {
    expect(source).toContain(
      'import { Alert, Button, Skeleton, Tooltip } from "antd"',
    );
    expect(source).toContain("loadDirectory");
    expect(source).toContain("onOpenFile");
    expect(source).toContain("onAtMention");
    expect(source).toContain("t.files.refreshFiles");
    expect(source).not.toContain("<Input");
    expect(source).not.toContain("placeholder=");
    expect(source).toContain("compactGeneratedEntries");
    expect(source).toContain("isGeneratedArtifactsPath");
    expect(source).toContain("<FileNodes");
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

  it("uses standard loading and error feedback without replacing the domain tree", () => {
    expect(source).toContain("<Skeleton");
    expect(source).toContain("<Alert");
    expect(source).toContain("loading.has(cwd)");
    expect(source).toContain("<Tooltip");
    expect(source).not.toContain("<Tree");
  });

  it("keeps file opening and mention actions as sibling controls", () => {
    expect(source).toContain('aria-label={entry.name}');
    expect(source).toContain('type="button"');
    expect(source).not.toContain('role="button"');
    expect(source).not.toContain('tabIndex={0}');
  });
});
