import { createStore } from "zustand/vanilla";
import type {
  GenerationRouteDto,
  GenerationRunViewDto,
} from "@/contracts/generation";

type StateUpdater<T> = T | ((current: T) => T);

export type ContentGenerationState = {
  routes: GenerationRouteDto[];
  runs: GenerationRunViewDto[];
  selectedRouteId: string;
  centerLoading: boolean;
  submitting: boolean;
  pendingActionId: string | null;
  centerError: string;
  hasCredential: boolean;
  providerEnabled: boolean;
  updatingId: string | null;
  settingsLoading: boolean;
  savingCredential: boolean;
  settingsError: string;
};

export type ContentGenerationActions = {
  setRoutes: (next: GenerationRouteDto[]) => void;
  setRuns: (next: StateUpdater<GenerationRunViewDto[]>) => void;
  setSelectedRouteId: (next: StateUpdater<string>) => void;
  applyCenterData: (
    routes: GenerationRouteDto[],
    runs: GenerationRunViewDto[],
  ) => void;
  resetCenter: () => void;
  replaceRun: (next: GenerationRunViewDto) => void;
  setCenterLoading: (next: boolean) => void;
  setSubmitting: (next: boolean) => void;
  setPendingActionId: (next: string | null) => void;
  setCenterError: (next: string) => void;
  applySettingsData: (
    routes: GenerationRouteDto[],
    hasCredential: boolean,
    providerEnabled: boolean,
  ) => void;
  updateRoute: (next: GenerationRouteDto) => void;
  setHasCredential: (next: boolean) => void;
  setProviderEnabled: (next: boolean) => void;
  setUpdatingId: (next: string | null) => void;
  setSettingsLoading: (next: boolean) => void;
  setSavingCredential: (next: boolean) => void;
  setSettingsError: (next: string) => void;
};

export type ContentGenerationStore = ContentGenerationState &
  ContentGenerationActions;
export type ContentGenerationStoreApi = ReturnType<
  typeof createContentGenerationStore
>;

export const DEFAULT_CONTENT_GENERATION_STATE: ContentGenerationState = {
  routes: [],
  runs: [],
  selectedRouteId: "",
  centerLoading: true,
  submitting: false,
  pendingActionId: null,
  centerError: "",
  hasCredential: false,
  providerEnabled: false,
  updatingId: null,
  settingsLoading: true,
  savingCredential: false,
  settingsError: "",
};

export function createContentGenerationStore(
  initialState: Partial<ContentGenerationState> = {},
) {
  return createStore<ContentGenerationStore>()((set) => ({
    ...DEFAULT_CONTENT_GENERATION_STATE,
    ...initialState,
    setRoutes: (routes) =>
      set((state) => ({
        routes,
        selectedRouteId: reconcileSelectedRoute(routes, state.selectedRouteId),
      })),
    setRuns: (next) =>
      set((state) => ({
        runs: typeof next === "function" ? next(state.runs) : next,
      })),
    setSelectedRouteId: (next) =>
      set((state) => ({
        selectedRouteId:
          typeof next === "function" ? next(state.selectedRouteId) : next,
      })),
    // 路由和会话任务一起落库，确保首屏不会渲染半完成的远程状态。
    applyCenterData: (routes, runs) =>
      set((state) => {
        return {
          routes,
          runs,
          selectedRouteId: reconcileSelectedRoute(
            routes,
            state.selectedRouteId,
          ),
          centerError: "",
          centerLoading: false,
        };
      }),
    resetCenter: () =>
      set({
        runs: [],
        selectedRouteId: "",
        centerLoading: true,
        submitting: false,
        pendingActionId: null,
        centerError: "",
      }),
    replaceRun: (next) =>
      set((state) => ({
        runs: state.runs.map((view) =>
          view.run.id === next.run.id ? next : view,
        ),
      })),
    setCenterLoading: (centerLoading) => set({ centerLoading }),
    setSubmitting: (submitting) => set({ submitting }),
    setPendingActionId: (pendingActionId) => set({ pendingActionId }),
    setCenterError: (centerError) => set({ centerError }),
    applySettingsData: (routes, hasCredential, providerEnabled) =>
      set((state) => ({
        routes,
        selectedRouteId: reconcileSelectedRoute(
          routes,
          state.selectedRouteId,
        ),
        hasCredential,
        providerEnabled,
        settingsError: "",
        settingsLoading: false,
      })),
    updateRoute: (next) =>
      set((state) => {
        const routes = state.routes.map((route) =>
          route.id === next.id ? next : route,
        );
        return {
          routes,
          selectedRouteId: reconcileSelectedRoute(
            routes,
            state.selectedRouteId,
          ),
        };
      }),
    setHasCredential: (hasCredential) => set({ hasCredential }),
    setProviderEnabled: (providerEnabled) => set({ providerEnabled }),
    setUpdatingId: (updatingId) => set({ updatingId }),
    setSettingsLoading: (settingsLoading) => set({ settingsLoading }),
    setSavingCredential: (savingCredential) => set({ savingCredential }),
    setSettingsError: (settingsError) => set({ settingsError }),
  }));
}

function reconcileSelectedRoute(
  routes: GenerationRouteDto[],
  selectedRouteId: string,
): string {
  const enabledRoutes = routes.filter((route) => route.enabled);
  return enabledRoutes.some((route) => route.id === selectedRouteId)
    ? selectedRouteId
    : (enabledRoutes[0]?.id ?? "");
}
