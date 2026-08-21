"use client";

import { Button, Popconfirm, Spin } from "antd";
import type { ProjectSummary } from "@/contracts/pipeline";
import { FolderOpen, Plus, Project, Trash2 } from "@/components/icons";
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
      <header className="flex min-h-16 items-center justify-between border-b border-[var(--pl-border)] px-8">
        <h1 className="text-lg font-semibold tracking-[-0.02em] text-[var(--pl-text)]">
          {t.pipeline.projectListTitle}
        </h1>
        <Button icon={<FolderOpen className="size-4" />} onClick={onOpenExisting}>
          {t.pipeline.openExistingProject}
        </Button>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto px-8 py-8" aria-labelledby="pipeline-project-list">
        <h2 id="pipeline-project-list" className="sr-only">{t.pipeline.projectListTitle}</h2>

        {loading ? (
          <div className="flex h-full min-h-72 items-center justify-center">
            <Spin size="large" />
          </div>
        ) : (
          <>
            <div className="grid max-w-[1280px] grid-cols-[repeat(auto-fill,minmax(250px,290px))] gap-x-5 gap-y-8">
              <button
                type="button"
                onClick={onNewProject}
                className="group text-left focus-visible:outline-none"
              >
                <div className="flex aspect-[16/10] items-center justify-center rounded-2xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] transition-colors group-hover:border-[var(--pl-accent)] group-hover:bg-[var(--pl-surface-hover)] group-focus-visible:border-[var(--pl-accent)]">
                  <span className="flex flex-col items-center gap-3 text-[var(--pl-text-secondary)] transition-colors group-hover:text-[var(--pl-text)]">
                    <span className="flex size-11 items-center justify-center rounded-full border border-[var(--pl-border-strong)] bg-[var(--pl-surface)]">
                      <Plus className="size-5" />
                    </span>
                    <span className="text-base font-semibold">{t.pipeline.startCreating}</span>
                  </span>
                </div>
                <div className="px-1 pt-3">
                  <div className="text-sm font-medium text-[var(--pl-text)]">{t.pipeline.newProject}</div>
                  <div className="mt-1 text-xs text-[var(--pl-text-muted)]">{t.pipeline.createProjectHint}</div>
                </div>
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

            <p className="max-w-[1280px] py-12 text-center text-xs text-[var(--pl-text-muted)]">
              {projects.length ? t.pipeline.noMoreProjects : t.pipeline.emptyTitle}
            </p>
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
    <article className="group relative min-w-0">
      <button type="button" onClick={onOpen} className="block w-full text-left focus-visible:outline-none">
        <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-project-card)] transition-colors group-hover:border-[var(--pl-border-strong)] group-focus-within:border-[var(--pl-accent)]">
          <div className="absolute left-5 top-5 h-9 w-14 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]" aria-hidden="true" />
          <div className="absolute bottom-5 right-5 h-12 w-20 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]" aria-hidden="true" />
          <span className="flex size-12 items-center justify-center rounded-xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface)] text-[var(--pl-accent)]">
            <Project className="size-5" />
          </span>
        </div>
        <div className="px-1 pt-3">
          <h3 className="truncate text-sm font-semibold text-[var(--pl-text)]">{project.title}</h3>
          <time
            dateTime={project.updatedAt}
            aria-label={`${t.pipeline.updatedAt} ${updatedAt}`}
            className="mt-1 block text-xs tabular-nums text-[var(--pl-text-muted)]"
          >
            {updatedAt}
          </time>
          <p className="mt-1 truncate text-xs text-[var(--pl-text-muted)]" title={project.rootPath}>
            {project.rootPath}
          </p>
        </div>
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
