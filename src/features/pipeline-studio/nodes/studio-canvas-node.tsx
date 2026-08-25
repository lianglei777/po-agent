"use client";

import { memo } from "react";
import { Button, Input, Tooltip } from "antd";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { Copy, FileMusic, Images, Trash2, FileVideo } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import type { StudioFlowNode } from "../model/studio-flow-nodes";
import { useCanvasStore } from "../state/canvas-store";
import { TextCanvasNode } from "./text-canvas-node";
import { ImageCanvasNode } from "./image-canvas-node";
import { VideoCanvasNode } from "./video-canvas-node";
import { getCanvasNodeBoundaryHandleStyle } from "./shared/canvas-node-connection-handle";

const TYPE_META = {
  image: { Icon: Images },
  video: { Icon: FileVideo },
  audio: { Icon: FileMusic },
} as const;

function StudioNodeComponent({ id, data, selected, dragging }: NodeProps<StudioFlowNode>) {
  const { t } = useI18n();
  const node = data.canvasNode;
  const canvas = node.data;
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const resizeNode = useCanvasStore((state) => state.resizeNode);
  const deleteNodes = useCanvasStore((state) => state.deleteNodes);
  const duplicateNodes = useCanvasStore((state) => state.duplicateNodes);
  const typeLabel = ({ text: t.pipeline.nodeText, image: t.pipeline.nodeImage, video: t.pipeline.nodeVideo, audio: t.pipeline.nodeAudio } as const)[canvas?.type ?? "text"];

  if (!canvas) return null;
  if (canvas.type === "text") {
    return <TextCanvasNode id={id} node={node} selected={selected} dragging={dragging} />;
  }
  if (canvas.type === "image") {
    return <ImageCanvasNode id={id} node={node} selected={selected} dragging={dragging} />;
  }
  if (canvas.type === "video") {
    return <VideoCanvasNode id={id} node={node} selected={selected} dragging={dragging} />;
  }

  const meta = TYPE_META[canvas.type];

  const patchData = (patch: Partial<typeof canvas>) => updateNodeData(id, { ...canvas, ...patch });
  const mediaUrl = canvas.url?.[0] || (canvas.workspaceFile || canvas.artifactIds?.length
    ? `/api/pipeline/canvas-nodes/${encodeURIComponent(id)}/media`
    : undefined);

  return (
    <article className="group h-full min-h-[140px] w-full min-w-[260px] overflow-hidden rounded-2xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-card)] data-[selected=true]:border-[var(--pl-accent)]" data-selected={selected}>
      <NodeResizer
        minWidth={260}
        minHeight={canvas.type === "audio" ? 140 : 180}
        isVisible={selected}
        lineClassName="!border-[var(--pl-accent)]"
        handleClassName="!size-2 !border-[var(--pl-accent)] !bg-[var(--pl-surface)]"
        onResizeEnd={(_, params) => resizeNode(id, params.width, params.height)}
      />
      <Handle type="target" position={Position.Left} style={getCanvasNodeBoundaryHandleStyle(Position.Left)} className="!size-3 !border-2 !border-[var(--pl-surface-elevated)] !bg-[var(--pl-accent)]" />
      <Handle type="source" position={Position.Right} style={getCanvasNodeBoundaryHandleStyle(Position.Right)} className="!size-3 !border-2 !border-[var(--pl-surface-elevated)] !bg-[var(--pl-accent)]" />

      <header className="pipeline-node-drag-handle flex h-11 cursor-grab items-center gap-2 border-b border-[var(--pl-border)] px-3 active:cursor-grabbing">
        <meta.Icon className="size-4 shrink-0 text-[var(--pl-accent)]" />
        <Input
          variant="borderless"
          value={canvas.name}
          onChange={(event) => patchData({ name: event.target.value })}
          className="nodrag !min-w-0 !flex-1 !px-0 !text-sm !font-medium !text-[var(--pl-text)]"
          aria-label={t.pipeline.nodeNameAria.replace("{type}", typeLabel)}
        />
        <div className="nodrag flex shrink-0 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100">
          <Tooltip title={t.pipeline.nodeCreateCopy}><Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => duplicateNodes([id])} /></Tooltip>
          <Tooltip title={t.pipeline.nodeDelete}><Button danger type="text" size="small" icon={<Trash2 className="size-3.5" />} onClick={() => deleteNodes([id])} /></Tooltip>
        </div>
      </header>

      <div className="nodrag nowheel h-[calc(100%-44px)] min-h-0">
        {canvas.type === "audio" ? (
          <div className="flex h-full min-h-[96px] items-center gap-3 px-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]"><FileMusic className="size-5" /></span>
            {mediaUrl ? <audio src={mediaUrl} controls className="w-full" /> : <span className="text-xs text-[var(--pl-text-muted)]">{t.pipeline.nodeAudioPlaceholder}</span>}
          </div>
        ) : (
          <div className="flex h-full min-h-[130px] flex-col items-center justify-center gap-2 bg-[var(--pl-surface-subtle)] text-[var(--pl-text-muted)]">
            <meta.Icon className="size-7 opacity-70" />
            <span className="text-xs">{t.pipeline.nodeMediaPlaceholder}</span>
          </div>
        )}
      </div>
    </article>
  );
}

export const StudioCanvasNode = memo(StudioNodeComponent);
export const studioNodeTypes = { studio: StudioCanvasNode };
