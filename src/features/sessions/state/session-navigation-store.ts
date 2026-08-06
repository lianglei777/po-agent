import { createStore } from "zustand/vanilla";
import type { Project, SessionInfo } from "../types";

export type SessionNavigationState = {
  sessions: SessionInfo[];
  projects: Project[];
  loading: boolean;
  error: string;
  projectError: string;
  removingProject: string | null;
  refreshed: boolean;
};

export type SessionNavigationActions = {
  beginRefresh: (showLoading: boolean) => void;
  completeRefresh: (
    projects: Project[],
    sessions: SessionInfo[],
    finishLoading: boolean,
  ) => void;
  failRefresh: (message: string, finishLoading: boolean) => void;
  setRefreshed: (refreshed: boolean) => void;
  beginProjectRemoval: (cwd: string) => boolean;
  completeProjectRemoval: (cwd: string) => void;
  failProjectRemoval: (message: string) => void;
};

export type SessionNavigationStore =
  SessionNavigationState & SessionNavigationActions;
export type SessionNavigationStoreApi = ReturnType<
  typeof createSessionNavigationStore
>;

export const DEFAULT_SESSION_NAVIGATION_STATE: SessionNavigationState = {
  sessions: [],
  projects: [],
  loading: true,
  error: "",
  projectError: "",
  removingProject: null,
  refreshed: false,
};

export function createSessionNavigationStore(
  initialState: Partial<SessionNavigationState> = {},
) {
  return createStore<SessionNavigationStore>()((set, get) => ({
    ...DEFAULT_SESSION_NAVIGATION_STATE,
    ...initialState,
    beginRefresh: (showLoading) => {
      if (showLoading) set({ loading: true });
    },
    completeRefresh: (projects, sessions, finishLoading) =>
      set((state) => ({
        projects,
        sessions,
        error: "",
        // 后台刷新不能提前结束仍在进行的首次加载。
        loading: finishLoading ? false : state.loading,
      })),
    failRefresh: (error, finishLoading) =>
      set((state) => ({
        error,
        loading: finishLoading ? false : state.loading,
      })),
    setRefreshed: (refreshed) => set({ refreshed }),
    beginProjectRemoval: (cwd) => {
      // 删除请求必须串行，避免较晚返回的旧结果覆盖当前项目列表。
      if (get().removingProject) return false;
      set({ removingProject: cwd });
      return true;
    },
    completeProjectRemoval: (cwd) =>
      set((state) => ({
        projects: state.projects.filter((project) => project.path !== cwd),
        projectError: "",
        removingProject: null,
      })),
    failProjectRemoval: (projectError) =>
      set({ projectError, removingProject: null }),
  }));
}
