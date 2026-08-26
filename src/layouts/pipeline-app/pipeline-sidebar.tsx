"use client";

import { useState } from "react";
import { Tooltip } from "antd";
import {
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Project,
} from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { useWorkspaceMode } from "@/layouts/workspace-mode-state";

export type PipelineSidebarItemId = "projects";

export type PipelineSidebarProps = {
  activeItem: PipelineSidebarItemId;
  onItemChange: (itemId: PipelineSidebarItemId) => void;
  onNewProject: () => void;
};

const SIDEBAR_ITEMS: Array<{
  id: PipelineSidebarItemId;
  labelKey: "navProjects";
  Icon: typeof Project;
}> = [
  { id: "projects", labelKey: "navProjects", Icon: Project },
];

export function PipelineSidebar({
  activeItem,
  onItemChange,
  onNewProject,
}: PipelineSidebarProps) {
  const { t } = useI18n();
  const setMode = useWorkspaceMode((state) => state.setMode);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={
        "flex h-full shrink-0 flex-col border-r border-[var(--pl-border)] bg-[var(--pl-sidebar)] transition-[width] duration-200 " +
        (collapsed ? "w-14" : "w-[216px]")
      }
      data-testid="pipeline-sidebar"
    >
      <header
        className={
          "flex min-h-12 border-b border-[var(--pl-border)] px-3 py-2 " +
          (collapsed ? "flex-col items-center gap-2" : "items-center justify-between gap-2")
        }
      >
        {!collapsed ? (
          <span className="min-w-0 truncate text-base font-semibold tracking-[-0.02em] text-[var(--pl-text)]">
            {t.pipeline.brandName}
          </span>
        ) : null}

        <div className={"flex shrink-0 " + (collapsed ? "flex-col gap-1" : "gap-1")}>
          <Tooltip mouseEnterDelay={0.35} placement="bottom" title={t.pipeline.backToAgent}>
            <button
              type="button"
              onClick={() => setMode("agent")}
              aria-label={t.pipeline.backToAgent}
              className="flex size-8 items-center justify-center rounded-lg text-[var(--pl-text-secondary)] transition-colors hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pl-accent)]"
            >
              <ArrowLeft className="size-[17px]" />
            </button>
          </Tooltip>
          <Tooltip
            mouseEnterDelay={0.35}
            placement="bottom"
            title={collapsed ? t.pipeline.expandSidebar : t.pipeline.collapseSidebar}
          >
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? t.pipeline.expandSidebar : t.pipeline.collapseSidebar}
              aria-expanded={!collapsed}
              className="flex size-8 items-center justify-center rounded-lg text-[var(--pl-text-secondary)] transition-colors hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pl-accent)]"
            >
              {collapsed ? <PanelLeftOpen className="size-[17px]" /> : <PanelLeftClose className="size-[17px]" />}
            </button>
          </Tooltip>
        </div>
      </header>

      <div className={collapsed ? "px-2 py-3" : "px-3 py-3"}>
        <Tooltip placement="right" title={collapsed ? t.pipeline.newProject : undefined}>
          <button
            type="button"
            onClick={onNewProject}
            aria-label={t.pipeline.newProject}
            className={
              "flex min-h-9 w-full items-center justify-center rounded-lg bg-[var(--pl-accent)] font-medium text-white transition-colors hover:bg-[var(--pl-accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pl-accent-hover)] " +
              (collapsed ? "px-0" : "gap-2 px-4")
            }
          >
            <Plus className="size-[18px]" />
            {!collapsed ? <span>{t.pipeline.newProject}</span> : null}
          </button>
        </Tooltip>
      </div>

      <nav className="px-3" aria-label={t.pipeline.sidebarNavigation}>
        <div className="flex flex-col gap-1">
          {SIDEBAR_ITEMS.map(({ id, labelKey, Icon }) => {
            const active = activeItem === id;
            const label = t.pipeline[labelKey];
            const button = (
              <button
                type="button"
                onClick={() => onItemChange(id)}
                aria-current={active ? "page" : undefined}
                className={
                  "flex min-h-9 w-full items-center rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pl-accent)] " +
                  (collapsed ? "justify-center px-2" : "gap-3 px-3") +
                  (active
                    ? " bg-[var(--pl-accent-soft)] text-[var(--pl-text)]"
                    : " text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]")
                }
              >
                <Icon className={"size-[17px] shrink-0 " + (active ? "text-[var(--pl-accent)]" : "text-[var(--pl-text-muted)]")} />
                {!collapsed ? <span className="truncate text-sm">{label}</span> : null}
              </button>
            );

            return collapsed ? (
              <Tooltip key={id} mouseEnterDelay={0.35} placement="right" title={label}>
                {button}
              </Tooltip>
            ) : (
              <div key={id}>{button}</div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
