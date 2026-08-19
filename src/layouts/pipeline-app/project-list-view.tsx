"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Empty, Popconfirm, Segmented, Spin, message } from "antd";
import { Grid, List, Plus, Trash2 } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineApi } from "./pipeline-api";
import type { ProjectSummary } from "@/contracts/pipeline";

type ViewMode = "grid" | "list";

export type ProjectListViewProps = {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
};

export function ProjectListView({ viewMode, onViewModeChange, onNewProject, onOpenProject }: ProjectListViewProps) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    pipelineApi.listProjects().then((data) => {
      if (!cancelled) { setProjects(data.projects); setLoading(false); }
    }).catch((err) => {
      if (!cancelled) { setLoading(false); message.error(err instanceof Error ? err.message : String(err)); }
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const projectContent = viewMode === "grid" ? (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project}
          onOpen={() => onOpenProject(project.id)}
          onDelete={async () => { await pipelineApi.deleteProject(project.id); refresh(); }}
        />
      ))}
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      {projects.map((project) => (
        <div key={project.id}
          className="group flex cursor-pointer items-center gap-4 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-4 py-3 transition-all hover:border-[var(--pl-border-strong)] hover:shadow-[var(--pl-shadow-card)]"
          onClick={() => onOpenProject(project.id)} role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenProject(project.id); } }}
        >
          <div className="flex gap-1.5">
            {project.stageStatuses.map((stage) => (
              <div key={stage.stage} className={"h-1.5 w-6 rounded-full " +
                (stage.status === "ready" ? "bg-[var(--pl-ready)]" :
                 stage.status === "warn" ? "bg-[var(--pl-warn)]" : "bg-[var(--pl-idle)]")
              } />
            ))}
          </div>
          <span className="flex-1 truncate text-sm font-medium text-[var(--pl-text)]">{project.title}</span>
          <span className="text-xs text-[var(--pl-text-muted)]">{project.frameCount} frames</span>
          <Popconfirm title={t.pipeline.confirmDelete.replace("{title}", project.title)}
            onConfirm={async () => { await pipelineApi.deleteProject(project.id); refresh(); }}>
            <Button danger size="small" type="text" icon={<Trash2 className="size-3.5" />}
              onClick={(e) => e.stopPropagation()} className="opacity-0 transition-opacity group-hover:opacity-100" />
          </Popconfirm>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[var(--pl-surface-subtle)]">
      <div className="flex items-center justify-between border-b border-[var(--pl-border)] bg-[var(--pl-surface)] px-6 py-4">
        <h1 className="text-lg font-semibold text-[var(--pl-text)]">{t.pipeline.projectListTitle}</h1>
        <div className="flex items-center gap-3">
          <Segmented size="small" value={viewMode} onChange={(val) => onViewModeChange(val as ViewMode)}
            options={[{ value: "grid", icon: <Grid className="size-3.5" />, tooltip: t.pipeline.viewGrid },
                     { value: "list", icon: <List className="size-3.5" />, tooltip: t.pipeline.viewList }]}
          />
          <Button type="primary" icon={<Plus className="size-4" />} onClick={onNewProject} size="middle">{t.pipeline.newProject}</Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center"><Spin size="large" /></div>
        ) : projects.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<div className="text-center"><p className="text-base font-medium text-[var(--pl-text)]">{t.pipeline.emptyTitle}</p>
              <p className="mt-1 text-sm text-[var(--pl-text-secondary)]">{t.pipeline.emptyDescription}</p></div>}>
              <Button type="primary" icon={<Plus className="size-4" />} onClick={onNewProject} size="middle">{t.pipeline.emptyNewProject}</Button>
            </Empty>
          </div>
        ) : (
          projectContent
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, onOpen, onDelete }: {
  project: ProjectSummary;
  onOpen: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const stageLabels: Record<string, string> = {
    script: t.pipeline.stageScript, assets: t.pipeline.stageAssets,
    storyboard: t.pipeline.stageStoryboard, video: t.pipeline.stageVideo, assembly: t.pipeline.stageAssembly,
  };
  return (
    <article className="group relative cursor-pointer overflow-hidden rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] shadow-[var(--pl-shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--pl-shadow-hover)]"
      onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}>
      <div className="aspect-[16/10] bg-[var(--pl-surface-subtle)]" />
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <Popconfirm title={t.pipeline.confirmDelete.replace("{title}", project.title)}
          onConfirm={(e) => { e?.stopPropagation(); onDelete(); }} onCancel={(e) => e?.stopPropagation()}>
          <Button danger size="small" type="text" icon={<Trash2 className="size-3.5" />} onClick={(e) => e.stopPropagation()} />
        </Popconfirm>
      </div>
      <div className="p-4">
        <h3 className="truncate text-sm font-semibold text-[var(--pl-text)]">{project.title}</h3>
        <div className="mt-2 flex flex-col gap-1">
          {project.stageStatuses.map((stage) => (
            <div key={stage.stage} className="flex items-center gap-1.5 text-xs">
              <span className={"size-1.5 rounded-full " + (stage.status === "ready" ? "bg-[var(--pl-ready)]" : stage.status === "warn" ? "bg-[var(--pl-warn)]" : "border border-[var(--pl-text-muted)] opacity-40")
              } />
              <span className="text-[var(--pl-text-secondary)]">{stageLabels[stage.stage]}</span>
              <span className="ml-auto text-[var(--pl-text-muted)]">{stage.statusLabel}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-[var(--pl-text-muted)]">{project.frameCount} {t.pipeline.frames}</div>
      </div>
    </article>
  );
}

