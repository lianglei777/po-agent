"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceMode = "agent" | "pipeline";

interface WorkspaceModeState {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  toggleMode: () => void;
}

// 只持久化 mode 一个字段。两个模式各自负责自己的状态恢复：
// Agent 从 Pi Session 恢复，Pipeline 从 SQLite 恢复。
export const useWorkspaceMode = create<WorkspaceModeState>()(
  persist(
    (set) => ({
      mode: "agent",
      setMode: (mode) => set({ mode }),
      toggleMode: () =>
        set((s) => ({ mode: s.mode === "agent" ? "pipeline" : "agent" })),
    }),
    { name: "workspace-mode" },
  ),
);
