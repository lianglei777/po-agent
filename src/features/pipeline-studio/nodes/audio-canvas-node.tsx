"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Spin, Tooltip } from "antd";
import { Position } from "@xyflow/react";
import type { CanvasAudioMetadata, CanvasNode } from "@/contracts/pipeline";
import { AlertTriangle, Copy, Download, FileMusic, Sparkles, Trash2 } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import {
  audioFileProblem,
  audioFormatLabel,
  audioMetadataEqual,
  buildAudioWaveformPeaks,
  formatAudioDuration,
  isAudioFile,
} from "../model/audio-waveform";
import { resolveCanvasMediaSource, shouldDeferCanvasMediaLoad } from "../model/canvas-media-source";
import { audioNodePresentation } from "../model/node-interaction";
import { useCanvasStore, useCanvasStoreApi } from "../state/canvas-store";
import { AudioAiComposer } from "./audio-ai-composer";
import { CanvasNodeConnectionHandle } from "./shared/canvas-node-connection-handle";
import { CanvasNodeContextToolbar, CanvasNodeToolbarButton } from "./shared/canvas-node-context-toolbar";
import { CanvasNodeResizeControl } from "./shared/canvas-node-resize-control";
import { CanvasNodeTitle } from "./shared/canvas-node-title";

const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.opus";
const WAVEFORM_BAR_COUNT = 64;

type WaveformDisplayState =
  | { status: "idle" | "loading" | "unavailable"; peaks: number[] }
  | { status: "ready"; peaks: number[] };

type WaveformResultState = WaveformDisplayState & { assetKey: string };

export function AudioCanvasNode({
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
  const store = useCanvasStoreApi();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const applyServerNodeData = useCanvasStore((state) => state.applyServerNodeData);
  const insertServerNode = useCanvasStore((state) => state.insertServerNode);
  const insertServerGenerationResult = useCanvasStore((state) => state.insertServerGenerationResult);
  const deleteNodes = useCanvasStore((state) => state.deleteNodes);
  const duplicateNodes = useCanvasStore((state) => state.duplicateNodes);
  const setNodeUploading = useCanvasStore((state) => state.setNodeUploading);
  const singleSelected = useCanvasStore((state) => state.selectedNodeIds.length === 1 && state.selectedNodeIds[0] === id);
  const composerActive = useCanvasStore((state) => state.activeComposerNodeId === id);
  const activateNodeComposer = useCanvasStore((state) => state.activateNodeComposer);
  const workflowLocked = useCanvasStore((state) => state.workflowLockedNodeIds.includes(id));
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
  const [failedMediaKey, setFailedMediaKey] = useState<string | null>(null);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [waveformResult, setWaveformResult] = useState<WaveformResultState | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const mediaSource = resolveCanvasMediaSource(id, canvas);
  const mediaUrl = mediaSource?.url ?? null;
  const deferMediaLoad = shouldDeferCanvasMediaLoad(mediaSource, awaitingNodeCreation);
  const hasAudio = Boolean(mediaUrl);
  const hasGenerationHistory = Boolean(canvas?.workspaceFile || canvas?.artifactIds?.length || canvas?.taskInfo?.runId);
  const canUploadIntoNode = !hasAudio && !hasGenerationHistory && !hasIncomingConnection;
  const mediaFailed = Boolean(mediaSource?.assetKey && failedMediaKey === mediaSource.assetKey);
  const waveformAssetKey = mediaSource ? `${mediaSource.assetKey}:${mediaRevision}` : null;
  const presentation = audioNodePresentation({
    selected: singleSelected,
    dragging,
    mediaDeferred: deferMediaLoad,
    hasAudio,
  });
  const waveform: WaveformDisplayState = waveformResult?.assetKey === waveformAssetKey
    ? waveformResult
    : !waveformAssetKey || mediaFailed || !presentation.analyzeWaveform
      ? { status: "idle", peaks: [] }
      : { status: "loading", peaks: [] };

  const persistMetadata = useCallback((patch: Partial<CanvasAudioMetadata>) => {
    const current = store.getState().nodes.find((candidate) => candidate.id === id)?.data;
    if (!current || current.type !== "audio") return;
    const durationSeconds = patch.durationSeconds ?? current.audioMetadata?.durationSeconds;
    if (durationSeconds === undefined) return;
    const next: CanvasAudioMetadata = {
      ...current.audioMetadata,
      ...patch,
      durationSeconds,
      format: patch.format ?? current.audioMetadata?.format ?? audioFormatLabel(current.workspaceFile) ?? undefined,
    };
    if (!audioMetadataEqual(current.audioMetadata, next)) {
      store.getState().updateNodeData(id, { ...current, audioMetadata: next });
    }
  }, [id, store]);

  useEffect(() => {
    if (!presentation.analyzeWaveform || !mediaUrl || !waveformAssetKey || mediaFailed) return;
    const controller = new AbortController();
    let active = true;
    void analyzeAudio(mediaUrl, controller.signal).then((result) => {
      if (!active) return;
      setWaveformResult({ assetKey: waveformAssetKey, status: "ready", peaks: result.peaks });
      persistMetadata(result.metadata);
    }).catch((error: unknown) => {
      if (!active || controller.signal.aborted) return;
      setWaveformResult({ assetKey: waveformAssetKey, status: "unavailable", peaks: [] });
      if (process.env.NODE_ENV === "development") console.debug("Audio waveform analysis unavailable", error);
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [mediaFailed, mediaUrl, persistMetadata, presentation.analyzeWaveform, waveformAssetKey]);

  const uploadAudio = useCallback(async (file: File) => {
    if (!canUploadIntoNode) {
      void message.warning(t.pipeline.canvasUploadBlockedByConnection);
      return;
    }
    const fileProblem = audioFileProblem(file);
    if (fileProblem === "unsupported") {
      void message.error(t.pipeline.nodeAudioOnlyError);
      return;
    }
    if (fileProblem === "too-large") {
      void message.error(t.pipeline.nodeAudioTooLarge);
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
      setFailedMediaKey(null);
      setMediaRevision((revision) => revision + 1);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      setNodeUploading(id, false);
    }
  }, [canUploadIntoNode, id, insertServerNode, message, node.positionX, node.positionY, node.projectId, setNodeUploading, t.pipeline.canvasUploadBlockedByConnection, t.pipeline.nodeAudioOnlyError, t.pipeline.nodeAudioTooLarge]);

  if (!canvas || canvas.type !== "audio") return null;

  const format = canvas.audioMetadata?.format ?? audioFormatLabel(canvas.workspaceFile) ?? t.pipeline.nodeAudio;
  const metadataSummary = canvas.audioMetadata
    ? t.pipeline.audioMetadataSummary
      .replace("{duration}", formatAudioDuration(canvas.audioMetadata.durationSeconds))
      .replace("{format}", format)
    : format;
  const metadataDetails = [
    canvas.audioMetadata?.channelCount
      ? t.pipeline.audioMetadataChannels.replace("{count}", String(canvas.audioMetadata.channelCount))
      : null,
    canvas.audioMetadata?.sampleRateHz
      ? t.pipeline.audioMetadataSampleRate.replace("{rate}", formatSampleRate(canvas.audioMetadata.sampleRateHz))
      : null,
  ].filter((part): part is string => Boolean(part)).join(" · ");

  const downloadAudio = () => {
    if (!mediaUrl) return;
    const anchor = document.createElement("a");
    anchor.href = mediaUrl;
    anchor.download = canvas.workspaceFile?.name ?? `${canvas.name}.${format.toLowerCase()}`;
    anchor.click();
  };

  const retryMedia = () => {
    setFailedMediaKey(null);
    setMediaRevision((revision) => revision + 1);
  };

  return (
    <article
      className={`group relative h-full min-h-[150px] w-full min-w-[300px] overflow-visible ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      data-selected={selected}
      data-dragging={dragging}
      aria-label={canvas.name}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = canUploadIntoNode ? "copy" : "none";
        setDragActive(canUploadIntoNode);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
        if (!canUploadIntoNode) {
          void message.warning(t.pipeline.canvasUploadBlockedByConnection);
          return;
        }
        const audio = Array.from(event.dataTransfer.files).find(isAudioFile);
        if (audio) void uploadAudio(audio);
        else if (event.dataTransfer.files.length) void message.error(t.pipeline.nodeAudioOnlyError);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        disabled={!canUploadIntoNode}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void uploadAudio(file);
        }}
      />

      <CanvasNodeResizeControl nodeId={id} minWidth={300} minHeight={150} maxWidth={960} maxHeight={420} />
      <CanvasNodeConnectionHandle type="target" position={Position.Left} label={t.pipeline.nodeAudioInputHandle} />
      <CanvasNodeConnectionHandle type="source" position={Position.Right} label={t.pipeline.nodeAudioOutputHandle} />

      {presentation.showToolbar ? (
        <CanvasNodeContextToolbar offset={54}>
          <CanvasNodeToolbarButton
            label={t.pipeline.audioAiGenerate}
            icon={<Sparkles className="size-4" />}
            onClick={() => {
              activateNodeComposer(id);
              setComposerOpen(true);
            }}
          />
          <CanvasNodeToolbarButton label={t.pipeline.nodeAudioDownload} icon={<Download className="size-4" />} onClick={downloadAudio} />
          <CanvasNodeToolbarButton label={t.pipeline.nodeCreateCopy} icon={<Copy className="size-4" />} onClick={() => duplicateNodes([id])} />
          <CanvasNodeToolbarButton
            danger
            disabled={workflowLocked}
            disabledReason={t.pipeline.canvasWorkflowNodeLocked}
            label={t.pipeline.nodeDelete}
            icon={<Trash2 className="size-4" />}
            onClick={() => deleteNodes([id])}
          />
        </CanvasNodeContextToolbar>
      ) : null}

      <div className="absolute bottom-[calc(100%+4px)] left-0 w-full">
        <CanvasNodeTitle
          icon={<FileMusic className="size-4" />}
          name={canvas.name}
          ariaLabel={t.pipeline.nodeNameAria.replace("{type}", t.pipeline.nodeAudio)}
          onRename={(name) => updateNodeData(id, { ...canvas, name })}
          actions={(
            <>
              {hasAudio ? (
                <span className="text-caption tabular-nums text-[var(--pl-text-muted)]">{metadataSummary}</span>
              ) : null}
              {presentation.showUploadAction ? (
                <Tooltip title={hasIncomingConnection ? t.pipeline.canvasUploadBlockedByConnection : undefined}>
                  <span className="inline-flex">
                    <button
                      type="button"
                      disabled={!canUploadIntoNode}
                      onClick={() => inputRef.current?.click()}
                      className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <FileMusic className="size-3.5" />
                      {t.pipeline.nodeAudioChoose}
                    </button>
                  </span>
                </Tooltip>
              ) : null}
            </>
          )}
        />
      </div>

      <section className={`nowheel relative h-full overflow-hidden rounded-xl border bg-[var(--pl-surface-subtle)] shadow-[var(--pl-shadow-card)] ${selected || dragging ? "border-[var(--pl-border-strong)] shadow-[var(--pl-shadow-hover)]" : "border-transparent group-hover:border-[var(--pl-border)]"} ${dragActive ? "!border-[var(--pl-accent)]" : ""}`}>
        {uploading ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[var(--pl-surface-elevated)]/90 text-sm text-[var(--pl-text-secondary)]">
            <Spin />
            <span>{t.pipeline.nodeAudioUploading}</span>
          </div>
        ) : null}
        {dragActive && !uploading ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-lg border border-dashed border-[var(--pl-accent)] bg-[var(--pl-accent-soft)] px-5 text-center text-sm font-medium text-[var(--pl-accent-hover)]">
            {t.pipeline.nodeAudioDropHere}
          </div>
        ) : null}

        {mediaUrl ? (
          deferMediaLoad ? (
            <div className="flex h-full items-center justify-center"><Spin size="small" /></div>
          ) : (
            <div className="flex h-full min-h-[150px] flex-col justify-center gap-2 px-3 py-2.5">
              <AudioWaveform state={waveform} label={t.pipeline.nodeAudioWaveform} />
              <div className="flex min-w-0 items-center justify-between gap-3 text-caption text-[var(--pl-text-muted)]">
                <span className="truncate" title={canvas.workspaceFile?.name ?? canvas.name}>{canvas.workspaceFile?.name ?? canvas.name}</span>
                {metadataDetails ? <span className="shrink-0 tabular-nums">{metadataDetails}</span> : null}
              </div>
              <audio
                key={`${mediaSource?.assetKey ?? mediaUrl}:${mediaRevision}`}
                src={mediaUrl}
                aria-label={canvas.name}
                controls
                preload="metadata"
                className="nodrag h-10 w-full"
                onPointerDown={(event) => event.stopPropagation()}
                onLoadedMetadata={(event) => {
                  setFailedMediaKey(null);
                  const durationSeconds = Math.max(0, Math.round(event.currentTarget.duration * 10) / 10);
                  if (Number.isFinite(durationSeconds)) persistMetadata({ durationSeconds });
                }}
                onError={() => setFailedMediaKey(mediaSource?.assetKey ?? "unknown")}
              />
              {waveform.status === "loading" ? (
                <span className="sr-only" role="status">{t.pipeline.nodeAudioWaveformLoading}</span>
              ) : null}
              {waveform.status === "unavailable" ? (
                <span className="sr-only">{t.pipeline.nodeAudioWaveformUnavailable}</span>
              ) : null}
              {mediaFailed ? (
                <div className="nodrag absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[var(--pl-surface-elevated)]/95 px-5 text-center">
                  <AlertTriangle className="size-6 text-[var(--pl-warn)]" />
                  <span className="text-sm text-[var(--pl-text-secondary)]">{t.pipeline.nodeAudioUnavailable}</span>
                  <div className="flex gap-2">
                    <Button size="small" onClick={retryMedia}>{t.pipeline.nodeAudioRetry}</Button>
                  </div>
                </div>
              ) : null}
            </div>
          )
        ) : (
          <div className="flex h-full min-h-[150px] flex-col items-center justify-center gap-3 px-5 text-center text-[var(--pl-text-muted)]">
            <FileMusic className="size-8 opacity-50" />
            <div className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-[var(--pl-text-secondary)]">{t.pipeline.nodeAudioPlaceholder}</span>
              <span>{t.pipeline.nodeAudioDropHint}</span>
            </div>
            <Tooltip title={hasIncomingConnection ? t.pipeline.canvasUploadBlockedByConnection : undefined}>
              <span className="nodrag inline-flex">
                <Button size="small" disabled={hasIncomingConnection} onClick={() => inputRef.current?.click()}>{t.pipeline.nodeAudioChoose}</Button>
              </span>
            </Tooltip>
          </div>
        )}
      </section>

      {composerActive && !dragging && (!hasAudio || composerOpen) ? (
        <AudioAiComposer
          data={canvas}
          nodeId={id}
          waitingForSave={waitingForSave}
          workflowLocked={workflowLocked}
          onNodeUpdate={(serverNode, edges) => {
            if (serverNode.id !== id) insertServerGenerationResult(serverNode, edges);
            else if (serverNode.data) applyServerNodeData(id, serverNode.data, serverNode.updatedAt);
            setComposerOpen(false);
          }}
        />
      ) : null}
    </article>
  );
}

function AudioWaveform({ state, label }: { state: WaveformDisplayState; label: string }) {
  const peaks = state.status === "ready"
    ? state.peaks
    : Array.from({ length: WAVEFORM_BAR_COUNT }, (_, index) => 0.18 + ((index * 17) % 9) / 30);
  return (
    <svg
      viewBox={`0 0 ${WAVEFORM_BAR_COUNT * 2} 36`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
      className={`h-9 w-full text-[var(--pl-accent)] ${state.status === "loading" ? "opacity-45" : state.status === "unavailable" ? "opacity-20" : "opacity-80"}`}
    >
      {peaks.map((peak, index) => {
        const height = Math.max(2, Math.round(peak * 32));
        return <rect key={index} x={index * 2} y={(36 - height) / 2} width="1" height={height} rx="0.5" fill="currentColor" />;
      })}
    </svg>
  );
}

async function analyzeAudio(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Audio request failed with ${response.status}`);
  const data = await response.arrayBuffer();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(data);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
    return {
      peaks: buildAudioWaveformPeaks(channels, WAVEFORM_BAR_COUNT),
      metadata: {
        durationSeconds: Math.max(0, Math.round(buffer.duration * 10) / 10),
        sampleRateHz: buffer.sampleRate,
        channelCount: buffer.numberOfChannels,
      } satisfies CanvasAudioMetadata,
    };
  } finally {
    void context.close();
  }
}

function formatSampleRate(sampleRateHz: number) {
  return Number.isInteger(sampleRateHz / 1_000)
    ? String(sampleRateHz / 1_000)
    : (sampleRateHz / 1_000).toFixed(1);
}
