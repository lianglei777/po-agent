"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfigProvider, message, theme as antdTheme } from "antd";
import type { PipelineProject, ProjectSummary } from "@/contracts/pipeline";
import { PipelineSidebar, type PipelineSidebarItemId } from "./pipeline-sidebar";
import { ProjectListView } from "./project-list-view";
import { ProjectDetailView } from "./project-detail-view";
import { NewProjectDialog } from "./new-project-dialog";
import { OpenProjectDialog } from "./open-project-dialog";
import { pipelineApi } from "./pipeline-api";

export function PipelineApp() {
  const [activeSidebarItem, setActiveSidebarItem] = useState<PipelineSidebarItemId>("projects");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsRefreshKey, setProjectsRefreshKey] = useState(0);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectTitle, setSelectedProjectTitle] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    pipelineApi.listProjects().then((data) => {
      if (cancelled) return;
      setProjects(data.projects);
      setProjectsLoading(false);
    }).catch((error) => {
      if (cancelled) return;
      setProjectsLoading(false);
      message.error(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;
    };
  }, [projectsRefreshKey]);

  const handleProjectCreated = useCallback(() => {
    setNewProjectOpen(false);
    setProjectsLoading(true);
    setProjectsRefreshKey((value) => value + 1);
  }, []);

  const handleOpenProject = useCallback((projectId: string) => {
    const project = projects.find((item) => item.id === projectId);
    setSelectedProjectId(projectId);
    setSelectedProjectTitle(project?.title ?? "");

    if (!project) {
      pipelineApi.getProject(projectId)
        .then((result) => setSelectedProjectTitle(result.title))
        .catch(() => setSelectedProjectTitle(""));
    }
  }, [projects]);

  const handleExistingProjectOpened = useCallback((project: PipelineProject) => {
    setOpenProjectOpen(false);
    setProjectsLoading(true);
    setProjectsRefreshKey((value) => value + 1);
    setSelectedProjectId(project.id);
    setSelectedProjectTitle(project.title);
  }, []);

  const handleDeleteProject = useCallback(async (projectId: string) => {
    try {
      await pipelineApi.deleteProject(projectId);
      setProjects((current) => current.filter((project) => project.id !== projectId));
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedProjectId(null);
    setSelectedProjectTitle("");
    setActiveSidebarItem("projects");
    setProjectsLoading(true);
    setProjectsRefreshKey((value) => value + 1);
  }, []);

  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.darkAlgorithm,
        token: {
          colorPrimary: "#168cff",
          colorInfo: "#168cff",
          colorBgBase: "#101214",
          colorBgContainer: "#171a1f",
          colorBgElevated: "#1d2127",
          colorBorder: "#303640",
          colorText: "#f4f7fb",
          colorTextSecondary: "#a8b2bf",
          borderRadius: 10,
        },
      }}
    >
      <div className="pipeline-studio-shell flex h-dvh min-w-[1024px] overflow-hidden bg-[var(--pl-surface)]">
        {!selectedProjectId ? (
          <PipelineSidebar
            activeItem={activeSidebarItem}
            onItemChange={setActiveSidebarItem}
            onNewProject={() => setNewProjectOpen(true)}
          />
        ) : null}

        <div className="flex min-w-0 flex-1">
          {selectedProjectId ? (
            <ProjectDetailView
              projectId={selectedProjectId}
              projectTitle={selectedProjectTitle || selectedProjectId}
              onBack={handleBackToList}
            />
          ) : activeSidebarItem === "projects" ? (
            <ProjectListView
              projects={projects}
              loading={projectsLoading}
              onNewProject={() => setNewProjectOpen(true)}
              onOpenExisting={() => setOpenProjectOpen(true)}
              onOpenProject={handleOpenProject}
              onDeleteProject={handleDeleteProject}
            />
          ) : null}
        </div>

        <NewProjectDialog
          open={newProjectOpen}
          onClose={() => setNewProjectOpen(false)}
          onCreated={handleProjectCreated}
        />
        <OpenProjectDialog
          open={openProjectOpen}
          onClose={() => setOpenProjectOpen(false)}
          onOpened={handleExistingProjectOpened}
        />
      </div>
    </ConfigProvider>
  );
}
