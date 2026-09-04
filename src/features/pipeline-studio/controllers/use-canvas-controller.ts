"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  canvasSaveErrorIsRetryable,
  canvasSaveRetryDelay,
  PipelineStudioApiError,
  pipelineStudioApi,
} from "../api/pipeline-studio-api";
import { useCanvasStore, useCanvasStoreApi } from "../state/canvas-store";

export function useCanvasController(projectId: string, initialTitle: string) {
  const store = useCanvasStoreApi();
  const pendingMutationCount = useCanvasStore((state) => state.pendingMutations.length);
  const saveState = useCanvasStore((state) => state.saveState);
  const [projectTitle, setProjectTitle] = useState(initialTitle);
  const saveRetryAttemptRef = useRef(0);
  const saveRetryableRef = useRef(true);

  const reloadSnapshot = useCallback(async (
    signal?: AbortSignal,
    options: { discardLocalChanges?: boolean } = {},
  ) => {
    try {
      const snapshot = await pipelineStudioApi.getSnapshot(projectId, signal);
      const state = store.getState();
      if (options.discardLocalChanges || !state.loaded) state.hydrate(snapshot);
      else state.reconcileSnapshot(snapshot);
    } catch (error) {
      if (signal?.aborted) return;
      store.getState().setError(error instanceof Error ? error.message : String(error));
    }
  }, [projectId, store]);

  useEffect(() => {
    const controller = new AbortController();
    void reloadSnapshot(controller.signal);
    pipelineStudioApi.getProject(projectId)
      .then((project) => setProjectTitle(project.title))
      .catch(() => undefined);

    const events = new EventSource(`/api/pipeline/projects/${projectId}/sse`);
    events.onmessage = () => {
      if (store.getState().pendingMutations.length === 0) void reloadSnapshot();
    };

    return () => {
      controller.abort();
      events.close();
    };
  }, [projectId, reloadSnapshot, store]);

  useEffect(() => {
    if (!pendingMutationCount || saveState === "saving") return;
    if (saveState === "idle") {
      saveRetryAttemptRef.current = 0;
      saveRetryableRef.current = true;
    } else if (!saveRetryableRef.current) {
      return;
    }
    const delay = saveState === "error" ? canvasSaveRetryDelay(saveRetryAttemptRef.current - 1) : 360;
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
        saveRetryAttemptRef.current = 0;
        saveRetryableRef.current = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const revisionConflict = error instanceof PipelineStudioApiError && error.status === 409;
        saveRetryableRef.current = !revisionConflict && canvasSaveErrorIsRetryable(error);
        if (saveRetryableRef.current) saveRetryAttemptRef.current += 1;
        store.getState().failSaving(message);
        if (!saveRetryableRef.current) {
          // 服务端已拒绝这批 mutation，继续保留只会让 Agent 永远等待一个无法保存的画布。
          void reloadSnapshot(undefined, { discardLocalChanges: true });
        }
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [pendingMutationCount, projectId, reloadSnapshot, saveState, store]);

  const renameProject = useCallback(async (title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle || nextTitle === projectTitle) return;
    const project = await pipelineStudioApi.updateProject(projectId, nextTitle);
    setProjectTitle(project.title);
  }, [projectId, projectTitle]);

  return {
    projectTitle,
    renameProject,
    reloadSnapshot,
  };
}
