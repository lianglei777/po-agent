import { createStore } from "zustand/vanilla";
import type { FileEntry } from "../types";

type StateUpdater<T> = T | ((current: T) => T);

export type FilesState = {
  explorerVisible: boolean;
  entriesByPath: Record<string, FileEntry[]>;
  expanded: Set<string>;
  loading: Set<string>;
  error: string;
};

export type FilesActions = {
  setExplorerVisible: (next: boolean) => void;
  setEntriesByPath: (
    next: StateUpdater<Record<string, FileEntry[]>>,
  ) => void;
  setExpanded: (next: StateUpdater<Set<string>>) => void;
  setLoading: (next: StateUpdater<Set<string>>) => void;
  setError: (next: string) => void;
  resetTree: () => void;
};

export type FilesStore = FilesState & FilesActions;
export type FilesStoreApi = ReturnType<typeof createFilesStore>;

export const DEFAULT_FILES_STATE: FilesState = {
  explorerVisible: true,
  entriesByPath: {},
  expanded: new Set<string>(),
  loading: new Set<string>(),
  error: "",
};

export function createFilesStore(initialState: Partial<FilesState> = {}) {
  return createStore<FilesStore>()((set) => ({
    ...DEFAULT_FILES_STATE,
    // 可变集合必须按 Store 实例创建，不能共享默认对象引用。
    expanded: initialState.expanded ?? new Set<string>(),
    loading: initialState.loading ?? new Set<string>(),
    ...initialState,
    setExplorerVisible: (explorerVisible) => set({ explorerVisible }),
    setEntriesByPath: (next) =>
      set((state) => ({
        entriesByPath:
          typeof next === "function" ? next(state.entriesByPath) : next,
      })),
    setExpanded: (next) =>
      set((state) => ({
        expanded: typeof next === "function" ? next(state.expanded) : next,
      })),
    setLoading: (next) =>
      set((state) => ({
        loading: typeof next === "function" ? next(state.loading) : next,
      })),
    setError: (error) => set({ error }),
    resetTree: () =>
      set({ entriesByPath: {}, expanded: new Set(), loading: new Set(), error: "" }),
  }));
}
