"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatCenter, type BranchState } from "@/features/chat/chat-center";
import { ContentGenerationCenter } from "@/features/content-generation/content-generation-center";
import type { OpenFile } from "@/features/files/file-panel";
import { ProjectInstructionsEditor } from "@/features/instructions/project-instructions-editor";
import { ConversationSidebar } from "@/features/sessions/conversation-sidebar";
import type { ModelProviderSaveStatus } from "@/features/model-providers/model-provider-page";
import { loadSessions } from "@/features/sessions/api";
import { getProjectName } from "@/features/sessions/session-utils";
import type { SessionInfo } from "@/features/sessions/types";
import { useSessionNavigation } from "@/features/sessions/use-session-navigation";
import { useI18n } from "@/i18n/use-i18n";
import {
  COLLAPSED_PRIMARY_NAV_WIDTH,
  DEFAULT_CONVERSATION_WIDTH,
  DEFAULT_INSPECTOR_WIDTH,
  DEFAULT_PRIMARY_NAV_WIDTH,
  HIDDEN_PRIMARY_NAV_WIDTH,
  fitPanelWidths,
  getConversationWidthBounds,
  getEffectivePrimaryNavWidth,
  getInspectorWidthBounds,
  isNarrowWorkspace,
  type PanelWidths,
} from "./panel-sizing";
import {
  ProjectPanel,
  ProjectPanelDock,
  type ProjectPanelTab,
} from "./project-panel";
import {
  readLayoutPreferences,
  writeLayoutPreferences,
} from "./layout-preferences";
import {
  shouldConfirmWorkspaceNavigation,
  type WorkspaceView,
} from "./workspace-navigation";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceSettings } from "./workspace-settings";
import { WorkspaceTopBar } from "./workspace-top-bar";

type DraftSession = {
  id: string;
  cwd: string;
  created: string;
};

export function AgentWorkspace() {
  const [primaryNavExpanded, setPrimaryNavExpanded] = useState(true);
  const [conversationOpen, setConversationOpen] = useState(true);
  const [projectPanelOpen, setProjectPanelOpen] = useState(false);
  const [projectPanelTab, setProjectPanelTab] =
    useState<ProjectPanelTab>("files");
  const [activeView, setActiveView] = useState<WorkspaceView>("chat");
  const [modelProviderDirty, setModelProviderDirty] = useState(false);
  const [contentGenerationDirty, setContentGenerationDirty] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(
    null,
  );
  const [activeCwd, setActiveCwd] = useState<string | null>(null);
  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null);
  const [draftSession, setDraftSession] = useState<DraftSession | null>(null);
  const [sessionSurface, setSessionSurface] = useState<"chat" | "generation">("chat");
  const [chatInstanceKey, setChatInstanceKey] = useState(0);
  const [branchState, setBranchState] = useState<BranchState | null>(null);
  const [modelsRevision, setModelsRevision] = useState(0);
  const [modelProviderSaveStatus, setModelProviderSaveStatus] =
    useState<ModelProviderSaveStatus>({ phase: "idle" });
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [systemPromptDirty, setSystemPromptDirty] = useState(false);
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string | null>(
    null,
  );
  const [instructionsNeedApply, setInstructionsNeedApply] = useState(false);
  const [projectInstructionsOpen, setProjectInstructionsOpen] = useState(false);
  const [projectInstructionsDirty, setProjectInstructionsDirty] =
    useState(false);
  const [initialSessionId, setInitialSessionId] = useState<
    string | null | undefined
  >(undefined);
  const [sessionRefreshKey, setSessionRefreshKey] = useState(0);
  const [explorerRefreshKey, setExplorerRefreshKey] = useState(0);
  const [panelWidths, setPanelWidths] = useState<PanelWidths>({
    conversation: DEFAULT_CONVERSATION_WIDTH,
    inspector: DEFAULT_INSPECTOR_WIDTH,
  });
  const [resizingPanel, setResizingPanel] = useState<
    "conversation" | "inspector" | null
  >(null);
  const [layoutPreferencesReady, setLayoutPreferencesReady] = useState(false);
  const [workspaceWidth, setWorkspaceWidth] = useState(1280);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const panelTransition = reduceMotion
    ? { duration: 0 }
    : {
        duration: 0.22,
        ease: [0.4, 0, 0.2, 1] as const,
      };
  const showProjectDock = activeView === "chat" && Boolean(activeCwd);
  const showProjectPanel = showProjectDock && projectPanelOpen;
  const narrowWorkspace = isNarrowWorkspace(workspaceWidth);
  const effectivePrimaryNavWidth = getEffectivePrimaryNavWidth(
    workspaceWidth,
    primaryNavExpanded,
    DEFAULT_PRIMARY_NAV_WIDTH,
  );
  const primaryNavHidden =
    effectivePrimaryNavWidth === HIDDEN_PRIMARY_NAV_WIDTH;
  const conversationBounds = getConversationWidthBounds(
    workspaceWidth,
    effectivePrimaryNavWidth,
    panelWidths.inspector,
    showProjectPanel,
    showProjectDock,
  );
  const inspectorBounds = getInspectorWidthBounds(
    workspaceWidth,
    effectivePrimaryNavWidth,
    panelWidths.conversation,
    conversationOpen && activeView === "chat",
    showProjectDock,
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInitialSessionId(
        new URLSearchParams(window.location.search).get("session"),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const preferences = readLayoutPreferences();
      setPrimaryNavExpanded(preferences.primaryNavExpanded);
      setConversationOpen(preferences.conversationOpen);
      setProjectPanelOpen(preferences.inspectorOpen);
      setPanelWidths(preferences.widths);
      setLayoutPreferencesReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!layoutPreferencesReady) return;
    writeLayoutPreferences({
      conversationOpen,
      inspectorOpen: projectPanelOpen,
      primaryNavExpanded,
      widths: panelWidths,
    });
  }, [
    conversationOpen,
    layoutPreferencesReady,
    panelWidths,
    primaryNavExpanded,
    projectPanelOpen,
  ]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    const fitToWorkspace = () => {
      setWorkspaceWidth(workspace.clientWidth);
      setPanelWidths((current) =>
        fitPanelWidths(workspace.clientWidth, current, {
          conversationOpen: conversationOpen && activeView === "chat",
          inspectorOpen: showProjectPanel,
          primaryNavExpanded,
          showInspectorDock: showProjectDock,
        }),
      );
    };
    const observer = new ResizeObserver(fitToWorkspace);
    observer.observe(workspace);
    fitToWorkspace();

    return () => observer.disconnect();
  }, [
    activeView,
    conversationOpen,
    primaryNavExpanded,
    showProjectDock,
    showProjectPanel,
  ]);

  const requestNavigation = useCallback(
    (targetView: WorkspaceView, action: () => void) => {
      if (projectInstructionsOpen && projectInstructionsDirty) {
        pendingNavigationRef.current = action;
        setConfirmingDiscard(true);
        return;
      }
      if (
        shouldConfirmWorkspaceNavigation(
          activeView,
          targetView,
          modelProviderDirty || contentGenerationDirty || systemPromptDirty,
        )
      ) {
        pendingNavigationRef.current = action;
        setConfirmingDiscard(true);
        return;
      }
      action();
    },
    [
      activeView,
      contentGenerationDirty,
      modelProviderDirty,
      projectInstructionsDirty,
      projectInstructionsOpen,
      systemPromptDirty,
    ],
  );

  const handleOpenModelProvider = useCallback(
    () =>
      requestNavigation("model-provider", () =>
        setActiveView("model-provider"),
      ),
    [requestNavigation],
  );
  const handleOpenSkills = useCallback(
    () =>
      requestNavigation("chat", () => {
        setActiveView("chat");
        setProjectPanelTab("skills");
        setProjectPanelOpen(true);
        setProjectInstructionsOpen(false);
      }),
    [requestNavigation],
  );
  function cancelDiscard() {
    pendingNavigationRef.current = null;
    setConfirmingDiscard(false);
  }

  function confirmDiscard() {
    const action = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setModelProviderDirty(false);
    setProjectInstructionsDirty(false);
    setSystemPromptDirty(false);
    setProjectInstructionsOpen(false);
    setConfirmingDiscard(false);
    action?.();
  }

  const updateSessionUrl = useCallback((sessionId: string | null) => {
    const url = new URL(window.location.href);
    if (sessionId) url.searchParams.set("session", sessionId);
    else url.searchParams.delete("session");
    window.history.replaceState(null, "", url);
  }, []);

  const resetChat = useCallback(() => {
    setChatInstanceKey((current) => current + 1);
    setCurrentSystemPrompt(null);
    setInstructionsNeedApply(false);
  }, []);

  const handleCwdChange = useCallback(
    (cwd: string) => {
      setActiveCwd(cwd);
      setOpenFile(null);
      if (selectedSession?.cwd !== cwd) setSelectedSession(null);
      setNewSessionCwd(cwd);
      setDraftSession(null);
      setActiveView("chat");
      setSessionSurface("chat");
      updateSessionUrl(null);
      resetChat();
    },
    [resetChat, selectedSession, updateSessionUrl],
  );

  const handleSelectSession = useCallback(
    (session: SessionInfo, isRestore = false) => {
      setActiveCwd(session.cwd);
      setSelectedSession(session);
      setNewSessionCwd(null);
      setDraftSession(null);
      setActiveView("chat");
      setSessionSurface("chat");
      if (!isRestore) updateSessionUrl(session.id);
      setChatInstanceKey((current) => current + 1);
    },
    [updateSessionUrl],
  );

  const handleNewSession = useCallback(
    (temporaryId: string, cwd: string) => {
      resetChat();
      setSelectedSession(null);
      setNewSessionCwd(cwd);
      setDraftSession({
        id: temporaryId,
        cwd,
        created: new Date().toISOString(),
      });
      setActiveView("chat");
      setSessionSurface("chat");
      updateSessionUrl(null);
    },
    [resetChat, updateSessionUrl],
  );

  const handleSessionDeleted = useCallback(
    (session: SessionInfo) => {
      if (selectedSession?.id !== session.id) return;
      setSelectedSession(null);
      setNewSessionCwd(session.cwd);
      setDraftSession({
        id: crypto.randomUUID(),
        cwd: session.cwd,
        created: new Date().toISOString(),
      });
      updateSessionUrl(null);
      setSessionSurface("chat");
      resetChat();
    },
    [resetChat, selectedSession, updateSessionUrl],
  );

  const selectSessionById = useCallback(
    async (sessionId: string) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const sessions = await loadSessions();
        const next = sessions.find((item) => item.id === sessionId);
        if (next) {
          handleSelectSession(next);
          setSessionRefreshKey((current) => current + 1);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
    },
    [handleSelectSession],
  );

  const handleAgentEnd = useCallback(() => {
    setSessionRefreshKey((current) => current + 1);
    setExplorerRefreshKey((current) => current + 1);
  }, []);

  const handleSessionCreated = useCallback(
    (sessionId: string) => {
      setNewSessionCwd(null);
      setDraftSession(null);
      void selectSessionById(sessionId);
    },
    [selectSessionById],
  );

  const handleSessionForked = useCallback(
    (sessionId: string) => void selectSessionById(sessionId),
    [selectSessionById],
  );

  const handleOpenFile = useCallback(
    (path: string, name: string, contentType?: string) => {
      requestNavigation("chat", () => {
        if (isRootAgentsFile(activeCwd, path, name)) {
          setOpenFile(null);
          setProjectInstructionsOpen(true);
          setProjectPanelTab("settings");
        } else {
          setProjectInstructionsOpen(false);
          setOpenFile({ path, name, contentType });
          setProjectPanelTab("files");
        }
        setProjectPanelOpen(true);
      });
    },
    [activeCwd, requestNavigation],
  );

  const handleOpenProjectInstructions = useCallback(() => {
    requestNavigation("chat", () => {
      setActiveView("chat");
      setOpenFile(null);
      setProjectInstructionsOpen(true);
      setProjectPanelTab("settings");
      setProjectPanelOpen(true);
    });
  }, [requestNavigation]);

  const handleInstructionsChanged = useCallback(() => {
    setExplorerRefreshKey((current) => current + 1);
    if (selectedSession) setInstructionsNeedApply(true);
  }, [selectedSession]);

  const handleToggleProjectPanel = useCallback(() => {
    if (!projectPanelOpen) {
      setProjectPanelOpen(true);
      return;
    }
    requestNavigation("chat", () => {
      setProjectPanelOpen(false);
      setProjectInstructionsOpen(false);
    });
  }, [projectPanelOpen, requestNavigation]);

  const handleProjectPanelTabChange = useCallback(
    (tab: ProjectPanelTab) => {
      requestNavigation("chat", () => {
        setActiveView("chat");
        if (tab === projectPanelTab && projectPanelOpen) {
          setProjectPanelOpen(false);
          setProjectInstructionsOpen(false);
          return;
        }
        setProjectPanelTab(tab);
        setProjectPanelOpen(true);
        setProjectInstructionsOpen(tab === "settings");
      });
    },
    [projectPanelOpen, projectPanelTab, requestNavigation],
  );

  const handleAtMention = useCallback((path: string) => {
    window.dispatchEvent(new CustomEvent("pi:mention-file", { detail: path }));
  }, []);

  const handleNavigationCwdChange = useCallback(
    (cwd: string) => requestNavigation("chat", () => handleCwdChange(cwd)),
    [handleCwdChange, requestNavigation],
  );
  const handleNavigationNewSession = useCallback(
    (temporaryId: string, cwd: string) =>
      requestNavigation("chat", () => handleNewSession(temporaryId, cwd)),
    [handleNewSession, requestNavigation],
  );
  const handleNavigationSelectSession = useCallback(
    (session: SessionInfo, isRestore = false) =>
      requestNavigation("chat", () => handleSelectSession(session, isRestore)),
    [handleSelectSession, requestNavigation],
  );
  const handleInitialRestoreDone = useCallback(
    () => updateSessionUrl(null),
    [updateSessionUrl],
  );
  const sessionNavigation = useSessionNavigation({
    draftSession,
    initialSessionId,
    onCwdChange: handleNavigationCwdChange,
    onInitialRestoreDone: handleInitialRestoreDone,
    onNewSession: handleNavigationNewSession,
    onSelectSession: handleNavigationSelectSession,
    onSessionDeleted: handleSessionDeleted,
    refreshKey: sessionRefreshKey,
    selectedCwd: activeCwd,
    selectedSessionId: selectedSession?.id ?? draftSession?.id ?? null,
  });
  const projectPanelContent = activeCwd ? (
    <ProjectPanel
      activeTab={projectPanelTab}
      cwd={activeCwd}
      file={openFile}
      onAtMention={handleAtMention}
      onClose={handleToggleProjectPanel}
      onOpenFile={handleOpenFile}
      projectName={getProjectName(activeCwd)}
      refreshKey={explorerRefreshKey}
      settingsContent={
        <ProjectInstructionsEditor
          agentId={selectedSession?.id}
          cwd={activeCwd}
          isRunning={branchState?.busy}
          needsApply={instructionsNeedApply}
          onChanged={handleInstructionsChanged}
          onApplied={() => setInstructionsNeedApply(false)}
          onDirtyChange={setProjectInstructionsDirty}
          onSystemPromptChange={setCurrentSystemPrompt}
        />
      }
    />
  ) : null;

  return (
    <TooltipProvider>
      <div
        className="relative h-dvh min-w-[1024px] overflow-hidden bg-[var(--workspace-bg)]"
        data-conversation-open={conversationOpen}
        data-project-panel-open={showProjectPanel}
        data-primary-nav-expanded={primaryNavExpanded}
        data-testid="agent-workspace"
        ref={workspaceRef}
      >
        <div
          className={
            activeView === "chat" ? "flex h-full min-h-0 min-w-0" : "hidden"
          }
        >
          <AnimatePresence initial={false}>
            {primaryNavHidden ? null : (
              <motion.aside
                animate={{
                  opacity: 1,
                  width: effectivePrimaryNavWidth,
                  x: 0,
                }}
                className="relative flex-none overflow-hidden bg-transparent"
                exit={{ opacity: 0, width: 0, x: -8 }}
                initial={{ opacity: 0, width: 0, x: -8 }}
                key="primary-navigation"
                transition={panelTransition}
              >
                <div
                  className="flex h-full flex-col"
                  style={{ width: `${effectivePrimaryNavWidth}px` }}
                >
                  <WorkspaceSidebar
                    activeView={activeView}
                    compact={
                      effectivePrimaryNavWidth === COLLAPSED_PRIMARY_NAV_WIDTH
                    }
                    navigation={sessionNavigation}
                    onOpenSettings={handleOpenModelProvider}
                    onToggleCompact={() => setPrimaryNavExpanded(false)}
                  />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          <div className="my-2 ml-2 flex min-w-0 flex-1 overflow-hidden rounded-l-xl rounded-r-sm bg-canvas">
            <AnimatePresence initial={false}>
              {conversationOpen ? (
                <motion.aside
                  animate={{
                    opacity: 1,
                    width: panelWidths.conversation,
                    x: 0,
                  }}
                  className="flex-none overflow-hidden bg-canvas"
                  exit={{ opacity: 0, width: 0, x: -8 }}
                  initial={{ opacity: 0, width: 0, x: -8 }}
                  key="conversation-panel"
                  transition={
                    resizingPanel === "conversation"
                      ? { duration: 0 }
                      : panelTransition
                  }
                >
                  <div
                    className="h-full flex-none"
                    style={{ width: `${panelWidths.conversation}px` }}
                  >
                    <ConversationSidebar
                      navigation={sessionNavigation}
                      onClose={() => setConversationOpen(false)}
                      onExpandPrimaryNavigation={() =>
                        setPrimaryNavExpanded(true)
                      }
                      primaryNavigationHidden={primaryNavHidden}
                    />
                  </div>
                </motion.aside>
              ) : null}
            </AnimatePresence>
            {conversationOpen ? (
              <ResizeHandle
                ariaLabel={t.workspace.resizeConversationSidebar}
                className="mt-11"
                direction={1}
                max={conversationBounds.max}
                min={conversationBounds.min}
                onResize={(conversation) =>
                  setPanelWidths((current) => ({
                    ...current,
                    conversation,
                  }))
                }
                onResizeEnd={() => setResizingPanel(null)}
                onResizeStart={() => setResizingPanel("conversation")}
                value={panelWidths.conversation}
              />
            ) : null}

            <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
              <WorkspaceTopBar
                activeView={activeView}
                branchActiveLeafId={branchState?.activeLeafId}
                branchRunning={branchState?.running}
                branchTree={branchState?.tree}
                onBranchChangeLeaf={
                  branchState
                    ? (leafId) => void branchState.changeLeaf(leafId)
                    : undefined
                }
                conversationOpen={conversationOpen}
                onExpandPrimaryNavigation={() => setPrimaryNavExpanded(true)}
                onToggleConversation={() =>
                  setConversationOpen((open) => !open)
                }
                primaryNavigationHidden={primaryNavHidden}
                showBranchHistory={Boolean(selectedSession)}
                sessionSurface={selectedSession ? sessionSurface : undefined}
                onSessionSurfaceChange={selectedSession ? setSessionSurface : undefined}
              />

              <div className="flex min-h-0 flex-1">
                {selectedSession && sessionSurface === "generation" ? (
                  <ContentGenerationCenter
                    key={selectedSession.id}
                    onChanged={handleAgentEnd}
                    session={selectedSession}
                  />
                ) : (
                  <ChatCenter
                    key={chatInstanceKey}
                    modelsRevision={modelsRevision}
                    newSessionCwd={newSessionCwd}
                    onAgentEnd={handleAgentEnd}
                    onBranchState={setBranchState}
                    onOpenModelProvider={handleOpenModelProvider}
                    onOpenSkills={handleOpenSkills}
                    onSessionCreated={handleSessionCreated}
                    onSessionForked={handleSessionForked}
                    onSystemPromptChange={setCurrentSystemPrompt}
                    projectName={activeCwd ? getProjectName(activeCwd) : null}
                    session={selectedSession}
                  />
                )}
              </div>
            </section>
          </div>

          {showProjectDock && !narrowWorkspace ? (
            <>
              {showProjectPanel && projectPanelContent ? (
                <ResizeHandle
                  ariaLabel={t.workspace.resizeProjectPanel}
                  className="bg-transparent"
                  direction={-1}
                  max={inspectorBounds.max}
                  min={inspectorBounds.min}
                  onResize={(inspector) =>
                    setPanelWidths((current) => ({ ...current, inspector }))
                  }
                  onResizeEnd={() => setResizingPanel(null)}
                  onResizeStart={() => setResizingPanel("inspector")}
                  value={panelWidths.inspector}
                />
              ) : null}
              <div className="my-2 ml-1 mr-2 flex flex-none overflow-hidden rounded-l-sm rounded-r-xl bg-canvas">
                <ProjectPanelDock
                  activeTab={projectPanelTab}
                  onSelect={handleProjectPanelTabChange}
                  open={projectPanelOpen}
                />
                <AnimatePresence initial={false}>
                  {showProjectPanel && projectPanelContent ? (
                    <motion.div
                      animate={{
                        opacity: 1,
                        width: panelWidths.inspector,
                        x: 0,
                      }}
                      className="min-w-0 flex-none overflow-hidden"
                      exit={{ opacity: 0, width: 0, x: 8 }}
                      initial={{ opacity: 0, width: 0, x: 8 }}
                      key="desktop-project-panel"
                      transition={
                        resizingPanel === "inspector"
                          ? { duration: 0 }
                          : panelTransition
                      }
                    >
                      <div
                        className="h-full flex-none"
                        style={{ width: `${panelWidths.inspector}px` }}
                      >
                        {projectPanelContent}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            </>
          ) : null}

          {showProjectDock && narrowWorkspace ? (
            <AnimatePresence initial={false}>
              {showProjectPanel && projectPanelContent ? (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  className="absolute top-2 right-2 bottom-2 z-30 flex"
                  exit={{ opacity: 0, x: 12 }}
                  initial={{ opacity: 0, x: 12 }}
                  key="narrow-project-panel"
                  transition={panelTransition}
                >
                  <ResizeHandle
                    ariaLabel={t.workspace.resizeProjectPanel}
                    className="bg-transparent"
                    direction={-1}
                    max={inspectorBounds.max}
                    min={inspectorBounds.min}
                    onResize={(inspector) =>
                      setPanelWidths((current) => ({ ...current, inspector }))
                    }
                    onResizeEnd={() => setResizingPanel(null)}
                    onResizeStart={() => setResizingPanel("inspector")}
                    value={panelWidths.inspector}
                  />
                  <div className="flex overflow-hidden rounded-xl border border-line-subtle bg-canvas shadow-floating">
                    <ProjectPanelDock
                      activeTab={projectPanelTab}
                      onSelect={handleProjectPanelTabChange}
                      open={projectPanelOpen}
                    />
                    <div
                      className="min-w-0 flex-none"
                      style={{ width: `${panelWidths.inspector}px` }}
                    >
                      {projectPanelContent}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  animate={{ opacity: 1, x: 0 }}
                  className="my-2 ml-2 mr-2 overflow-hidden rounded-xl bg-canvas"
                  exit={{ opacity: 0, x: 8 }}
                  initial={{ opacity: 0, x: 8 }}
                  key="narrow-project-dock"
                  transition={panelTransition}
                >
                  <ProjectPanelDock
                    activeTab={projectPanelTab}
                    onSelect={handleProjectPanelTabChange}
                    open={projectPanelOpen}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          ) : null}
        </div>

        {activeView === "model-provider" ? (
          <WorkspaceSettings
            agentId={selectedSession?.id}
            currentSystemPrompt={currentSystemPrompt}
            cwd={activeCwd ?? undefined}
            instructionsNeedApply={instructionsNeedApply}
            isRunning={branchState?.busy}
            modelProviderSaveStatus={modelProviderSaveStatus}
            onBack={() =>
              requestNavigation("chat", () => setActiveView("chat"))
            }
            onInstructionsApplied={() => setInstructionsNeedApply(false)}
            onInstructionsChanged={handleInstructionsChanged}
            onContentGenerationDirtyChange={setContentGenerationDirty}
            onModelDirtyChange={setModelProviderDirty}
            onModelsSaved={() => setModelsRevision((current) => current + 1)}
            onModelSaveStatusChange={setModelProviderSaveStatus}
            onOpenProjectInstructions={handleOpenProjectInstructions}
            onSystemPromptChange={setCurrentSystemPrompt}
            onSystemPromptDirtyChange={setSystemPromptDirty}
          />
        ) : null}

        <Dialog
          onOpenChange={(open) => {
            if (!open) cancelDiscard();
          }}
          open={confirmingDiscard}
        >
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>
                {projectInstructionsDirty || systemPromptDirty
                  ? t.instructions.discardChangesTitle
                  : t.models.discardChangesTitle}
              </DialogTitle>
              <DialogDescription>
                {projectInstructionsDirty || systemPromptDirty
                  ? t.instructions.discardChangesDescription
                  : t.models.discardChangesDescription}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button autoFocus onClick={cancelDiscard} variant="outline">
                {projectInstructionsDirty || systemPromptDirty
                  ? t.instructions.continueEditing
                  : t.models.continueEditing}
              </Button>
              <Button onClick={confirmDiscard} variant="destructive">
                {projectInstructionsDirty || systemPromptDirty
                  ? t.instructions.discardChanges
                  : t.models.discardChanges}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function isRootAgentsFile(cwd: string | null, filePath: string, name: string) {
  if (!cwd || name.toLowerCase() !== "agents.md") return false;
  const normalize = (value: string) =>
    value.replaceAll("\\", "/").replace(/\/$/, "").toLowerCase();
  return normalize(filePath) === `${normalize(cwd)}/agents.md`;
}
