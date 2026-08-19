"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Tag } from "antd";
import { Lock } from "@/components/icons";

interface PipelineNodeData {
  entityId: string;
  projectId: string;
  label: string;
  description: string;
  status: string;
  locked?: boolean;
  __type: string;
  [key: string]: unknown;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "default",
  processing: "processing",
  completed: "success",
  ready: "success",
};

const TYPE_LABEL: Record<string, string> = {
  character: "角色",
  scene: "场景",
  prop: "道具",
  storyboard: "分镜",
  video: "视频",
};

function NodeShell({ data, selected }: NodeProps) {
  const d = data as PipelineNodeData;
  const nodeType = d.__type ?? "node";
  const isProcessing = d.status === "processing";
  const isFailed = d.status === "failed" || d.status === "error";
  const isLocked = d.locked === true;

  let borderClass = "border-[var(--pl-border-strong)]";
  if (selected) borderClass = "border-[var(--pl-accent)] ring-1 ring-[var(--pl-accent)]";
  else if (isFailed) borderClass = "border-[var(--pl-error)]";
  else if (isProcessing) borderClass = "border-[var(--pl-accent)]";

  let shadowClass = "shadow-[var(--pl-shadow-card)]";
  if (selected || isProcessing) shadowClass = "shadow-[var(--pl-shadow-hover)]";

  return (
    <div
      className={
        "relative min-w-[200px] max-w-[260px] rounded-lg border p-3 transition-shadow bg-[var(--pl-surface)] " +
        borderClass + " " + shadowClass
      }
    >
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-[var(--pl-accent)]" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-[var(--pl-accent)]" />
      {isLocked && (
        <Lock className="absolute right-2 top-2 size-3 text-[var(--pl-text-muted)]" />
      )}
      <div className="mb-2 flex items-center justify-between">
        <Tag color={STATUS_COLOR[d.status] ?? "default"} className="!m-0 !text-[10px] !leading-4">
          {TYPE_LABEL[nodeType] ?? nodeType}
        </Tag>
        <span className="text-[10px] text-[var(--pl-text-muted)]">
          {isProcessing ? "生成中" : isFailed ? "失败" : d.status}
        </span>
      </div>
      <div className="mb-2 flex h-[48px] items-center justify-center rounded-md bg-[var(--pl-surface-subtle)]">
        {isProcessing ? (
          <span className="animate-pulse text-xs text-[var(--pl-accent)]">...</span>
        ) : isFailed ? (
          <span className="text-xs text-[var(--pl-error)]">!</span>
        ) : (
          <span className="text-[10px] text-[var(--pl-text-muted)]">{(d.label ?? "?")[0]}</span>
        )}
      </div>
      <div className="text-sm font-medium text-[var(--pl-text)]">{d.label}</div>
      {d.description ? (
        <div className="mt-1 line-clamp-2 text-xs text-[var(--pl-text-secondary)]">{d.description}</div>
      ) : null}
      {isProcessing && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] rounded-b-lg bg-[var(--pl-accent)] opacity-60" />
      )}
    </div>
  );
}

export const CharacterNode = memo(NodeShell);
export const SceneNode = memo(NodeShell);
export const PropNode = memo(NodeShell);
export const StoryboardNode = memo(NodeShell);
export const VideoNode = memo(NodeShell);

export const pipelineNodeTypes = {
  character: CharacterNode,
  scene: SceneNode,
  prop: PropNode,
  storyboard: StoryboardNode,
  video: VideoNode,
};
