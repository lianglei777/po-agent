"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import {
  createSessionNavigationStore,
  type SessionNavigationStore,
  type SessionNavigationStoreApi,
} from "./session-navigation-store";

const SessionNavigationStoreContext =
  createContext<SessionNavigationStoreApi | null>(null);

export function SessionNavigationStoreProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Store 跟随 Workspace 实例创建，避免模块级状态在 SSR 请求或测试之间共享。
  const [store] = useState(createSessionNavigationStore);

  return (
    <SessionNavigationStoreContext.Provider value={store}>
      {children}
    </SessionNavigationStoreContext.Provider>
  );
}

export function useSessionNavigationStore<T>(
  selector: (store: SessionNavigationStore) => T,
): T {
  const store = useContext(SessionNavigationStoreContext);
  if (!store) {
    throw new Error(
      "useSessionNavigationStore must be used within SessionNavigationStoreProvider",
    );
  }
  return useStore(store, selector);
}
