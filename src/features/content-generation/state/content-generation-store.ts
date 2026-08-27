import { createStore } from "zustand/vanilla";
import type {
  GenerationRouteDto,
  GenerationRunViewDto,
  GenerationProviderDescriptorDto,
} from "@/contracts/generation";

type StateUpdater<T> = T | ((current: T) => T);

export type ContentGenerationState = {
  routes: GenerationRouteDto[];
  centerSessionId: string | null;
  centerRevision: number;
  runs: GenerationRunViewDto[];
  selectedRouteId: string;
  centerLoading: boolean;
  centerLoadError: string;
  submitting: boolean;
  pendingActionId: string | null;
  centerError: string;
  providers: GenerationProviderDescriptorDto[];
  updatingId: string | null;
  settingsLoading: boolean;
  savingCredentialId: string | null;
  settingsError: string;
};

export type ContentGenerationActions = {
  setRoutes: (next: GenerationRouteDto[]) => void;
  setRuns: (
    sessionId: string,
    revision: number,
    next: StateUpdater<GenerationRunViewDto[]>,
  ) => boolean;
  setSelectedRouteId: (
    sessionId: string,
    revision: number,
    next: StateUpdater<string>,
  ) => boolean;
  applyCenterData: (
    sessionId: string,
    revision: number,
    routes: GenerationRouteDto[],
    runs: GenerationRunViewDto[],
  ) => boolean;
  activateCenterSession: (sessionId: string) => number;
  replaceRun: (
    sessionId: string,
    revision: number,
    next: GenerationRunViewDto,
  ) => boolean;
  setCenterLoading: (
    sessionId: string,
    revision: number,
    next: boolean,
  ) => boolean;
  setCenterLoadError: (
    sessionId: string,
    revision: number,
    next: string,
  ) => boolean;
  setSubmitting: (
    sessionId: string,
    revision: number,
    next: boolean,
  ) => boolean;
  setPendingActionId: (
    sessionId: string,
    revision: number,
    next: string | null,
  ) => boolean;
  setCenterError: (
    sessionId: string,
    revision: number,
    next: string,
  ) => boolean;
  applySettingsData: (
    routes: GenerationRouteDto[],
    providers: GenerationProviderDescriptorDto[],
  ) => void;
  beginSettingsLoad: () => void;
  updateRoute: (next: GenerationRouteDto) => void;
  updateProvider: (next: GenerationProviderDescriptorDto) => void;
  setProviderCredentialStatus: (providerId: string, next: boolean) => void;
  setUpdatingId: (next: string | null) => void;
  setSettingsLoading: (next: boolean) => void;
  setSavingCredentialId: (next: string | null) => void;
  setSettingsError: (next: string) => void;
};

export type ContentGenerationStore = ContentGenerationState &
  ContentGenerationActions;
export type ContentGenerationStoreApi = ReturnType<
  typeof createContentGenerationStore
>;

export const DEFAULT_CONTENT_GENERATION_STATE: ContentGenerationState = {
  routes: [],
  centerSessionId: null,
  centerRevision: 0,
  runs: [],
  selectedRouteId: "",
  centerLoading: true,
  centerLoadError: "",
  submitting: false,
  pendingActionId: null,
  centerError: "",
  providers: [],
  updatingId: null,
  settingsLoading: true,
  savingCredentialId: null,
  settingsError: "",
};

export function createContentGenerationStore(
  initialState: Partial<ContentGenerationState> = {},
) {
  return createStore<ContentGenerationStore>()((set, get) => ({
    ...DEFAULT_CONTENT_GENERATION_STATE,
    ...initialState,
    setRoutes: (routes) =>
      set((state) => ({
        routes,
        selectedRouteId: reconcileSelectedRoute(routes, state.selectedRouteId),
      })),
    setRuns: (sessionId, revision, next) =>
      updateCenterSession(get, set, sessionId, revision, (state) => ({
        runs: typeof next === "function" ? next(state.runs) : next,
      })),
    setSelectedRouteId: (sessionId, revision, next) =>
      updateCenterSession(get, set, sessionId, revision, (state) => ({
        selectedRouteId:
          typeof next === "function" ? next(state.selectedRouteId) : next,
      })),
    // 路由和会话任务一起落库，确保首屏不会渲染半完成的远程状态。
    applyCenterData: (sessionId, revision, routes, runs) =>
      updateCenterSession(get, set, sessionId, revision, (state) => ({
        routes,
        runs,
        selectedRouteId: reconcileSelectedRoute(
          routes,
          state.selectedRouteId,
        ),
        centerError: "",
        centerLoadError: "",
        centerLoading: false,
      })),
    activateCenterSession: (centerSessionId) => {
      const centerRevision = get().centerRevision + 1;
      set({
        centerSessionId,
        centerRevision,
        runs: [],
        selectedRouteId: "",
        centerLoading: true,
        centerLoadError: "",
        submitting: false,
        pendingActionId: null,
        centerError: "",
      });
      return centerRevision;
    },
    replaceRun: (sessionId, revision, next) =>
      updateCenterSession(get, set, sessionId, revision, (state) => ({
        runs: state.runs.map((view) =>
          view.run.id === next.run.id ? next : view,
        ),
      })),
    setCenterLoading: (sessionId, revision, centerLoading) =>
      updateCenterSession(get, set, sessionId, revision, () => ({
        centerLoading,
      })),
    setCenterLoadError: (sessionId, revision, centerLoadError) =>
      updateCenterSession(get, set, sessionId, revision, () => ({
        centerLoadError,
      })),
    setSubmitting: (sessionId, revision, submitting) =>
      updateCenterSession(get, set, sessionId, revision, () => ({
        submitting,
      })),
    setPendingActionId: (sessionId, revision, pendingActionId) =>
      updateCenterSession(get, set, sessionId, revision, () => ({
        pendingActionId,
      })),
    setCenterError: (sessionId, revision, centerError) =>
      updateCenterSession(get, set, sessionId, revision, () => ({
        centerError,
      })),
    applySettingsData: (routes, providers) =>
      set((state) => ({
        routes,
        selectedRouteId: reconcileSelectedRoute(
          routes,
          state.selectedRouteId,
        ),
        providers,
        settingsError: "",
        settingsLoading: false,
      })),
    beginSettingsLoad: () =>
      set({ settingsLoading: true, settingsError: "" }),
    updateRoute: (next) =>
      set((state) => {
        const previous = state.routes.find((route) => route.id === next.id);
        let routes = state.routes.map((route) =>
          route.id === next.id
            ? next
            : next.isDefault && route.capability === next.capability
              ? { ...route, isDefault: false }
              : route,
        );
        if (previous?.isDefault && !next.enabled && !next.isDefault) {
          const fallback = routes.find((route) =>
            route.enabled && route.capability === next.capability
          );
          if (fallback) {
            routes = routes.map((route) =>
              route.id === fallback.id ? { ...route, isDefault: true } : route
            );
          }
        }
        return {
          routes,
          selectedRouteId: reconcileSelectedRoute(
            routes,
            state.selectedRouteId,
          ),
        };
      }),
    updateProvider: (next) =>
      set((state) => ({
        providers: state.providers.map((provider) =>
          provider.providerId === next.providerId ? next : provider,
        ),
      })),
    setProviderCredentialStatus: (providerId, hasCredential) =>
      set((state) => ({
        providers: state.providers.map((provider) =>
          provider.providerId === providerId && provider.credential
            ? {
                ...provider,
                credential: { ...provider.credential, hasCredential },
              }
            : provider,
        ),
      })),
    setUpdatingId: (updatingId) => set({ updatingId }),
    setSettingsLoading: (settingsLoading) => set({ settingsLoading }),
    setSavingCredentialId: (savingCredentialId) => set({ savingCredentialId }),
    setSettingsError: (settingsError) => set({ settingsError }),
  }));
}

function updateCenterSession(
  get: () => ContentGenerationStore,
  set: (
    next:
      | Partial<ContentGenerationStore>
      | ((state: ContentGenerationStore) => Partial<ContentGenerationStore>),
  ) => void,
  sessionId: string,
  revision: number,
  update: (
    state: ContentGenerationStore,
  ) => Partial<ContentGenerationState>,
): boolean {
  // Workspace 级 Store 会跨 Session 存活，旧请求只能写回发起它的 Session。
  const current = get();
  if (
    current.centerSessionId !== sessionId ||
    current.centerRevision !== revision
  ) {
    return false;
  }
  set((state) => update(state));
  return true;
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
