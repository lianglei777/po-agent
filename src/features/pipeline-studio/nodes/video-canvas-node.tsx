"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { App, Spin, Tooltip } from "antd";
import { Position } from "@xyflow/react";
import type { CanvasNode } from "@/contracts/pipeline";
import { AlertTriangle, Clock3, Copy, Download, FileVideo, RefreshCw, Sparkles, Trash2 } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { resolveCanvasMediaSource, shouldDeferCanvasMediaLoad } from "../model/canvas-media-source";
import { videoNodeToolbarPresentation } from "../model/node-interaction";
import { composerDraftKey, useCanvasStore } from "../state/canvas-store";
import { VideoAiComposer } from "./video-ai-composer";
import { VideoGenerationHistory } from "./video-generation-history";
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
  const canvasEdges = useCanvasStore((state) => state.edges);
  const incomingEdges = useMemo(
    () => canvasEdges.filter((edge) => edge.targetNodeId === id),
    [canvasEdges, id],
  );
  const hasIncomingConnection = incomingEdges.length > 0;
  const videoDraft = useCanvasStore((state) => state.composerDrafts[composerDraftKey(id, "video")]);
  const awaitingNodeCreation = useCanvasStore((state) => state.pendingMutations.some((mutation) => (
    mutation.type === "node.create" && mutation.node.id === id
  )));
  const waitingForSave = useCanvasStore((state) => state.pendingMutations.some((mutation) => (
    mutation.type === "node.create" ? mutation.node.id === id
      : mutation.type === "node.update" && mutation.nodeId === id && mutation.patch.data !== undefined
  )));
  const workflowLocked = useCanvasStore((state) => state.workflowLockedNodeIds.includes(id));
  const canvas = node.data;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [composerInputDirty, setComposerInputDirty] = useState(false);
  const [failedMediaKey, setFailedMediaKey] = useState<string | null>(null);
  const mediaSource = resolveCanvasMediaSource(id, canvas);
  const mediaUrl = mediaSource?.url ?? null;
  const deferMediaLoad = shouldDeferCanvasMediaLoad(mediaSource, awaitingNodeCreation);
  const hasVideo = Boolean(mediaUrl);
  const hasGenerationHistory = Boolean(canvas?.workspaceFile || canvas?.artifactIds?.length || canvas?.taskInfo?.runId);
  const isGenerating = canvas?.taskInfo?.status === "queued" || canvas?.taskInfo?.status === "processing";
  const hasLocalInputChanges = Boolean(
    (videoDraft && JSON.stringify(videoDraft) !== JSON.stringify(canvas?.params?.promptDocument))
    || composerInputDirty,
  );
  const outputStale = Boolean(canvas?.generationProvenance?.stale || hasLocalInputChanges);
  const mediaFailed = Boolean(mediaSource?.assetKey && failedMediaKey === mediaSource.assetKey);
  const toolbarPresentation = videoNodeToolbarPresentation({
    selected: singleSelected,
    composerActive,
    dragging,
    mediaDeferred: deferMediaLoad,
    hasVideo,
    hasHistory: hasGenerationHistory,
  });

  const playVideoOnHover = useCallback(() => {
    if (mediaFailed) return;
    const playAttempt = videoRef.current?.play();
    if (playAttempt) void playAttempt.catch(() => undefined);
  }, [mediaFailed]);

  const pauseVideoOnLeave = useCallback(() => {
    videoRef.current?.pause();
  }, []);

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

      {toolbarPresentation.showToolbar ? (
        <CanvasNodeContextToolbar offset={54}>
          {toolbarPresentation.showGenerateAction ? (
            <CanvasNodeToolbarButton
              label={t.pipeline.videoAiGenerate}
              icon={<Sparkles className="size-4" />}
              onClick={() => {
                activateNodeComposer(id);
              }}
            />
          ) : null}
          {hasGenerationHistory ? (
            <CanvasNodeToolbarButton
              label={t.pipeline.videoHistoryOpen}
              icon={<Clock3 className="size-4" />}
              onClick={() => setHistoryOpen(true)}
            />
          ) : null}
          {hasVideo ? (
            <>
          <CanvasNodeToolbarButton
            label={t.pipeline.nodeVideoReplace}
            icon={<RefreshCw className="size-4" />}
            onClick={() => inputRef.current?.click()}
            disabled={hasIncomingConnection}
            disabledReason={t.pipeline.canvasUploadBlockedByConnection}
          />
          <CanvasNodeToolbarButton label={t.pipeline.nodeVideoDownload} icon={<Download className="size-4" />} onClick={downloadVideo} />
          <CanvasNodeToolbarButton label={t.pipeline.nodeCreateCopy} icon={<Copy className="size-4" />} onClick={() => duplicateNodes([id])} />
          <CanvasNodeToolbarButton danger disabled={workflowLocked} disabledReason={t.pipeline.canvasWorkflowNodeLocked} label={t.pipeline.nodeDelete} icon={<Trash2 className="size-4" />} onClick={() => deleteNodes([id])} />
            </>
          ) : null}
        </CanvasNodeContextToolbar>
      ) : null}

      <div className="absolute bottom-[calc(100%+4px)] left-0 w-full">
        <CanvasNodeTitle
          icon={<FileVideo className="size-4" />}
          name={canvas.name}
          ariaLabel={t.pipeline.nodeNameAria.replace("{type}", t.pipeline.nodeVideo)}
          onRename={(name) => updateNodeData(id, { ...canvas, name })}
          actions={(
            <>
              {canvas.videoMetadata && hasVideo ? (
                <span className="text-caption tabular-nums text-[var(--pl-text-muted)]">
                  {t.pipeline.videoMetadata
                    .replace("{duration}", formatDuration(canvas.videoMetadata.durationSeconds))
                    .replace("{resolution}", `${canvas.videoMetadata.width} × ${canvas.videoMetadata.height}`)}
                </span>
              ) : null}
              {!hasVideo ? (
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
            </>
          )}
        />
      </div>

      <section
        className={`nowheel relative h-full overflow-hidden rounded-xl border bg-black shadow-[var(--pl-shadow-card)] ${selected || dragging ? "border-[var(--pl-border-strong)] shadow-[var(--pl-shadow-hover)]" : "border-transparent group-hover:border-[var(--pl-border)]"} ${dragActive ? "!border-[var(--pl-accent)]" : ""}`}
        onPointerEnter={playVideoOnHover}
        onPointerLeave={pauseVideoOnLeave}
      >
        {uploading ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[var(--pl-surface-elevated)]/90 text-sm text-[var(--pl-text-secondary)]">
            <Spin />
            <span>{t.pipeline.nodeVideoUploading}</span>
          </div>
        ) : null}
        {dragActive && !uploading ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg border border-dashed border-[var(--pl-accent)] bg-[var(--pl-accent-soft)] px-5 text-center text-sm font-medium text-[var(--pl-accent-hover)]">
            {hasVideo ? t.pipeline.nodeVideoDropReplace : t.pipeline.nodeVideoDropHere}
          </div>
        ) : null}
        {mediaUrl ? (
          deferMediaLoad ? (
            <div className="flex h-full items-center justify-center bg-[var(--pl-surface-subtle)]"><Spin size="small" /></div>
          ) : (
            <>
              <video
                ref={videoRef}
                src={mediaUrl}
                aria-label={canvas.name}
                controls
                draggable={false}
                muted
                playsInline
                preload="metadata"
                className="h-full min-h-[180px] w-full object-contain"
                onPointerDown={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  // 原生控制条需要优先接收指针；视频其余区域仍交给画布处理节点拖拽。
                  if (event.clientY >= bounds.bottom - 48) event.stopPropagation();
                }}
                onLoadedMetadata={(event) => {
                  setFailedMediaKey(null);
                  const element = event.currentTarget;
                  const metadata = {
                    durationSeconds: Math.max(0, Math.round(element.duration * 10) / 10),
                    width: element.videoWidth,
                    height: element.videoHeight,
                  };
                  if (metadata.width > 0 && metadata.height > 0 && (
                    canvas.videoMetadata?.durationSeconds !== metadata.durationSeconds
                    || canvas.videoMetadata.width !== metadata.width
                    || canvas.videoMetadata.height !== metadata.height
                  )) updateNodeData(id, { ...canvas, videoMetadata: metadata });
                }}
                onError={() => setFailedMediaKey(mediaSource?.assetKey ?? "unknown")}
              />
              {mediaFailed ? (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/80 px-5 text-center text-xs text-white/80">
                  <AlertTriangle className="size-5 text-[var(--pl-warn)]" />
                  {t.pipeline.nodeVideoUnavailable}
                </div>
              ) : null}
              {outputStale ? (
                <Tooltip title={t.pipeline.generationOutputStale}>
                  <span className="nodrag absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-[var(--pl-warn)] px-2 py-1 text-caption font-medium text-[var(--workspace-bg)]">
                    <AlertTriangle className="size-3" />
                    {t.pipeline.generationOutputStaleBadge}
                  </span>
                </Tooltip>
              ) : null}
              {canvas.taskInfo?.status === "failed" ? (
                <Tooltip title={canvas.taskInfo.errorMessage ?? t.pipeline.videoHistoryFailed}>
                  <span className="nodrag absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[var(--pl-error)] px-2 py-1 text-caption font-medium text-[var(--workspace-bg)]">
                    <AlertTriangle className="size-3" />
                    {t.pipeline.videoHistoryFailed}
                  </span>
                </Tooltip>
              ) : null}
            </>
          )
        ) : (
          <div className="flex h-full min-h-[180px] items-center justify-center bg-[var(--pl-surface-subtle)] text-[var(--pl-text-muted)]">
            {isGenerating ? (
              <span className="flex flex-col items-center gap-3 text-sm text-[var(--pl-text-secondary)]">
                <Spin size="small" />
                {t.pipeline.videoAiGenerating}
              </span>
            ) : canvas.taskInfo?.status === "failed" ? (
              <Tooltip title={canvas.taskInfo.errorMessage}>
                <span className="flex flex-col items-center gap-2 px-5 text-center text-xs text-[var(--pl-danger)]">
                  <AlertTriangle className="size-6" />
                  {t.pipeline.videoHistoryFailed}
                </span>
              </Tooltip>
            ) : <FileVideo className="size-10 opacity-45" />}
          </div>
        )}
      </section>

      {toolbarPresentation.showComposer ? (
        <VideoAiComposer
          key={id}
          nodeId={id}
          data={canvas}
          waitingForSave={waitingForSave}
          workflowLocked={workflowLocked}
          onNodeUpdate={(serverNode) => {
            if (serverNode.data) applyServerNodeData(id, serverNode.data, serverNode.updatedAt);
            setComposerInputDirty(false);
          }}
          onInputDirtyChange={setComposerInputDirty}
        />
      ) : null}

      <VideoGenerationHistory
        node={node}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onNodeUpdate={(serverNode) => {
          if (serverNode.data) applyServerNodeData(id, serverNode.data, serverNode.updatedAt);
        }}
      />
    </article>
  );
}

function formatDuration(seconds: number) {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}
