"use client";

import { useCallback, useEffect, useState } from "react";
import { PipelineSidebar } from "./pipeline-sidebar";
import { ProjectListView } from "./project-list-view";
import { ProjectDetailView } from "./project-detail-view";
import { NewProjectDialog } from "./new-project-dialog";
import { pipelineApi } from "./pipeline-api";

export type PipelineNavId = "projects" | "library" | "templates";
type ViewMode = "grid" | "list";

export function PipelineApp() {
  const [activeNav, setActiveNav] = useState<PipelineNavId>("projects");
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem("pipeline-view-mode") as ViewMode) || "grid";
  });

  useEffect(() => {
    localStorage.setItem("pipeline-view-mode", viewMode);
  }, [viewMode]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectTitle, setSelectedProjectTitle] = useState<string>("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const handleNewProject = useCallback(() => {
    setNewProjectOpen(true);
  }, []);

  const handleProjectCreated = useCallback((projectId: string) => {
    setNewProjectOpen(false);
    setSelectedProjectId(projectId);
    setSelectedProjectTitle("");
  }, []);

  const handleOpenProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    pipelineApi.getProject(projectId).then((p) => setSelectedProjectTitle(p.title)).catch(() => setSelectedProjectTitle(""));
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedProjectId(null);
    setSelectedProjectTitle("");
  }, []);

  return (
    <div className="flex h-dvh min-w-[1024px] overflow-hidden bg-[var(--pl-surface)]">
      {!selectedProjectId && <PipelineSidebar activeNav={activeNav} onNavChange={setActiveNav} />}
      <div className="flex min-w-0 flex-1">
        {activeNav === "projects" ? (
          selectedProjectId ? (
            <ProjectDetailView
              projectId={selectedProjectId}
              projectTitle={selectedProjectTitle || selectedProjectId}
              onBack={handleBackToList}
            />
          ) : (
            <ProjectListView
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              onNewProject={handleNewProject}
              onOpenProject={handleOpenProject}
            />
          )
        ) : (
          <div className="flex flex-1 items-center justify-center text-[var(--pl-text-muted)]">
            {/* 预留: 资产库 / 模板库 */}
          </div>
        )}
      </div>
      <NewProjectDialog
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
