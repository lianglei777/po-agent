import { createStore } from "zustand/vanilla";
import type {
  ApiKeyProvider,
  ModelDiscoveryResult,
  ModelsJson,
  OAuthProvider,
  Selection,
} from "../types";

type StateUpdater<T> = T | ((current: T) => T);

export type DiscoveryState =
  | { phase: "idle" }
  | { phase: "discovering"; providerName: string }
  | (ModelDiscoveryResult & { phase: "result"; providerName: string })
  | { phase: "error"; providerName: string; message: string };

export type ModelProvidersState = {
  config: ModelsJson;
  baselineConfig: ModelsJson | null;
  oauthProviders: OAuthProvider[];
  apiKeyProviders: ApiKeyProvider[];
  selection: Selection | null;
  loading: boolean;
  loadError: string | null;
  saving: boolean;
  saveError: string | null;
  saveRetryAvailable: boolean;
  savedOk: boolean;
  discovery: DiscoveryState;
};

export type ModelProvidersActions = {
  setConfig: (next: StateUpdater<ModelsJson>) => void;
  setBaselineConfig: (next: ModelsJson | null) => void;
  setOauthProviders: (next: OAuthProvider[]) => void;
  setApiKeyProviders: (next: StateUpdater<ApiKeyProvider[]>) => void;
  setSelection: (next: StateUpdater<Selection | null>) => void;
  setLoading: (next: boolean) => void;
  setLoadError: (next: string | null) => void;
  setSaving: (next: boolean) => void;
  setSaveError: (next: string | null) => void;
  setSaveRetryAvailable: (next: boolean) => void;
  setSavedOk: (next: boolean) => void;
  setDiscovery: (next: DiscoveryState) => void;
};

export type ModelProvidersStore = ModelProvidersState & ModelProvidersActions;
export type ModelProvidersStoreApi = ReturnType<
  typeof createModelProvidersStore
>;

const EMPTY_CONFIG: ModelsJson = { providers: {} };

function resolveUpdater<T>(current: T, next: StateUpdater<T>): T {
  return typeof next === "function"
    ? (next as (value: T) => T)(current)
    : next;
}

export function createModelProvidersStore() {
  return createStore<ModelProvidersStore>()((set) => ({
    config: EMPTY_CONFIG,
    baselineConfig: null,
    oauthProviders: [],
    apiKeyProviders: [],
    selection: null,
    loading: true,
    loadError: null,
    saving: false,
    saveError: null,
    saveRetryAvailable: false,
    savedOk: false,
    discovery: { phase: "idle" },
    setConfig: (next) =>
      set((state) => ({ config: resolveUpdater(state.config, next) })),
    setBaselineConfig: (baselineConfig) => set({ baselineConfig }),
    setOauthProviders: (oauthProviders) => set({ oauthProviders }),
    setApiKeyProviders: (next) =>
      set((state) => ({
        apiKeyProviders: resolveUpdater(state.apiKeyProviders, next),
      })),
    setSelection: (next) =>
      set((state) => ({
        selection: resolveUpdater(state.selection, next),
      })),
    setLoading: (loading) => set({ loading }),
    setLoadError: (loadError) => set({ loadError }),
    setSaving: (saving) => set({ saving }),
    setSaveError: (saveError) => set({ saveError }),
    setSaveRetryAvailable: (saveRetryAvailable) =>
      set({ saveRetryAvailable }),
    setSavedOk: (savedOk) => set({ savedOk }),
    setDiscovery: (discovery) => set({ discovery }),
  }));
}
