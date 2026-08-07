"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  createInstructionsStore,
  type InstructionsStore,
  type InstructionsStoreApi,
} from "./instructions-store";

const InstructionsStoreContext = createContext<InstructionsStoreApi | null>(
  null,
);

export function InstructionsStoreProvider({ children }: { children: ReactNode }) {
  // 两种编辑界面复用状态模型，但每个挂载实例独立维护草稿与冲突信息。
  const [store] = useState(createInstructionsStore);
  return (
    <InstructionsStoreContext.Provider value={store}>
      {children}
    </InstructionsStoreContext.Provider>
  );
}

export function useInstructionsStore<T>(
  selector: (state: InstructionsStore) => T,
): T {
  const store = useContext(InstructionsStoreContext);
  if (!store) {
    throw new Error(
      "useInstructionsStore must be used within InstructionsStoreProvider",
    );
  }
  return useStore(store, selector);
}
