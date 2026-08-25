"use client";

import { useCallback, useRef, useState } from "react";
import { App, Modal, Spin, Tooltip } from "antd";
import { Position } from "@xyflow/react";
import type { CanvasNode } from "@/contracts/pipeline";
import { Copy, Download, FileVideo, PlayCircle, RefreshCw, Sparkles, Trash2 } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { resolveCanvasMediaSource, shouldDeferCanvasMediaLoad } from "../model/canvas-media-source";
import { useCanvasStore } from "../state/canvas-store";
import { VideoAiComposer } from "./video-ai-composer";
import { CanvasNodeConnectionHandle } from "./shared/canvas-node-connection-handle";
import { CanvasNodeContextToolbar, CanvasNodeToolbarButton } from "./shared/canvas-node-context-toolbar";
import { CanvasNodeResizeControl } from "./shared/canvas-node-resize-control";
import { CanvasNodeTitle } from "./shared/canvas-node-title";

export function VideoCanvasNode({
  id,
  node,
  selected,
  dragging,
}: {
  id: string;
  node: CanvasNode;
  selected: boolean;
  dragging: boolean;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const applyServerNodeData = useCanvasStore((state) => state.applyServerNodeData);
  const insertServerNode = useCanvasStore((state) => state.insertServerNode);
  const singleSelected = useCanvasStore((state) => state.selectedNodeIds.length === 1 && state.selectedNodeIds[0] === id);
  const composerActive = useCanvasStore((state) => state.activeComposerNodeId === id);
  const activateNodeComposer = useCanvasStore((state) => state.activateNodeComposer);
  const deleteNodes = useCanvasStore((state) => state.deleteNodes);
  const duplicateNodes = useCanvasStore((state) => state.duplicateNodes);
  const setNodeUploading = useCanvasStore((state) => state.setNodeUploading);
  const hasIncomingConnection = useCanvasStore((state) => state.edges.some((edge) => edge.targetNodeId === id));
  const awaitingNodeCreation = useCanvasStore((state) => state.pendingMutations.some((mutation) => (
    mutation.type === "node.create" && mutation.node.id === id
  )));
  const waitingForSave = useCanvasStore((state) => state.pendingMutations.some((mutation) => (
    mutation.type === "node.create" ? mutation.node.id === id
      : mutation.type === "node.update" && mutation.nodeId === id && mutation.patch.data !== undefined
  )));
  const canvas = node.data;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const mediaSource = resolveCanvasMediaSource(id, canvas);
  const mediaUrl = mediaSource?.url ?? null;
  const deferMediaLoad = shouldDeferCanvasMediaLoad(mediaSource, awaitingNodeCreation);
  const hasVideo = Boolean(mediaUrl);
  const isGenerating = canvas?.taskInfo?.status === "queued" || canvas?.taskInfo?.status === "processing";

  const uploadVideo = useCallback(async (file: File) => {
    if (hasIncomingConnection) {
      void message.warning(t.pipeline.canvasUploadBlockedByConnection);
      return;
    }
    if (!file.type.startsWith("video/")) {
      void message.error(t.pipeline.nodeVideoOnlyError);
      return;
    }
    setUploading(true);
    setNodeUploading(id, true);
    try {
      const result = await pipelineStudioApi.uploadFile(
        node.projectId,
        file,
        node.positionX,
        node.positionY,
        id,
      );
      insertServerNode(result.node);
      setComposerOpen(false);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      setNodeUploading(id, false);
    }
  }, [hasIncomingConnection, id, insertServerNode, message, node.positionX, node.positionY, node.projectId, setNodeUploading, t.pipeline.canvasUploadBlockedByConnection, t.pipeline.nodeVideoOnlyError]);

  if (!canvas || canvas.type !== "video") return null;

  const downloadVideo = () => {
    if (!mediaUrl) return;
    const anchor = document.createElement("a");
    anchor.href = mediaUrl;
    anchor.download = canvas.workspaceFile?.name ?? `${canvas.name}.mp4`;
    anchor.click();
  };

  return (
    <article
      className={`group relative h-full min-h-[180px] w-full min-w-[260px] overflow-visible ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      data-selected={selected}
      data-dragging={dragging}
      aria-label={canvas.name}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = hasIncomingConnection ? "none" : "copy";
        setDragActive(!hasIncomingConnection);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
        if (hasIncomingConnection) {
          void message.warning(t.pipeline.canvasUploadBlockedByConnection);
          return;
        }
        const video = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("video/"));
        if (video) void uploadVideo(video);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        disabled={hasIncomingConnection}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void uploadVideo(file);
        }}
      />

      <CanvasNodeResizeControl nodeId={id} minWidth={260} minHeight={180} maxWidth={1280} maxHeight={960} />
      <CanvasNodeConnectionHandle type="target" position={Position.Left} label={t.pipeline.nodeVideoInputHandle} />
      <CanvasNodeConnectionHandle type="source" position={Position.Right} label={t.pipeline.nodeVideoOutputHandle} />

      {singleSelected && hasVideo && !dragging && !deferMediaLoad ? (
        <CanvasNodeContextToolbar offset={54}>
          <CanvasNodeToolbarButton
            label={t.pipeline.videoAiGenerate}
            icon={<Sparkles className="size-4" />}
            onClick={() => {
              activateNodeComposer(id);
              setComposerOpen(true);
            }}
          />
          <CanvasNodeToolbarButton
            label={t.pipeline.nodeVideoReplace}
            icon={<RefreshCw className="size-4" />}
            onClick={() => inputRef.current?.click()}
            disabled={hasIncomingConnection}
            disabledReason={t.pipeline.canvasUploadBlockedByConnection}
          />
          <CanvasNodeToolbarButton label={t.pipeline.nodeVideoDownload} icon={<Download className="size-4" />} onClick={downloadVideo} />
          <CanvasNodeToolbarButton label={t.pipeline.nodeCreateCopy} icon={<Copy className="size-4" />} onClick={() => duplicateNodes([id])} />
          <CanvasNodeToolbarButton danger label={t.pipeline.nodeDelete} icon={<Trash2 className="size-4" />} onClick={() => deleteNodes([id])} />
        </CanvasNodeContextToolbar>
      ) : null}

      <div className="absolute bottom-[calc(100%+4px)] left-0 w-full">
        <CanvasNodeTitle
          icon={<FileVideo className="size-4" />}
          name={canvas.name}
          ariaLabel={t.pipeline.nodeNameAria.replace("{type}", t.pipeline.nodeVideo)}
          onRename={(name) => updateNodeData(id, { ...canvas, name })}
          actions={!hasVideo ? (
            <Tooltip title={hasIncomingConnection ? t.pipeline.canvasUploadBlockedByConnection : undefined}>
              <span className="inline-flex">
                <button
                  type="button"
                  disabled={hasIncomingConnection}
                  onClick={() => inputRef.current?.click()}
                  className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <FileVideo className="size-3.5" />
                  {t.pipeline.canvasUploadMedia}
                </button>
              </span>
            </Tooltip>
          ) : null}
        />
      </div>

      <section className={`nowheel relative h-full overflow-hidden rounded-[20px] border bg-black shadow-[var(--pl-shadow-card)] ${selected || dragging ? "border-[var(--pl-border-strong)] shadow-[var(--pl-shadow-hover)]" : "border-transparent group-hover:border-[var(--pl-border)]"} ${dragActive ? "!border-[var(--pl-accent)]" : ""}`}>
        {uploading ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[var(--pl-surface-elevated)]/90 text-sm text-[var(--pl-text-secondary)]">
            <Spin />
            <span>{t.pipeline.nodeVideoUploading}</span>
          </div>
        ) : null}
        {dragActive && !uploading ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border border-dashed border-[var(--pl-accent)] bg-[var(--pl-accent-soft)]/90 px-5 text-center text-sm font-medium text-[var(--pl-accent)]">
            {hasVideo ? t.pipeline.nodeVideoDropReplace : t.pipeline.nodeVideoDropHere}
          </div>
        ) : null}
        {mediaUrl ? (
          deferMediaLoad ? (
            <div className="flex h-full items-center justify-center bg-[var(--pl-surface-subtle)]"><Spin size="small" /></div>
          ) : (
            <>
              <video
                src={mediaUrl}
                aria-hidden="true"
                draggable={false}
                muted
                playsInline
                preload="metadata"
                className="pointer-events-none h-full min-h-[180px] w-full object-contain"
              />
              <button
                type="button"
                aria-label={t.pipeline.nodeVideoPreview}
                className="nodrag absolute left-1/2 top-1/2 z-10 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/65 text-white shadow-[var(--pl-shadow-floating)] transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 active:bg-black/90"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setPreviewOpen(true);
                }}
              >
                <PlayCircle className="size-6" />
              </button>
            </>
          )
        ) : (
          <div className="flex h-full min-h-[180px] items-center justify-center bg-[var(--pl-surface-subtle)] text-[var(--pl-text-muted)]">
            {isGenerating ? (
              <span className="flex flex-col items-center gap-3 text-sm text-[var(--pl-text-secondary)]">
                <Spin size="small" />
                {t.pipeline.videoAiGenerating}
              </span>
            ) : <FileVideo className="size-10 opacity-45" />}
          </div>
        )}
      </section>

      {composerActive && !dragging && (!hasVideo || composerOpen) ? (
        <VideoAiComposer
          key={id}
          nodeId={id}
          data={canvas}
          waitingForSave={waitingForSave}
          onNodeUpdate={(serverNode) => {
            if (serverNode.data) applyServerNodeData(id, serverNode.data, serverNode.updatedAt);
            setComposerOpen(false);
          }}
        />
      ) : null}

      <Modal
        open={previewOpen}
        title={canvas.name}
        footer={null}
        width="min(1180px, calc(100vw - 80px))"
        onCancel={() => setPreviewOpen(false)}
        mask={{ closable: false }}
        keyboard={false}
        destroyOnHidden
      >
        {mediaUrl ? (
          <div className="grid h-[min(72vh,820px)] w-full place-items-center bg-black">
            <video
              src={mediaUrl}
              aria-label={canvas.name}
              controls
              playsInline
              preload="metadata"
              className="max-h-full max-w-full"
            />
          </div>
        ) : null}
      </Modal>
    </article>
  );
}
