"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ComposerGenerationMode,
  GenerationAssetSlot,
  GenerationExecutionPolicy,
  GenerationRunViewDto,
  JsonValue,
} from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";
import {
  cancelChatGenerationRun,
  confirmChatGenerationRun,
  loadChatGenerationRun,
  loadGenerationComposerOptions,
} from "./generation-api";
import { composerGenerationSlots } from "./chat-generation-logic";
import type { ChatGenerationAsset } from "./chat-generation-types";

const ACTIVE_STATUSES = new Set([
  "awaiting_confirmation",
  "queued",
  "running",
  "cancel_requested",
]);

export function useChatGenerationState({
  modelsRevision,
  onChanged,
  sessionId,
  setActionError,
}: {
  modelsRevision: number;
  onChanged?: () => void;
  sessionId?: string;
  setActionError: (value: string) => void;
}) {
  const { t } = useI18n();
  const [reviewFirst, setReviewFirst] = useState(false);
  const [mode, setMode] = useState<ComposerGenerationMode>({ type: "chat" });
  const [routes, setRoutes] = useState<Awaited<ReturnType<typeof loadGenerationComposerOptions>>["routes"]>([]);
  const [assets, setAssets] = useState<ChatGenerationAsset[]>([]);
  const [runs, setRuns] = useState<GenerationRunViewDto[]>([]);
  const [busy, setBusy] = useState(false);
  const assetsRef = useRef<ChatGenerationAsset[]>([]);
  const executionPolicy: GenerationExecutionPolicy = reviewFirst
    ? "review-first"
    : "direct";
  const visibleRuns = useMemo(
    () => sessionId ? runs.filter(({ run }) => run.sessionId === sessionId) : runs,
    [runs, sessionId],
  );
  const slots = useMemo(
    () => composerGenerationSlots(mode, routes, {
      image: t.chat.input.generationImage,
      video: t.chat.input.generationVideo,
      audio: t.chat.input.generationAudio,
    }),
    [mode, routes, t],
  );
  const active = visibleRuns.some(({ run }) => ACTIVE_STATUSES.has(run.status));

  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  useEffect(() => () => {
    assetsRef.current.forEach((asset) => {
      if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
    });
  }, []);

  useEffect(() => {
    let owned = true;
    void loadGenerationComposerOptions()
      .then((result) => {
        if (owned) setRoutes(result.routes);
      })
      .catch((cause) => {
        if (owned) {
          setActionError(
            cause instanceof Error
              ? cause.message
              : t.chat.input.generationOptionsFailed,
          );
        }
      });
    return () => {
      owned = false;
    };
  }, [modelsRevision, setActionError, t]);

  useEffect(() => {
    const activeRuns = visibleRuns.filter(({ run }) => ACTIVE_STATUSES.has(run.status));
    if (!activeRuns.length) return;
    let owned = true;
    const timer = window.setInterval(() => {
      void Promise.all(activeRuns.map(({ run }) => loadChatGenerationRun(run.id)))
        .then((views) => {
          if (!owned) return;
          setRuns((current) => current.map((item) =>
            views.find((view) => view.run.id === item.run.id) ?? item,
          ));
          if (views.some((view) => !ACTIVE_STATUSES.has(view.run.status))) {
            onChanged?.();
          }
        })
        .catch((cause) => {
          if (owned) {
            setActionError(
              cause instanceof Error
                ? cause.message
                : t.chat.input.generationSubmitFailed,
            );
          }
        });
    }, 2_000);
    return () => {
      owned = false;
      window.clearInterval(timer);
    };
  }, [active, onChanged, setActionError, t, visibleRuns]);

  function changeMode(next: ComposerGenerationMode) {
    setMode(next);
    // 任何模式切换都清空已上传素材，确保用户每次都在干净状态下重新上传
    setAssets((current) => {
      current.forEach((asset) => {
        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
      });
      return [];
    });
    setActionError("");
  }

  function addAssets(slot: GenerationAssetSlot, files: File[]) {
    setAssets((current) => [
      ...current,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        slot: slot.key,
        file,
        previewUrl: file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined,
      })),
    ]);
  }

  function removeAsset(id: string) {
    setAssets((current) => {
      const removed = current.find((asset) => asset.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((asset) => asset.id !== id);
    });
  }

  async function confirm(runId: string, prompt: string, parameters: Record<string, JsonValue>) {
    if (busy) return;
    setBusy(true);
    try {
      const view = await confirmChatGenerationRun(runId, { prompt, parameters });
      setRuns((current) => current.map((item) => item.run.id === runId ? view : item));
      onChanged?.();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t.chat.input.generationSubmitFailed);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(runId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const view = await cancelChatGenerationRun(runId);
      setRuns((current) => current.map((item) => item.run.id === runId ? view : item));
      onChanged?.();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t.chat.input.generationSubmitFailed);
    } finally {
      setBusy(false);
    }
  }

  return {
    active,
    addAssets,
    assets,
    busy,
    cancel,
    changeMode,
    confirm,
    executionPolicy,
    mode,
    removeAsset,
    reviewFirst,
    routes,
    runs: visibleRuns,
    setAssets,
    setBusy,
    setReviewFirst,
    setRuns,
    slots,
  };
}
