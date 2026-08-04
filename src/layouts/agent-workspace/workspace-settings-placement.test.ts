import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const topBarSource = readFileSync(
  fileURLToPath(new URL("./workspace-top-bar.tsx", import.meta.url)),
  "utf8",
);
const workspaceSource = readFileSync(
  fileURLToPath(new URL("./agent-workspace.tsx", import.meta.url)),
  "utf8",
);
const sidebarSource = readFileSync(
  fileURLToPath(new URL("./workspace-sidebar.tsx", import.meta.url)),
  "utf8",
);
const settingsSource = readFileSync(
  fileURLToPath(new URL("./workspace-settings.tsx", import.meta.url)),
  "utf8",
);
const projectPanelSource = readFileSync(
  fileURLToPath(new URL("./project-panel.tsx", import.meta.url)),
  "utf8",
);
const saveIndicatorSource = readFileSync(
  fileURLToPath(
    new URL("./model-provider-save-indicator.tsx", import.meta.url),
  ),
  "utf8",
);

describe("workspace composition", () => {
  it("keeps global settings in the primary navigation and project tools in the dock", () => {
    expect(sidebarSource).toContain("t.workspace.settings");
    expect(projectPanelSource).toContain("t.workspace.skills");
    expect(projectPanelSource).toContain("<SkillsPage");
    expect(projectPanelSource).toContain("ProjectPanelDock");
    expect(topBarSource).not.toContain("Cpu");
    expect(topBarSource).not.toContain("Moon");
  });

  it("keeps Chat mounted behind an exclusive full-screen settings surface", () => {
    expect(workspaceSource).toContain('activeView === "chat"');
    expect(workspaceSource).toContain('"flex h-full min-h-0 min-w-0"');
    expect(workspaceSource).toContain('activeView === "model-provider"');
    expect(workspaceSource).toContain("<WorkspaceSettings");
    expect(workspaceSource).toContain("onBack={() =>");
    expect(settingsSource).toContain("<ModelProviderPage");
    expect(settingsSource).toContain("<SystemPromptWorkbench");
    expect(settingsSource).toContain(
      "onDirtyChange={onSystemPromptDirtyChange}",
    );
    expect(settingsSource).toContain("t.settings.exitSettings");
    expect(settingsSource).toContain("h-full min-h-0 bg-[var(--workspace-bg)]");
    expect(workspaceSource).not.toContain("<ModelsConfigDialog");
    expect(workspaceSource).not.toContain("<SkillsConfigDialog");
  });

  it("shows the project dock only for Chat and preserves the active inspector", () => {
    expect(workspaceSource).toContain('activeView === "chat"');
    expect(workspaceSource).toContain("showProjectDock");
    expect(workspaceSource).toContain("projectPanelOpen");
    expect(workspaceSource).toContain("activeTab={projectPanelTab}");
    expect(workspaceSource).toContain("onOpenFile={handleOpenFile}");
    expect(workspaceSource).toContain("refreshKey={explorerRefreshKey}");
    expect(workspaceSource).toContain(
      "flex flex-none overflow-hidden rounded-l-sm rounded-r-xl bg-canvas",
    );
    expect(workspaceSource).not.toContain('className="mx-px"');
  });

  it("places Model Provider save feedback in the settings header", () => {
    expect(topBarSource).not.toContain("modelProviderSaveStatus");
    expect(settingsSource).toContain("<ModelProviderSaveIndicator");
    expect(saveIndicatorSource).toContain('role="status"');
    expect(saveIndicatorSource).toContain('role="alert"');
    expect(workspaceSource).toContain(
      "modelProviderSaveStatus={modelProviderSaveStatus}",
    );
    expect(workspaceSource).toContain(
      "onModelSaveStatusChange={setModelProviderSaveStatus}",
    );
  });

  it("uses a desktop-only workspace floor", () => {
    expect(workspaceSource).toContain("min-w-[1024px]");
    expect(workspaceSource).not.toContain("max-[640px]");
  });
});
