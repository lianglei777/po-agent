"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  createSkillsStore,
  type SkillsStore,
  type SkillsStoreApi,
} from "./skills-store";

const SkillsStoreContext = createContext<SkillsStoreApi | null>(null);

export function SkillsStoreProvider({ children }: { children: ReactNode }) {
  // 每个 Skills 页面实例独立持有状态，避免项目切换时复用旧项目的选择和反馈。
  const [store] = useState(createSkillsStore);
  return (
    <SkillsStoreContext.Provider value={store}>
      {children}
    </SkillsStoreContext.Provider>
  );
}

export function useSkillsStore<T>(
  selector: (state: SkillsStore) => T,
): T {
  const store = useContext(SkillsStoreContext);
  if (!store) {
    throw new Error("useSkillsStore must be used within SkillsStoreProvider");
  }
  return useStore(store, selector);
}
