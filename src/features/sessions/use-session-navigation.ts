"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useI18n } from "@/i18n/use-i18n";
import { loadProjects, loadSessions, removeProject } from "./api";
import { createDraftSession } from "./session-draft";
import { groupSessionsByProject } from "./session-utils";
import { useSessionNavigationStore } from "./state/session-navigation-store-provider";
import type { Project, SessionInfo, SessionTreeNode } from "./types";

export type SessionNavigationOptions = {
  selectedSessionId: string | null;
  selectedCwd: string | null;
  initialSessionId?: string | null;
  refreshKey?: number;
  draftSession?: { id: string; cwd: string; created: string } | null;
  onSelectSession: (session: SessionInfo, isRestore?: boolean) => void;
  onNewSession: (temporaryId: string, cwd: string) => void;
  onSessionDeleted: (session: SessionInfo) => void;
  onCwdChange: (cwd: string) => void;
  onInitialRestoreDone?: () => void;
};

export type SessionNavigationController = {
  currentNodes: SessionTreeNode[];
  error: string;
  loading: boolean;
  manualRefresh: () => Promise<void>;
  newSession: () => void;
  openSession: (session: SessionInfo) => void;
  onSessionDeleted: (session: SessionInfo) => void;
  projectError: string;
  projects: Project[];
  refreshed: boolean;
  refresh: (showLoading?: boolean) => Promise<void>;
  removeProject: (cwd: string) => Promise<void>;
  removingProject: string | null;
  selectProject: (cwd: string) => void;
  selectSession: (session: SessionInfo) => void;
  selectedCwd: string | null;
  selectedSessionId: string | null;
};

export function useSessionNavigation({
  selectedSessionId,
  selectedCwd,
  initialSessionId,
  refreshKey = 0,
  draftSession,
  onSelectSession,
  onNewSession,
  onSessionDeleted,
  onCwdChange,
  onInitialRestoreDone,
}: SessionNavigationOptions): SessionNavigationController {
  const {
    sessions,
    projects,
    loading,
    error,
    projectError,
    removingProject,
    refreshed,
    beginRefresh,
    completeRefresh,
    failRefresh,
    setRefreshed,
    beginProjectRemoval,
    completeProjectRemoval,
    failProjectRemoval,
  } = useSessionNavigationStore(
    useShallow((state) => ({
      sessions: state.sessions,
      projects: state.projects,
      loading: state.loading,
      error: state.error,
      projectError: state.projectError,
      removingProject: state.removingProject,
      refreshed: state.refreshed,
      beginRefresh: state.beginRefresh,
      completeRefresh: state.completeRefresh,
      failRefresh: state.failRefresh,
      setRefreshed: state.setRefreshed,
      beginProjectRemoval: state.beginProjectRemoval,
      completeProjectRemoval: state.completeProjectRemoval,
      failProjectRemoval: state.failProjectRemoval,
    })),
  );
  // 一次性恢复和反馈计时器属于副作用生命周期，不进入可观察的 Zustand 状态。
  const restoreAttempted = useRef(false);
  const feedbackTimer = useRef<number | null>(null);
  const { t } = useI18n();

  const refresh = useCallback(
    async (showLoading = false) => {
      beginRefresh(showLoading);
      try {
        const [nextProjects, nextSessions] = await Promise.all([
          loadProjects(),
          loadSessions(),
        ]);
        completeRefresh(nextProjects, nextSessions, showLoading);
      } catch (cause) {
        failRefresh(
          cause instanceof Error
            ? cause.message
            : t.sessions.unableToLoadSessions,
          showLoading,
        );
      }
    },
    [
      beginRefresh,
      completeRefresh,
      failRefresh,
      t.sessions.unableToLoadSessions,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!refreshKey) return;
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, refreshKey]);

  useEffect(
    () => () => {
      if (feedbackTimer.current !== null) {
        window.clearTimeout(feedbackTimer.current);
      }
    },
    [],
  );

  const navigableSessions = useMemo(() => {
    if (!draftSession) return sessions;
    return [
      ...sessions,
      createDraftSession({
        temporaryId: draftSession.id,
        cwd: draftSession.cwd,
        label: t.sessions.draft,
        now: draftSession.created,
      }),
    ];
  }, [draftSession, sessions, t.sessions.draft]);

  const groups = useMemo(
    () => groupSessionsByProject(projects, navigableSessions),
    [navigableSessions, projects],
  );
  const currentNodes = useMemo(
    () => groups.find((group) => group.cwd === selectedCwd)?.nodes ?? [],
    [groups, selectedCwd],
  );

  useEffect(() => {
    if (
      loading ||
      initialSessionId === undefined ||
      restoreAttempted.current
    ) {
      return;
    }
    restoreAttempted.current = true;
    if (initialSessionId) {
      const restored = sessions.find((session) => session.id === initialSessionId);
      if (restored) {
        onCwdChange(restored.cwd);
        onSelectSession(restored, true);
        return;
      }
      onInitialRestoreDone?.();
    }
    if (!selectedCwd && projects[0]) {
      onCwdChange(projects[0].path);
    }
  }, [
    initialSessionId,
    loading,
    onCwdChange,
    onInitialRestoreDone,
    onSelectSession,
    projects,
    selectedCwd,
    sessions,
  ]);

  const manualRefresh = useCallback(async () => {
    await refresh();
    setRefreshed(true);
    if (feedbackTimer.current !== null) {
      window.clearTimeout(feedbackTimer.current);
    }
    feedbackTimer.current = window.setTimeout(() => setRefreshed(false), 2000);
  }, [refresh, setRefreshed]);

  const selectProject = useCallback(
    (cwd: string) => {
      onCwdChange(cwd);
    },
    [onCwdChange],
  );

  const removeProjectFromList = useCallback(
    async (cwd: string) => {
      if (!beginProjectRemoval(cwd)) return;
      try {
        await removeProject(cwd);
        completeProjectRemoval(cwd);
      } catch (cause) {
        failProjectRemoval(
          cause instanceof Error
            ? cause.message
            : t.sessions.removeProjectFailed,
        );
      }
    },
    [
      beginProjectRemoval,
      completeProjectRemoval,
      failProjectRemoval,
      t.sessions.removeProjectFailed,
    ],
  );

  const newSession = useCallback(() => {
    if (!selectedCwd) return;
    onNewSession(crypto.randomUUID(), selectedCwd);
  }, [onNewSession, selectedCwd]);

  const openSession = useCallback(
    (session: SessionInfo) => {
      if (session.draft) {
        onNewSession(session.id, session.cwd);
        return;
      }

      onSelectSession(session);
    },
    [onNewSession, onSelectSession],
  );

  return {
    currentNodes,
    error,
    loading,
    manualRefresh,
    newSession,
    openSession,
    onSessionDeleted,
    projectError,
    projects,
    refreshed,
    refresh,
    removeProject: removeProjectFromList,
    removingProject,
    selectProject,
    selectSession: onSelectSession,
    selectedCwd,
    selectedSessionId,
  };
}
