import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./system-prompt-workbench.tsx", import.meta.url)),
  "utf8",
);

describe("system prompt settings workbench visual contract", () => {
  it("uses a source navigator and one focused content pane", () => {
    expect(source).toContain("grid-cols-[14rem_minmax(0,1fr)]");
    expect(source).toContain("<aside");
    expect(source).toContain("InstructionsStoreProvider");
    expect(source).toContain("useInstructionsStore");
    expect(source).toContain('activeView === "effective"');
    expect(source).toContain("<EffectivePromptView");
    expect(source).toContain("<GlobalPromptEditor");
    expect(source).toContain("<ProjectInstructionsView");
  });

  it("keeps session freshness visible above the workbench", () => {
    expect(source.indexOf("sessionOutdated")).toBeLessThan(
      source.indexOf("grid-cols-[14rem_minmax(0,1fr)]"),
    );
    expect(source).toContain("reloadUnavailableWhileRunning");
  });

  it("previews project instructions before explicitly opening the file workspace", () => {
    expect(source).toContain('onClick={() => setActiveView("project")}');
    expect(source).toContain('activeView === "project"');
    expect(source).toContain("handleOpenProjectInstructions");
    expect(source).toContain("onOpenProjectInstructions()");
    expect(source).toContain("editInFileWorkspace");
    expect(source).not.toContain("saveProjectInstructions");
    expect(source).not.toContain("deleteProjectInstructions");
  });

  it("reports unsaved global edits to the owning settings surface", () => {
    expect(source).toContain("onDirtyChange?.(globalDirty)");
    expect(source).toContain("onDirtyChange?.(false)");
  });

  it("requires confirmation before deleting the global file", () => {
    expect(source).toContain("showDeleteConfirm");
    expect(source).toContain("deleteGlobalTitle");
  });

  it("renders directly inside Settings and gives the active content the scroll area", () => {
    expect(source).toContain("<main");
    expect(source).toContain("flex min-h-0 min-w-0 flex-1 flex-col");
    expect(source).toContain("<footer");
    expect(source).not.toContain("h-[min(46rem,85vh)]");
    expect(source).toContain('ScrollArea className="min-h-0 flex-1"');
  });
});
