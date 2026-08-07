import { createStore } from "zustand/vanilla";
import type { InstructionDocument } from "@/contracts/instructions";

type StateUpdater<T> = T | ((current: T) => T);

export type InstructionEditorState = {
  doc: InstructionDocument | null;
  draft: string;
  loading: boolean;
  saving: boolean;
  deleting: boolean;
  error: string;
  conflict: boolean;
};

export type InstructionsState = {
  projectEditor: InstructionEditorState;
  confirmProjectDelete: boolean;
  applyingProject: boolean;
  projectApplyError: string;
  projectApplySuccess: boolean;
  globalEditor: InstructionEditorState;
  workbenchProjectDoc: InstructionDocument | null;
  workbenchProjectLoading: boolean;
  reloadBusy: boolean;
  reloadError: string;
  reloadSuccess: boolean;
  confirmGlobalDelete: boolean;
  activeView: "effective" | "global" | "project";
};

export type InstructionsActions = {
  setProjectEditor: (next: StateUpdater<InstructionEditorState>) => void;
  setProjectEditorField: <K extends keyof InstructionEditorState>(
    field: K,
    next: StateUpdater<InstructionEditorState[K]>,
  ) => void;
  setConfirmProjectDelete: (next: boolean) => void;
  setApplyingProject: (next: boolean) => void;
  setProjectApplyError: (next: string) => void;
  setProjectApplySuccess: (next: boolean) => void;
  setGlobalEditor: (next: StateUpdater<InstructionEditorState>) => void;
  setWorkbenchProjectDoc: (next: InstructionDocument | null) => void;
  setWorkbenchProjectLoading: (next: boolean) => void;
  setReloadBusy: (next: boolean) => void;
  setReloadError: (next: string) => void;
  setReloadSuccess: (next: boolean) => void;
  setConfirmGlobalDelete: (next: boolean) => void;
  setActiveView: (next: InstructionsState["activeView"]) => void;
};

export type InstructionsStore = InstructionsState & InstructionsActions;
export type InstructionsStoreApi = ReturnType<typeof createInstructionsStore>;

export const EMPTY_INSTRUCTION_EDITOR: InstructionEditorState = {
  doc: null,
  draft: "",
  loading: false,
  saving: false,
  deleting: false,
  error: "",
  conflict: false,
};

export function createInstructionsStore() {
  return createStore<InstructionsStore>()((set) => ({
    projectEditor: { ...EMPTY_INSTRUCTION_EDITOR, loading: true },
    confirmProjectDelete: false,
    applyingProject: false,
    projectApplyError: "",
    projectApplySuccess: false,
    globalEditor: { ...EMPTY_INSTRUCTION_EDITOR },
    workbenchProjectDoc: null,
    workbenchProjectLoading: false,
    reloadBusy: false,
    reloadError: "",
    reloadSuccess: false,
    confirmGlobalDelete: false,
    activeView: "effective",
    setProjectEditor: (next) =>
      set((state) => ({
        projectEditor:
          typeof next === "function" ? next(state.projectEditor) : next,
      })),
    setProjectEditorField: (field, next) =>
      set((state) => ({
        projectEditor: {
          ...state.projectEditor,
          [field]:
            typeof next === "function"
              ? next(state.projectEditor[field])
              : next,
        },
      })),
    setConfirmProjectDelete: (confirmProjectDelete) =>
      set({ confirmProjectDelete }),
    setApplyingProject: (applyingProject) => set({ applyingProject }),
    setProjectApplyError: (projectApplyError) => set({ projectApplyError }),
    setProjectApplySuccess: (projectApplySuccess) =>
      set({ projectApplySuccess }),
    setGlobalEditor: (next) =>
      set((state) => ({
        globalEditor:
          typeof next === "function" ? next(state.globalEditor) : next,
      })),
    setWorkbenchProjectDoc: (workbenchProjectDoc) =>
      set({ workbenchProjectDoc }),
    setWorkbenchProjectLoading: (workbenchProjectLoading) =>
      set({ workbenchProjectLoading }),
    setReloadBusy: (reloadBusy) => set({ reloadBusy }),
    setReloadError: (reloadError) => set({ reloadError }),
    setReloadSuccess: (reloadSuccess) => set({ reloadSuccess }),
    setConfirmGlobalDelete: (confirmGlobalDelete) =>
      set({ confirmGlobalDelete }),
    setActiveView: (activeView) => set({ activeView }),
  }));
}
