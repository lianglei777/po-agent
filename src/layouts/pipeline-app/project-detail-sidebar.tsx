"use client";

import { Button } from "antd";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  Folder,
  Images,
  Lock,
} from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import type { PipelineStageId } from "./project-detail-view";

export type StageStatus = "ready" | "warn" | "idle" | "gated";

export type StageInfo = {
  id: PipelineStageId;
  status: StageStatus;
  statusLabel: string;
};

export type ProjectDetailSidebarProps = {
  projectTitle: string;
  stages: StageInfo[];
  activeStage: PipelineStageId | null;
  onStageClick: (stageId: PipelineStageId) => void;
  onBack: () => void;
};

const STAGE_ICONS: Record<PipelineStageId, typeof Film> = {
  script: Folder,
  assets: Images,
  storyboard: Film,
  video: Film,
  assembly: Lock,
};

export function ProjectDetailSidebar({
  projectTitle,
  stages,
  activeStage,
  onStageClick,
  onBack,
}: ProjectDetailSidebarProps) {
  const { t } = useI18n();

  return (
    <aside
      className="flex h-full w-[256px] shrink-0 flex-col border-r border-[var(--pl-border-glass)] bg-[var(--pl-surface)]"
      data-testid="project-detail-sidebar"
    >
      {/* 面包屑 */}
      <div className="border-b border-[var(--pl-border-glass)] p-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 text-[var(--pl-text-secondary)] transition-colors hover:text-[var(--pl-text)]"
            aria-label={t.pipeline.backToAgent}
          >
            <ChevronLeft className="size-4" />
          </button>
          <nav className="flex min-w-0 items-center gap-1 text-xs">
            <span className="truncate text-[var(--pl-text-muted)]">
              {t.pipeline.projectListTitle}
            </span>
            <span className="text-[var(--pl-text-muted)]">{">"}</span>
            <span className="truncate font-medium text-[var(--pl-text)]">
              {projectTitle}
            </span>
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {stages.map((stage, index) => {
            const Icon = STAGE_ICONS[stage.id];
            const active = activeStage === stage.id;
            const isLast = index === stages.length - 1;
            const label = t.pipeline[
              `stage${stage.id.charAt(0).toUpperCase()}${stage.id.slice(1)}` as keyof typeof t.pipeline
            ];

            return (
              <div key={stage.id} className="relative">
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[18px] top-[38px] bottom-[-4px] w-[1.5px] bg-[var(--pl-border)]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onStageClick(stage.id)}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors ${
                    active
                      ? "bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]"
                      : "text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 h-3/5 w-[3px] -translate-y-1/2 rounded-r bg-[var(--pl-accent)]" />
                  )}
                  <Icon className="size-[18px] shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={`text-sm ${active ? "font-semibold" : "font-medium"}`}>
                      {label}
                    </span>
                    <span className="truncate text-[10px] text-[var(--pl-text-muted)]">
                      {stage.statusLabel}
                    </span>
                  </div>
                  <StageStatusIcon status={stage.status} active={active} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

    </aside>
  );
}

function StageStatusIcon({
  status,
  active,
}: {
  status: StageStatus;
  active: boolean;
}) {
  if (active) {
    return <ChevronRight className="size-4 shrink-0 opacity-50" />;
  }
  switch (status) {
    case "ready":
      return <Check className="size-4 shrink-0 text-[var(--pl-ready)]" />;
    case "warn":
      return (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full bg-[var(--pl-warn)]"
        />
      );
    case "idle":
      return (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full border-[1.5px] border-[var(--pl-text-muted)] opacity-60"
        />
      );
    case "gated":
      return <Lock className="size-3 shrink-0 text-[var(--pl-text-muted)] opacity-50" />;
    default:
      return null;
  }
}
