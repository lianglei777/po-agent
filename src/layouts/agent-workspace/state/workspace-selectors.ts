"use client";

import { useShallow } from "zustand/react/shallow";
import { useWorkspaceStore } from "./workspace-store-provider";

export function useWorkspaceViewState() {
  return useWorkspaceStore(
    useShallow((state) => ({
      activeView: state.activeView,
      projectPanelOpen: state.projectPanelOpen,
      projectPanelTab: state.projectPanelTab,
      openFile: state.openFile,
      setActiveView: state.setActiveView,
      setProjectPanelOpen: state.setProjectPanelOpen,
      setProjectPanelTab: state.setProjectPanelTab,
      setOpenFile: state.setOpenFile,
      setProjectInstructionsOpen: state.setProjectInstructionsOpen,
    })),
  );
}

export function useWorkspaceSessionState() {
  return useWorkspaceStore(
    useShallow((state) => ({
      activeCwd: state.activeCwd,
      selectedSession: state.selectedSession,
      newSessionCwd: state.newSessionCwd,
      draftSession: state.draftSession,
      sessionSurface: state.sessionSurface,
      chatInstanceKey: state.chatInstanceKey,
      currentSystemPrompt: state.currentSystemPrompt,
      instructionsNeedApply: state.instructionsNeedApply,
      sessionRefreshKey: state.sessionRefreshKey,
      explorerRefreshKey: state.explorerRefreshKey,
      modelsRevision: state.modelsRevision,
      setSessionSurface: state.setSessionSurface,
      setCurrentSystemPrompt: state.setCurrentSystemPrompt,
      setInstructionsNeedApply: state.setInstructionsNeedApply,
      changeCwd: state.changeCwd,
      selectSession: state.selectSession,
      startDraftSession: state.startDraftSession,
      completeDraftSession: state.completeDraftSession,
      replaceDeletedSession: state.replaceDeletedSession,
      markAgentEnd: state.markAgentEnd,
      markSessionsChanged: state.markSessionsChanged,
      markInstructionsChanged: state.markInstructionsChanged,
    })),
  );
}

export function useWorkspaceSettingsActions() {
  return useWorkspaceStore(
    useShallow((state) => ({
      setModelProviderDirty: state.setModelProviderDirty,
      setContentGenerationDirty: state.setContentGenerationDirty,
      setWebAccessDirty: state.setWebAccessDirty,
      setSystemPromptDirty: state.setSystemPromptDirty,
      setProjectInstructionsDirty: state.setProjectInstructionsDirty,
      markModelsSaved: state.markModelsSaved,
    })),
  );
}

export function useWorkspaceLayoutState() {
  return useWorkspaceStore(
    useShallow((state) => ({
      primaryNavExpanded: state.primaryNavExpanded,
      conversationOpen: state.conversationOpen,
      panelWidths: state.panelWidths,
      branchState: state.branchState,
      setPrimaryNavExpanded: state.setPrimaryNavExpanded,
      setConversationOpen: state.setConversationOpen,
      toggleConversation: state.toggleConversation,
      setPanelWidths: state.setPanelWidths,
      applyLayoutPreferences: state.applyLayoutPreferences,
      setBranchState: state.setBranchState,
    })),
  );
}
