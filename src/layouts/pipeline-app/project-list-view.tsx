"use client";

import { Button, Popconfirm, Spin, Tooltip } from "antd";
import type { ProjectSummary } from "@/contracts/pipeline";
import { Folder, FolderOpen, Plus, Project, Trash2 } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";

export type ProjectListViewProps = {
  projects: ProjectSummary[];
  loading: boolean;
  onNewProject: () => void;
  onOpenExisting: () => void;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => Promise<void>;
};

export function ProjectListView({
  projects,
  loading,
  onNewProject,
  onOpenExisting,
  onOpenProject,
  onDeleteProject,
}: ProjectListViewProps) {
  const { locale, t } = useI18n();

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[var(--pl-surface)]">
      <header className="flex min-h-12 items-center justify-between border-b border-[var(--pl-border)] px-6">
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-[var(--pl-text)]">
          {t.pipeline.projectListTitle}
        </h1>
        <Button icon={<FolderOpen className="size-4" />} onClick={onOpenExisting}>
          {t.pipeline.openExistingProject}
        </Button>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-6 py-6" aria-labelledby="pipeline-project-list">
        <h2 id="pipeline-project-list" className="sr-only">{t.pipeline.projectListTitle}</h2>

        {loading ? (
          <div className="flex h-full min-h-72 items-center justify-center">
            <Spin size="large" />
          </div>
        ) : (
          <>
            <div className="grid max-w-[1280px] grid-cols-[repeat(auto-fill,minmax(260px,280px))] items-start gap-4">
              <button
                type="button"
                onClick={onNewProject}
                className="group flex h-[152px] w-full flex-col rounded-xl border border-dashed border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] p-4 text-left transition-[background-color,border-color,transform] hover:border-[var(--pl-accent)] hover:bg-[var(--pl-surface-hover)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pl-accent)]"
              >
                <span className="flex size-10 items-center justify-center rounded-lg border border-[var(--pl-border-strong)] bg-[var(--pl-surface)] text-[var(--pl-text-secondary)] transition-colors group-hover:text-[var(--pl-accent-hover)]">
                  <Plus className="size-[18px]" />
                </span>
                <span className="mt-auto block min-w-0">
                  <span className="block text-sm font-semibold text-[var(--pl-text)]">{t.pipeline.newProject}</span>
                  <span className="mt-1 block text-caption text-[var(--pl-text-muted)]">{t.pipeline.createProjectHint}</span>
                </span>
              </button>

              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  locale={locale}
                  onOpen={() => onOpenProject(project.id)}
                  onDelete={() => onDeleteProject(project.id)}
                />
              ))}
            </div>

          </>
        )}
      </section>
    </main>
  );
}

function ProjectCard({
  project,
  locale,
  onOpen,
  onDelete,
}: {
  project: ProjectSummary;
  locale: "zh" | "en";
  onOpen: () => void;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const updatedAt = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(project.updatedAt));

  return (
    <article className="group relative h-[152px] min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full flex-col rounded-xl border border-[var(--pl-border)] bg-[var(--pl-project-card)] p-4 pr-12 text-left transition-[background-color,border-color,transform] hover:border-[var(--pl-border-strong)] hover:bg-[var(--pl-surface-elevated)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pl-accent)]"
      >
        <span className="flex size-10 items-center justify-center rounded-lg border border-[var(--pl-border-strong)] bg-[var(--pl-surface)] text-[var(--pl-accent)]">
          <Project className="size-[18px]" />
        </span>
        <span className="mt-auto block min-w-0 w-full">
          <h3 className="truncate text-sm font-semibold text-[var(--pl-text)]">{project.title}</h3>
          <time
            dateTime={project.updatedAt}
            aria-label={`${t.pipeline.updatedAt} ${updatedAt}`}
            className="mt-1 block text-caption tabular-nums text-[var(--pl-text-muted)]"
          >
            {updatedAt}
          </time>
          <Tooltip mouseEnterDelay={0.35} placement="bottomLeft" title={project.rootPath}>
            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-caption text-[var(--pl-text-muted)]">
              <Folder className="size-3.5 shrink-0" />
              <span className="truncate font-ui-mono">{project.rootPath}</span>
            </span>
          </Tooltip>
        </span>
      </button>

      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        <Popconfirm
          title={t.pipeline.confirmDelete.replace("{title}", project.title)}
          onConfirm={onDelete}
        >
          <Button
            danger
            type="text"
            size="small"
            aria-label={t.pipeline.confirmDelete.replace("{title}", project.title)}
            icon={<Trash2 className="size-3.5" />}
            onClick={(event) => event.stopPropagation()}
          />
        </Popconfirm>
      </div>
    </article>
  );
}
