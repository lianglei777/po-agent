"use client";

import { AgentWorkspace } from "@/layouts/agent-workspace/agent-workspace";
import { PipelineApp } from "@/layouts/pipeline-app/pipeline-app";
import { useWorkspaceMode } from "@/layouts/workspace-mode-state";

// 根级模式切换器。mode === "pipeline" 时渲染 PipelineApp，否则渲染 AgentWorkspace。
// 两个模式是完全独立的应用，切换时卸载旧模式组件树。
export function WorkspaceModeRoot() {
  const mode = useWorkspaceMode((s) => s.mode);
  return mode === "pipeline" ? <PipelineApp /> : <AgentWorkspace />;
}
