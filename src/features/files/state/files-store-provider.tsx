"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  createFilesStore,
  type FilesStore,
  type FilesStoreApi,
} from "./files-store";

const FilesStoreContext = createContext<FilesStoreApi | null>(null);

export function FilesStoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createFilesStore);
  return (
    <FilesStoreContext.Provider value={store}>
      {children}
    </FilesStoreContext.Provider>
  );
}

export function useFilesStore<T>(selector: (state: FilesStore) => T): T {
  const store = useContext(FilesStoreContext);
  if (!store) {
    throw new Error("useFilesStore must be used within FilesStoreProvider");
  }
  return useStore(store, selector);
}
