"use client";

import { useState } from "react";
import { Tooltip } from "antd";
import { ArrowLeft, Film, Layers, PanelLeftClose, PanelLeftOpen, Project } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { useWorkspaceMode } from "@/layouts/workspace-mode-state";
import type { PipelineNavId } from "./pipeline-app";

export type PipelineSidebarProps = { activeNav: PipelineNavId; onNavChange: (id: PipelineNavId) => void; };

type NavItem = { id: PipelineNavId; icon: typeof Project; labelKey: keyof ReturnType<typeof useI18n>["t"]["pipeline"]; enabled: boolean; };

const NAV_ITEMS: NavItem[] = [
  { id: "projects", icon: Project, labelKey: "navProjects", enabled: true },
  { id: "library", icon: Layers, labelKey: "navLibrary", enabled: false },
  { id: "templates", icon: Film, labelKey: "navTemplates", enabled: false },
];

export function PipelineSidebar({ activeNav, onNavChange }: PipelineSidebarProps) {
  const { t } = useI18n();
  const setMode = useWorkspaceMode((s) => s.setMode);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("pipeline-sidebar-collapsed") === "true";
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("pipeline-sidebar-collapsed", String(next));
  };

  const width = collapsed ? 56 : 208;

  return (
    <aside className="flex h-full shrink-0 flex-col border-r border-[var(--pl-border-glass)] bg-[var(--pl-surface-glass)] backdrop-blur-xl" style={{ width }} data-testid="pipeline-sidebar">
      <button type="button" onClick={() => onNavChange("projects")}
        className={"flex items-center gap-2.5 border-b border-[var(--pl-border-glass)] py-5 text-left transition-opacity hover:opacity-90 " + (collapsed ? "justify-center px-2" : "px-4")}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--pl-accent)] text-white">
          <Film className="size-4" />
        </span>
        {!collapsed && <span className="text-base font-semibold text-[var(--pl-text)]">{t.pipeline.brandName}</span>}
      </button>
      <nav className={"flex flex-1 flex-col gap-0.5 " + (collapsed ? "p-2" : "p-2.5")}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          const label = t.pipeline[item.labelKey];
          const itemCls = "group relative flex w-full items-center rounded-lg py-2.5 text-left transition-colors " +
            (collapsed ? "justify-center px-2" : "gap-3 px-3") +
            (!item.enabled ? "cursor-not-allowed opacity-40" : "") +
            (active ? " bg-[var(--pl-accent-soft)] font-semibold text-[var(--pl-text)]" : " font-medium text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]");
          const iconCls = "size-[18px] shrink-0 transition-colors " + (active ? "text-[var(--pl-accent)]" : "text-[var(--pl-text-muted)] group-hover:text-[var(--pl-text)]");
          const inner = (
            <>
              {active && <span className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r bg-[var(--pl-accent)]" />}
              <Icon className={iconCls} />
              {!collapsed && <span className="text-sm">{label}</span>}
            </>
          );
          if (collapsed || !item.enabled) {
            return (<Tooltip key={item.id} mouseEnterDelay={0.35} placement="right" title={!item.enabled ? t.pipeline.comingSoon : label}><button key={item.id} type="button" disabled={!item.enabled} onClick={() => item.enabled && onNavChange(item.id)} aria-current={active ? "page" : undefined} className={itemCls}>{inner}</button></Tooltip>);
          }
          return (<button key={item.id} type="button" onClick={() => onNavChange(item.id)} aria-current={active ? "page" : undefined} className={itemCls}>{inner}</button>);
        })}
      </nav>
      <div className="flex items-center justify-center gap-1 border-t border-[var(--pl-border-glass)] py-2">
        <Tooltip mouseEnterDelay={0.35} placement="right" title={t.pipeline.backToAgent}>
          <button type="button" onClick={() => setMode("agent")} aria-label={t.pipeline.backToAgent}
            className="flex size-8 items-center justify-center rounded-lg text-[var(--pl-text-muted)] transition-colors hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]">
            <ArrowLeft className="size-[18px]" />
          </button>
        </Tooltip>
        <Tooltip mouseEnterDelay={0.35} placement="right" title={collapsed ? "展开" : "收起"}>
          <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "展开" : "收起"}
            className="flex size-8 items-center justify-center rounded-lg text-[var(--pl-text-muted)] transition-colors hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]">
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}

