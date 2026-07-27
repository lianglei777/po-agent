"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/use-i18n";
import { loadProjects, loadSessions, removeProject } from "./api";
import { createDraftSession } from "./session-draft";
import { groupSessionsByProject } from "./session-utils";
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
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [removingProject, setRemovingProject] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);
  const restoreAttempted = useRef(false);
  const feedbackTimer = useRef<number | null>(null);
  const { t } = useI18n();

  const refresh = useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const [nextProjects, nextSessions] = await Promise.all([
          loadProjects(),
          loadSessions(),
        ]);
        setProjects(nextProjects);
        setSessions(nextSessions);
        setError("");
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : t.sessions.unableToLoadSessions,
        );
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [t.sessions.unableToLoadSessions],
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
  }, [refresh]);

  const selectProject = useCallback(
    (cwd: string) => {
      onCwdChange(cwd);
    },
    [onCwdChange],
  );

  const removeProjectFromList = useCallback(
    async (cwd: string) => {
      if (removingProject) return;
      setRemovingProject(cwd);
      try {
        await removeProject(cwd);
        setProjects((current) =>
          current.filter((project) => project.path !== cwd),
        );
        setProjectError("");
      } catch (cause) {
        setProjectError(
          cause instanceof Error
            ? cause.message
            : t.sessions.removeProjectFailed,
        );
      } finally {
        setRemovingProject(null);
      }
    },
    [removingProject, t.sessions.removeProjectFailed],
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
