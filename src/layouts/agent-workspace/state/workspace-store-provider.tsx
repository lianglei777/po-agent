"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import {
  createWorkspaceStore,
  type WorkspaceStore,
  type WorkspaceStoreApi,
} from "./workspace-store";

const WorkspaceStoreContext = createContext<WorkspaceStoreApi | null>(null);

type WorkspaceStoreProviderProps = {
  children: ReactNode;
};

export function WorkspaceStoreProvider({
  children,
}: WorkspaceStoreProviderProps) {
  const [store] = useState(createWorkspaceStore);

  return (
    <WorkspaceStoreContext.Provider value={store}>
      {children}
    </WorkspaceStoreContext.Provider>
  );
}

export function useWorkspaceStore<T>(
  selector: (store: WorkspaceStore) => T,
): T {
  const store = useContext(WorkspaceStoreContext);
  if (!store) {
    throw new Error(
      "useWorkspaceStore must be used within WorkspaceStoreProvider",
    );
  }
  return useStore(store, selector);
}
