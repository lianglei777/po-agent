import { createStore } from "zustand/vanilla";
import {
  reconcileSelectedSkill,
  reconcileSelectedSkillPack,
} from "../skill-state";
import type { SkillLoadResult, SkillPackLoadResult } from "../types";

type StateUpdater<T> = T | ((current: T) => T);

export type PackMutation = {
  operation: "install" | "install-source" | "remove" | "update" | "repair";
  packId: string | null;
} | null;

export type SkillsView = "skills" | "packs";
export type SkillsScreen =
  | "list"
  | "add-skill"
  | "skill-detail"
  | "pack-detail";

export type SkillsState = {
  skillsResult: SkillLoadResult;
  selectedSkillId: string | null;
  skillsLoading: boolean;
  savingSkillId: string | null;
  removingSkillId: string | null;
  skillsError: string | null;
  packsResult: SkillPackLoadResult;
  selectedPackId: string | null;
  packsLoading: boolean;
  packMutation: PackMutation;
  packsError: string | null;
  addingPack: boolean;
  view: SkillsView;
  screen: SkillsScreen;
  removeSuccess: string | null;
  packSuccess: string | null;
};

export type SkillsActions = {
  applySkillsResult: (next: SkillLoadResult) => void;
  setSelectedSkillId: (next: StateUpdater<string | null>) => void;
  setSkillsLoading: (next: boolean) => void;
  setSavingSkillId: (next: string | null) => void;
  setRemovingSkillId: (next: string | null) => void;
  setSkillsError: (next: string | null) => void;
  applyPacksResult: (next: SkillPackLoadResult) => void;
  setSelectedPackId: (next: StateUpdater<string | null>) => void;
  setPacksLoading: (next: boolean) => void;
  setPackMutation: (next: PackMutation) => void;
  setPacksError: (next: string | null) => void;
  setAddingPack: (next: boolean) => void;
  selectView: (next: SkillsView) => void;
  setView: (next: SkillsView) => void;
  setScreen: (next: SkillsScreen) => void;
  setRemoveSuccess: (next: string | null) => void;
  setPackSuccess: (next: string | null) => void;
};

export type SkillsStore = SkillsState & SkillsActions;
export type SkillsStoreApi = ReturnType<typeof createSkillsStore>;

export const DEFAULT_SKILLS_STATE: SkillsState = {
  skillsResult: { skills: [], diagnostics: [] },
  selectedSkillId: null,
  skillsLoading: true,
  savingSkillId: null,
  removingSkillId: null,
  skillsError: null,
  packsResult: { packs: [] },
  selectedPackId: null,
  packsLoading: true,
  packMutation: null,
  packsError: null,
  addingPack: false,
  view: "skills",
  screen: "list",
  removeSuccess: null,
  packSuccess: null,
};

export function createSkillsStore(initialState: Partial<SkillsState> = {}) {
  return createStore<SkillsStore>()((set) => ({
    ...DEFAULT_SKILLS_STATE,
    ...initialState,
    // 数据刷新与选中项校正必须原子完成，避免详情页短暂指向已删除资源。
    applySkillsResult: (skillsResult) =>
      set((state) => ({
        skillsResult,
        selectedSkillId: reconcileSelectedSkill(
          skillsResult.skills,
          state.selectedSkillId,
        ),
      })),
    setSelectedSkillId: (next) =>
      set((state) => ({
        selectedSkillId:
          typeof next === "function" ? next(state.selectedSkillId) : next,
      })),
    setSkillsLoading: (skillsLoading) => set({ skillsLoading }),
    setSavingSkillId: (savingSkillId) => set({ savingSkillId }),
    setRemovingSkillId: (removingSkillId) => set({ removingSkillId }),
    setSkillsError: (skillsError) => set({ skillsError }),
    applyPacksResult: (packsResult) =>
      set((state) => ({
        packsResult,
        selectedPackId: reconcileSelectedSkillPack(
          packsResult.packs,
          state.selectedPackId,
        ),
      })),
    setSelectedPackId: (next) =>
      set((state) => ({
        selectedPackId:
          typeof next === "function" ? next(state.selectedPackId) : next,
      })),
    setPacksLoading: (packsLoading) => set({ packsLoading }),
    setPackMutation: (packMutation) => set({ packMutation }),
    setPacksError: (packsError) => set({ packsError }),
    setAddingPack: (addingPack) => set({ addingPack }),
    // 切换资源类型时同步返回列表，避免保留另一类资源的详情页状态。
    selectView: (view) => set({ view, screen: "list" }),
    setView: (view) => set({ view }),
    setScreen: (screen) => set({ screen }),
    setRemoveSuccess: (removeSuccess) => set({ removeSuccess }),
    setPackSuccess: (packSuccess) => set({ packSuccess }),
  }));
}
