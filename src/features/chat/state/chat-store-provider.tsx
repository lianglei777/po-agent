"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import {
  createChatStore,
  type ChatStore,
  type ChatStoreApi,
} from "./chat-store";

const ChatStoreContext = createContext<ChatStoreApi | null>(null);

export function ChatStoreProvider({
  children,
  initialLoading,
}: {
  children: ReactNode;
  initialLoading: boolean;
}) {
  // ChatCenter 由 session key 控制重建，因此每次会话切换都会得到隔离的新 Store。
  const [store] = useState(() => createChatStore({ loading: initialLoading }));

  return (
    <ChatStoreContext.Provider value={store}>
      {children}
    </ChatStoreContext.Provider>
  );
}

export function useChatStore<T>(selector: (state: ChatStore) => T): T {
  const store = useContext(ChatStoreContext);
  if (!store) {
    throw new Error("useChatStore must be used within ChatStoreProvider");
  }
  return useStore(store, selector);
}
