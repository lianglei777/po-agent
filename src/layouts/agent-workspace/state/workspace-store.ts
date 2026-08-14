import { createStore } from "zustand/vanilla";
import type { BranchState } from "@/features/chat/branch-state";
import type { OpenFile } from "@/features/files/file-panel";
import type { SessionInfo } from "@/features/sessions/types";
import {
  DEFAULT_CONVERSATION_WIDTH,
  DEFAULT_INSPECTOR_WIDTH,
  type PanelWidths,
} from "../panel-sizing";
import type { ProjectPanelTab } from "../project-panel";
import type { WorkspaceView } from "../workspace-navigation";

export type DraftSession = {
  id: string;
  cwd: string;
  created: string;
};

export type SessionSurface = "chat" | "generation";

export type WorkspaceState = {
  activeView: WorkspaceView;
  activeCwd: string | null;
  selectedSession: SessionInfo | null;
  newSessionCwd: string | null;
  draftSession: DraftSession | null;
  sessionSurface: SessionSurface;
  chatInstanceKey: number;
  projectPanelOpen: boolean;
  projectPanelTab: ProjectPanelTab;
  openFile: OpenFile | null;
  projectInstructionsOpen: boolean;
  currentSystemPrompt: string | null;
  instructionsNeedApply: boolean;
  modelProviderDirty: boolean;
  contentGenerationDirty: boolean;
  webAccessDirty: boolean;
  systemPromptDirty: boolean;
  projectInstructionsDirty: boolean;
  sessionRefreshKey: number;
  explorerRefreshKey: number;
  modelsRevision: number;
  primaryNavExpanded: boolean;
  conversationOpen: boolean;
  panelWidths: PanelWidths;
  branchState: BranchState | null;
};

export type WorkspaceActions = {
  setActiveView: (view: WorkspaceView) => void;
  setSessionSurface: (surface: SessionSurface) => void;
  setProjectPanelOpen: (open: boolean) => void;
  setProjectPanelTab: (tab: ProjectPanelTab) => void;
  setOpenFile: (file: OpenFile | null) => void;
  setProjectInstructionsOpen: (open: boolean) => void;
  setCurrentSystemPrompt: (prompt: string | null) => void;
  setInstructionsNeedApply: (needsApply: boolean) => void;
  setModelProviderDirty: (dirty: boolean) => void;
  setContentGenerationDirty: (dirty: boolean) => void;
  setWebAccessDirty: (dirty: boolean) => void;
  setSystemPromptDirty: (dirty: boolean) => void;
  setProjectInstructionsDirty: (dirty: boolean) => void;
  setPrimaryNavExpanded: (expanded: boolean) => void;
  setConversationOpen: (open: boolean) => void;
  toggleConversation: () => void;
  setPanelWidths: (
    next: PanelWidths | ((current: PanelWidths) => PanelWidths),
  ) => void;
  applyLayoutPreferences: (preferences: {
    primaryNavExpanded: boolean;
    conversationOpen: boolean;
    inspectorOpen: boolean;
    widths: PanelWidths;
  }) => void;
  setBranchState: (branchState: BranchState | null) => void;
  changeCwd: (cwd: string) => void;
  selectSession: (session: SessionInfo) => void;
  startDraftSession: (draft: DraftSession) => void;
  completeDraftSession: () => void;
  replaceDeletedSession: (
    deletedSession: SessionInfo,
    replacement: DraftSession,
  ) => boolean;
  markAgentEnd: () => void;
  markSessionsChanged: () => void;
  markInstructionsChanged: () => void;
  markModelsSaved: () => void;
  discardNavigationChanges: () => void;
};

export type WorkspaceStore = WorkspaceState & WorkspaceActions;
export type WorkspaceStoreApi = ReturnType<typeof createWorkspaceStore>;

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  activeView: "chat",
  activeCwd: null,
  selectedSession: null,
  newSessionCwd: null,
  draftSession: null,
  sessionSurface: "chat",
  chatInstanceKey: 0,
  projectPanelOpen: false,
  projectPanelTab: "files",
  openFile: null,
  projectInstructionsOpen: false,
  currentSystemPrompt: null,
  instructionsNeedApply: false,
  modelProviderDirty: false,
  contentGenerationDirty: false,
  webAccessDirty: false,
  systemPromptDirty: false,
  projectInstructionsDirty: false,
  sessionRefreshKey: 0,
  explorerRefreshKey: 0,
  modelsRevision: 0,
  primaryNavExpanded: true,
  conversationOpen: true,
  panelWidths: {
    conversation: DEFAULT_CONVERSATION_WIDTH,
    inspector: DEFAULT_INSPECTOR_WIDTH,
  },
  branchState: null,
};

export function createWorkspaceStore(
  initialState: Partial<WorkspaceState> = {},
) {
  return createStore<WorkspaceStore>()((set, get) => ({
    ...DEFAULT_WORKSPACE_STATE,
    ...initialState,
    setActiveView: (activeView) => set({ activeView }),
    setSessionSurface: (sessionSurface) => set({ sessionSurface }),
    setProjectPanelOpen: (projectPanelOpen) => set({ projectPanelOpen }),
    setProjectPanelTab: (projectPanelTab) => set({ projectPanelTab }),
    setOpenFile: (openFile) => set({ openFile }),
    setProjectInstructionsOpen: (projectInstructionsOpen) =>
      set({ projectInstructionsOpen }),
    setCurrentSystemPrompt: (currentSystemPrompt) =>
      set({ currentSystemPrompt }),
    setInstructionsNeedApply: (instructionsNeedApply) =>
      set({ instructionsNeedApply }),
    setModelProviderDirty: (modelProviderDirty) => set({ modelProviderDirty }),
    setContentGenerationDirty: (contentGenerationDirty) =>
      set({ contentGenerationDirty }),
    setWebAccessDirty: (webAccessDirty) => set({ webAccessDirty }),
    setSystemPromptDirty: (systemPromptDirty) => set({ systemPromptDirty }),
    setProjectInstructionsDirty: (projectInstructionsDirty) =>
      set({ projectInstructionsDirty }),
    setPrimaryNavExpanded: (primaryNavExpanded) => set({ primaryNavExpanded }),
    setConversationOpen: (conversationOpen) => set({ conversationOpen }),
    toggleConversation: () =>
      set((state) => ({ conversationOpen: !state.conversationOpen })),
    setPanelWidths: (next) =>
      set((state) => ({
        panelWidths:
          typeof next === "function" ? next(state.panelWidths) : next,
      })),
    // 偏好恢复必须一次提交，避免多个面板在 hydration 后短暂使用互相矛盾的布局状态。
    applyLayoutPreferences: (preferences) =>
      set({
        primaryNavExpanded: preferences.primaryNavExpanded,
        conversationOpen: preferences.conversationOpen,
        projectPanelOpen: preferences.inspectorOpen,
        panelWidths: preferences.widths,
      }),
    setBranchState: (branchState) => set({ branchState }),
    changeCwd: (cwd) =>
      set((state) => ({
        activeCwd: cwd,
        selectedSession:
          state.selectedSession?.cwd === cwd ? state.selectedSession : null,
        newSessionCwd: cwd,
        draftSession: null,
        activeView: "chat",
        sessionSurface: "chat",
        openFile: null,
        chatInstanceKey: state.chatInstanceKey + 1,
        currentSystemPrompt: null,
        instructionsNeedApply: false,
      })),
    selectSession: (session) =>
      set((state) => {
        const keepsCurrentChatMounted =
          state.selectedSession?.id === session.id &&
          state.selectedSession.cwd === session.cwd;

        return {
          activeCwd: session.cwd,
          selectedSession: session,
          newSessionCwd: null,
          draftSession: null,
          activeView: "chat",
          sessionSurface: "chat",
          // 重复点击当前会话时保留 Chat 实例，避免消息区卸载重建产生闪烁。
          chatInstanceKey: keepsCurrentChatMounted
            ? state.chatInstanceKey
            : state.chatInstanceKey + 1,
        };
      }),
    startDraftSession: (draftSession) =>
      set((state) => ({
        activeCwd: draftSession.cwd,
        selectedSession: null,
        newSessionCwd: draftSession.cwd,
        draftSession,
        activeView: "chat",
        sessionSurface: "chat",
        chatInstanceKey: state.chatInstanceKey + 1,
        currentSystemPrompt: null,
        instructionsNeedApply: false,
      })),
    completeDraftSession: () =>
      set({
        newSessionCwd: null,
        draftSession: null,
      }),
    replaceDeletedSession: (deletedSession, replacement) => {
      if (get().selectedSession?.id !== deletedSession.id) return false;
      set((state) => ({
        selectedSession: null,
        newSessionCwd: deletedSession.cwd,
        draftSession: replacement,
        sessionSurface: "chat",
        chatInstanceKey: state.chatInstanceKey + 1,
        currentSystemPrompt: null,
        instructionsNeedApply: false,
      }));
      return true;
    },
    markAgentEnd: () =>
      set((state) => ({
        sessionRefreshKey: state.sessionRefreshKey + 1,
        explorerRefreshKey: state.explorerRefreshKey + 1,
      })),
    markSessionsChanged: () =>
      set((state) => ({ sessionRefreshKey: state.sessionRefreshKey + 1 })),
    markInstructionsChanged: () =>
      set((state) => ({
        explorerRefreshKey: state.explorerRefreshKey + 1,
        instructionsNeedApply: state.selectedSession
          ? true
          : state.instructionsNeedApply,
      })),
    markModelsSaved: () =>
      set((state) => ({ modelsRevision: state.modelsRevision + 1 })),
    discardNavigationChanges: () =>
      set({
        modelProviderDirty: false,
        contentGenerationDirty: false,
        webAccessDirty: false,
        systemPromptDirty: false,
        projectInstructionsDirty: false,
        projectInstructionsOpen: false,
      }),
  }));
}
