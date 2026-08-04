"use client";

import { FileText, PanelRightClose, Settings2, Sparkles } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FilePanel, type OpenFile } from "@/features/files/file-panel";
import { SkillsPage } from "@/features/skills/skills-page";
import { useI18n } from "@/i18n/use-i18n";

export type ProjectPanelTab = "files" | "skills" | "settings";

const PROJECT_PANEL_TABS: ProjectPanelTab[] = ["files", "skills", "settings"];

export function ProjectPanelDock({
  activeTab,
  open,
  onSelect,
}: {
  activeTab: ProjectPanelTab;
  open: boolean;
  onSelect: (tab: ProjectPanelTab) => void;
}) {
  const { t } = useI18n();

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    tab: ProjectPanelTab,
  ) {
    const current = PROJECT_PANEL_TABS.indexOf(tab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowUp") {
      nextIndex =
        (current - 1 + PROJECT_PANEL_TABS.length) % PROJECT_PANEL_TABS.length;
    } else if (event.key === "ArrowDown") {
      nextIndex = (current + 1) % PROJECT_PANEL_TABS.length;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = PROJECT_PANEL_TABS[nextIndex];
    onSelect(next);
    document.getElementById(`project-panel-${next}-tab`)?.focus();
  }

  return (
    <aside
      aria-label={t.workspace.projectTools}
      className="flex h-full w-[44px] flex-none flex-col items-center bg-canvas py-2"
    >
      <div
        aria-label={t.workspace.projectPanel}
        aria-orientation="vertical"
        className="flex flex-col gap-1"
        role="tablist"
      >
        {PROJECT_PANEL_TABS.map((tab) => {
          const selected = open && activeTab === tab;
          const label = getTabLabel(tab, t);
          return (
            <Tooltip key={tab}>
              <TooltipTrigger asChild>
                <Button
                  aria-controls="project-panel-content"
                  aria-label={label}
                  aria-selected={selected}
                  className="relative size-8"
                  id={`project-panel-${tab}-tab`}
                  onClick={() => onSelect(tab)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab)}
                  role="tab"
                  size="icon-sm"
                  tabIndex={selected ? 0 : -1}
                  type="button"
                  variant={selected ? "secondary" : "ghost"}
                >
                  {tab === "files" ? (
                    <FileText />
                  ) : tab === "skills" ? (
                    <Sparkles />
                  ) : (
                    <Settings2 />
                  )}
                  {selected ? (
                    <span className="absolute top-1/2 -left-1.5 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </aside>
  );
}

export function ProjectPanel({
  activeTab,
  cwd,
  file,
  onAtMention,
  onClose,
  onOpenFile,
  projectName,
  refreshKey = 0,
  settingsContent,
}: {
  activeTab: ProjectPanelTab;
  cwd: string;
  file: OpenFile | null;
  onAtMention?: (path: string) => void;
  onClose: () => void;
  onOpenFile?: (path: string, name: string, contentType?: string) => void;
  projectName: string;
  refreshKey?: number;
  settingsContent?: ReactNode;
}) {
  const { t } = useI18n();
  const title = getTabLabel(activeTab, t);

  return (
    <aside className="flex h-full min-w-0 flex-col bg-canvas">
      <header className="flex h-11 flex-none items-center border-b border-line-subtle px-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-primary">
            {title}
          </h2>
          <p className="truncate text-caption text-dim">{projectName}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t.workspace.hideProjectPanel}
              onClick={onClose}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <PanelRightClose />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t.workspace.hideProjectPanel}
          </TooltipContent>
        </Tooltip>
      </header>

      <div
        aria-labelledby={`project-panel-${activeTab}-tab`}
        className="flex min-h-0 flex-1"
        id="project-panel-content"
        role="tabpanel"
      >
        {activeTab === "files" ? (
          <FilePanel
            cwd={cwd}
            file={file}
            onAtMention={onAtMention}
            onOpenFile={onOpenFile}
            refreshKey={refreshKey}
          />
        ) : activeTab === "skills" ? (
          <SkillsPage cwd={cwd} key={cwd} projectName={projectName} />
        ) : (
          settingsContent
        )}
      </div>
    </aside>
  );
}

function getTabLabel(tab: ProjectPanelTab, t: ReturnType<typeof useI18n>["t"]) {
  if (tab === "files") return t.files.files;
  if (tab === "skills") return t.workspace.skills;
  return t.workspace.projectSettings;
}
