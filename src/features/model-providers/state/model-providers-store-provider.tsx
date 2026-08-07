"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import {
  createModelProvidersStore,
  type ModelProvidersStore,
  type ModelProvidersStoreApi,
} from "./model-providers-store";

const ModelProvidersStoreContext =
  createContext<ModelProvidersStoreApi | null>(null);

export function ModelProvidersStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  // 配置页面可以被保留挂载，Store 必须跟随页面实例而不是模块生命周期。
  const [store] = useState(createModelProvidersStore);
  return (
    <ModelProvidersStoreContext.Provider value={store}>
      {children}
    </ModelProvidersStoreContext.Provider>
  );
}

export function useModelProvidersStore<T>(
  selector: (state: ModelProvidersStore) => T,
): T {
  const store = useContext(ModelProvidersStoreContext);
  if (!store) {
    throw new Error(
      "useModelProvidersStore must be used within ModelProvidersStoreProvider",
    );
  }
  return useStore(store, selector);
}
