"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  createContentGenerationStore,
  type ContentGenerationStore,
  type ContentGenerationStoreApi,
} from "./content-generation-store";

const ContentGenerationStoreContext =
  createContext<ContentGenerationStoreApi | null>(null);

export function ContentGenerationStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  // 生成中心与设置页共享路由配置，但 Store 仍限制在当前工作区实例内。
  const [store] = useState(createContentGenerationStore);
  return (
    <ContentGenerationStoreContext.Provider value={store}>
      {children}
    </ContentGenerationStoreContext.Provider>
  );
}

export function useContentGenerationStore<T>(
  selector: (state: ContentGenerationStore) => T,
): T {
  const store = useContext(ContentGenerationStoreContext);
  if (!store) {
    throw new Error(
      "useContentGenerationStore must be used within ContentGenerationStoreProvider",
    );
  }
  return useStore(store, selector);
}
