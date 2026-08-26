"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Modal, Spin } from "antd";
import type { GenerationRunViewDto } from "@/contracts/generation";
import type { CanvasNode } from "@/contracts/pipeline";
import { Check, FileVideo, RotateCcw } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { canvasNodeGenerationArtifactUrl, canvasNodeUploadSourceUrl, pipelineStudioApi } from "../api/pipeline-studio-api";
import { videoGenerationHistoryAction } from "../model/video-generation-history";

export function VideoGenerationHistory({
  node,
  open,
  onClose,
  onNodeUpdate,
}: {
  node: CanvasNode;
  open: boolean;
  onClose: () => void;
  onNodeUpdate: (node: CanvasNode) => void;
}) {
  const { locale, t } = useI18n();
  const { message } = App.useApp();
  const [runs, setRuns] = useState<GenerationRunViewDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);

  const load = useCallback((signal?: AbortSignal) => {
    return Promise.resolve()
      .then(() => {
        if (!signal?.aborted) setLoading(true);
        return pipelineStudioApi.getCanvasNodeGenerationRuns(node.id, signal);
      })
      .then((items) => {
        if (!signal?.aborted) setRuns(items);
      })
      .catch((error) => {
        if (!signal?.aborted) void message.error(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, [message, node.id]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, node.updatedAt, open]);

  const selectTake = async (runId: string, artifactId: string) => {
    setBusyRunId(runId);
    try {
      const result = await pipelineStudioApi.selectCanvasNodeGenerationArtifact(node.id, runId, artifactId);
      onNodeUpdate(result.node);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyRunId(null);
    }
  };

  const retry = async (runId: string) => {
    setBusyRunId(runId);
    try {
      const result = await pipelineStudioApi.retryCanvasNodeGeneration(node.id, runId, crypto.randomUUID());
      onNodeUpdate(result.node);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyRunId(null);
    }
  };

  const selectUploadSource = async () => {
    setBusyRunId("upload-source");
    try {
      const result = await pipelineStudioApi.selectCanvasNodeUploadSource(node.id);
      onNodeUpdate(result.node);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyRunId(null);
    }
  };

  const uploadSelected = Boolean(node.data?.workspaceFile && !node.data.videoSelection);
  const hasHistory = Boolean(node.data?.workspaceFile || runs.length);

  return (
    <Modal
      open={open}
      title={t.pipeline.videoHistoryTitle}
      footer={null}
      width={820}
      onCancel={onClose}
      destroyOnHidden
      keyboard={false}
      mask={{ closable: false }}
    >
      {loading ? (
        <div className="grid min-h-48 place-items-center"><Spin /></div>
      ) : hasHistory ? (
        <div className="grid max-h-[68vh] grid-cols-2 gap-3 overflow-y-auto pr-1 max-sm:grid-cols-1">
          {node.data?.workspaceFile ? (
            <article className={`overflow-hidden rounded-xl border bg-[var(--pl-surface-subtle)] ${uploadSelected ? "border-[var(--pl-accent)]" : "border-[var(--pl-border)]"}`}>
              <div className="relative aspect-video bg-black">
                <video src={canvasNodeUploadSourceUrl(node.id)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                {uploadSelected ? (
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[var(--pl-accent)] px-2 py-1 text-caption font-medium text-white">
                    <Check className="size-3" />{t.pipeline.videoHistoryCurrent}
                  </span>
                ) : null}
              </div>
              <div className="space-y-2 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[var(--pl-text)]">{t.pipeline.videoHistoryUploadSource}</span>
                  <span className="truncate text-[var(--pl-text-muted)]">{node.data.workspaceFile.name}</span>
                </div>
                <p className="line-clamp-2 min-h-8 text-xs leading-4 text-[var(--pl-text-secondary)]">{t.pipeline.videoHistoryUploadSourceDescription}</p>
                <button
                  type="button"
                  disabled={uploadSelected || busyRunId === "upload-source"}
                  onClick={() => void selectUploadSource()}
                  className="h-8 w-full rounded-lg border border-[var(--pl-border)] text-xs font-medium text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] disabled:cursor-default disabled:opacity-50"
                >
                  {busyRunId === "upload-source" ? t.pipeline.videoHistoryWorking : uploadSelected ? t.pipeline.videoHistoryCurrent : t.pipeline.videoHistoryUseTake}
                </button>
              </div>
            </article>
          ) : null}
          {runs.map((view) => {
            const artifact = view.artifacts.findLast((candidate) => candidate.kind === "video");
            const selected = artifact?.id === node.data?.videoSelection?.artifactId;
            const busy = busyRunId === view.run.id;
            const action = videoGenerationHistoryAction(view.run.status, Boolean(artifact));
            const mediaUrl = artifact?.remoteUrl ?? (artifact
              ? canvasNodeGenerationArtifactUrl(node.id, view.run.id, artifact.id)
              : null);
            return (
              <article
                key={view.run.id}
                className={`overflow-hidden rounded-xl border bg-[var(--pl-surface-subtle)] ${selected ? "border-[var(--pl-accent)]" : "border-[var(--pl-border)]"}`}
              >
                <div className="relative aspect-video bg-black">
                  {mediaUrl ? (
                    <video src={mediaUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-[var(--pl-text-muted)]"><FileVideo className="size-8" /></div>
                  )}
                  {selected ? (
                    <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-[var(--pl-accent)] px-2 py-1 text-caption font-medium text-white">
                      <Check className="size-3" />{t.pipeline.videoHistoryCurrent}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-[var(--pl-text)]">{statusLabel(view.run.status, t.pipeline)}</span>
                    <time className="text-[var(--pl-text-muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(view.run.createdAt))}</time>
                  </div>
                  <p className="line-clamp-2 min-h-8 text-xs leading-4 text-[var(--pl-text-secondary)]">{view.run.prompt || t.pipeline.videoHistoryNoPrompt}</p>
                  {action === "select" && artifact ? (
                    <button
                      type="button"
                      disabled={selected || busy}
                      onClick={() => void selectTake(view.run.id, artifact.id)}
                      className="h-8 w-full rounded-lg border border-[var(--pl-border)] text-xs font-medium text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] disabled:cursor-default disabled:opacity-50"
                    >
                      {busy ? t.pipeline.videoHistoryWorking : selected ? t.pipeline.videoHistoryCurrent : t.pipeline.videoHistoryUseTake}
                    </button>
                  ) : action === "retry" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void retry(view.run.id)}
                      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--pl-border)] text-xs font-medium text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] disabled:opacity-50"
                    >
                      <RotateCcw className="size-3.5" />{busy ? t.pipeline.videoHistoryWorking : t.pipeline.videoHistoryRetry}
                    </button>
                  ) : null}
                  {view.run.errorMessage ? <p className="text-xs text-[var(--pl-danger)]">{view.run.errorMessage}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid min-h-48 place-items-center text-sm text-[var(--pl-text-muted)]">{t.pipeline.videoHistoryEmpty}</div>
      )}
    </Modal>
  );
}

function statusLabel(status: GenerationRunViewDto["run"]["status"], labels: {
  videoHistorySucceeded: string;
  videoHistoryFailed: string;
  videoHistoryCancelled: string;
  videoHistoryRunning: string;
}) {
  if (status === "succeeded") return labels.videoHistorySucceeded;
  if (status === "failed") return labels.videoHistoryFailed;
  if (status === "cancelled") return labels.videoHistoryCancelled;
  return labels.videoHistoryRunning;
}
