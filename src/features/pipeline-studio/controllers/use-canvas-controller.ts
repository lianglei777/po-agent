"use client";

import { useCallback, useEffect, useState } from "react";
import type { CanvasWorkflowRun } from "@/contracts/pipeline";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { canvasWorkflowRunIsActive } from "../model/workflow-run";
import { useCanvasStore, useCanvasStoreApi } from "../state/canvas-store";

export function useCanvasController(projectId: string, initialTitle: string) {
  const store = useCanvasStoreApi();
  const pendingMutationCount = useCanvasStore((state) => state.pendingMutations.length);
  const saveState = useCanvasStore((state) => state.saveState);
  const [projectTitle, setProjectTitle] = useState(initialTitle);
  const [workflowRun, setWorkflowRun] = useState<CanvasWorkflowRun | null>(null);
  const [workflowRunBusy, setWorkflowRunBusy] = useState(false);

  useEffect(() => {
    store.getState().setWorkflowLockedNodeIds(
      canvasWorkflowRunIsActive(workflowRun) ? workflowRun?.nodeIds ?? [] : [],
    );
  }, [store, workflowRun]);

  const reloadSnapshot = useCallback(async (signal?: AbortSignal) => {
    try {
      const snapshot = await pipelineStudioApi.getSnapshot(projectId, signal);
      const state = store.getState();
      if (state.loaded) state.reconcileSnapshot(snapshot);
      else state.hydrate(snapshot);
    } catch (error) {
      if (signal?.aborted) return;
      store.getState().setError(error instanceof Error ? error.message : String(error));
    }
  }, [projectId, store]);

  const reloadWorkflowRun = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await pipelineStudioApi.listWorkflowRuns(projectId, 1, signal);
      setWorkflowRun(response.workflowRuns[0] ?? null);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      throw error;
    }
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void reloadSnapshot(controller.signal);
    void pipelineStudioApi.listWorkflowRuns(projectId, 1, controller.signal)
      .then((response) => setWorkflowRun(response.workflowRuns[0] ?? null))
      .catch(() => undefined);
    pipelineStudioApi.getProject(projectId)
      .then((project) => setProjectTitle(project.title))
      .catch(() => undefined);

    const events = new EventSource(`/api/pipeline/projects/${projectId}/sse`);
    events.onmessage = () => {
      if (store.getState().pendingMutations.length === 0) void reloadSnapshot();
      void reloadWorkflowRun().catch(() => undefined);
    };

    return () => {
      controller.abort();
      events.close();
    };
  }, [projectId, reloadSnapshot, reloadWorkflowRun, store]);

  useEffect(() => {
    if (!pendingMutationCount || saveState === "saving") return;
    const timer = window.setTimeout(async () => {
      const state = store.getState();
      const rawMutationCount = state.pendingMutations.length;
      if (!rawMutationCount) return;
      state.beginSaving();
      try {
        const snapshot = await pipelineStudioApi.applyMutations(projectId, {
          baseRevision: state.revision,
          requestId: crypto.randomUUID(),
          mutations: state.pendingMutations.slice(0, rawMutationCount),
        });
        store.getState().finishSaving(rawMutationCount, snapshot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        store.getState().failSaving(message);
        if (message.includes("revision conflict")) void reloadSnapshot();
      }
    }, 360);
    return () => window.clearTimeout(timer);
  }, [pendingMutationCount, projectId, reloadSnapshot, saveState, store]);

  const renameProject = useCallback(async (title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === projectTitle) return;
    const project = await pipelineStudioApi.updateProject(projectId, nextTitle);
    setProjectTitle(project.title);
  }, [projectId, projectTitle]);

  const runWorkflow = useCallback(async (nodeIds: string[]) => {
    setWorkflowRunBusy(true);
    try {
      const response = await pipelineStudioApi.createWorkflowRun(projectId, nodeIds);
      setWorkflowRun(response.workflowRun);
      return response.workflowRun;
    } finally {
      setWorkflowRunBusy(false);
    }
  }, [projectId]);

  const cancelWorkflow = useCallback(async () => {
    if (!workflowRun) return null;
    setWorkflowRunBusy(true);
    try {
      const response = await pipelineStudioApi.cancelWorkflowRun(projectId, workflowRun.id);
      setWorkflowRun(response.workflowRun);
      return response.workflowRun;
    } finally {
      setWorkflowRunBusy(false);
    }
  }, [projectId, workflowRun]);

  const retryWorkflow = useCallback(async () => {
    if (!workflowRun) return null;
    setWorkflowRunBusy(true);
    try {
      const response = await pipelineStudioApi.retryWorkflowRun(projectId, workflowRun.id);
      setWorkflowRun(response.workflowRun);
      return response.workflowRun;
    } finally {
      setWorkflowRunBusy(false);
    }
  }, [projectId, workflowRun]);

  return {
    projectTitle,
    workflowRun,
    workflowRunBusy,
    renameProject,
    reloadSnapshot,
    runWorkflow,
    cancelWorkflow,
    retryWorkflow,
  };
}
