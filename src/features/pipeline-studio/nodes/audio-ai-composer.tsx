"use client";

import { useEffect, useMemo, useState } from "react";
import type { GenerationRouteDto } from "@/contracts/generation";
import type { CanvasEdge, CanvasNode, CanvasNodeData } from "@/contracts/pipeline";
import { FileMusic, FileVideo } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { audioGenerationRoutes, selectAudioGenerationRoute } from "../model/audio-generation-options";
import { connectedCanvasReferences } from "../model/canvas-connection-policy";
import { useCanvasStore } from "../state/canvas-store";
import { CanvasComposerSubmitAction } from "./shared/canvas-composer-submit-action";
import { CanvasModelPicker } from "./shared/canvas-model-picker";

export function AudioAiComposer({
  nodeId,
  data,
  waitingForSave,
  workflowLocked,
  onNodeUpdate,
}: {
  nodeId: string;
  data: CanvasNodeData;
  waitingForSave: boolean;
  workflowLocked: boolean;
  onNodeUpdate: (node: CanvasNode, edges?: CanvasEdge[]) => void;
}) {
  const { t } = useI18n();
  const [routes, setRoutes] = useState<GenerationRouteDto[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState(data.params?.routeId ?? "");
  const [loaded, setLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const references = useMemo(
    () => connectedCanvasReferences(nodeId, nodes, edges),
    [edges, nodeId, nodes],
  );
  const hasVideoReference = references.some((reference) => reference.mediaType === "video")
    || Boolean(data.params?.videoList?.length);
  const status = data.taskInfo?.status;
  const generating = status === "queued" || status === "processing" || submitting;
  const cancellable = !workflowLocked && Boolean(data.taskInfo?.runId) && (status === "queued" || status === "processing");

  useEffect(() => {
    const controller = new AbortController();
    pipelineStudioApi.getGenerationOptions(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const available = audioGenerationRoutes(response.routes);
        const selected = selectAudioGenerationRoute(available, data.params?.routeId);
        setRoutes(available);
        setSelectedRouteId(selected?.id ?? "");
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [data.params?.routeId]);

  const disabledReason = waitingForSave
    ? t.pipeline.audioAiPendingSave
    : !loaded
      ? t.pipeline.audioAiRoutesLoading
      : !routes.length || !selectedRouteId
        ? t.pipeline.audioAiNoRoutes
        : !hasVideoReference
          ? t.pipeline.audioAiVideoRequired
          : "";

  const submit = async () => {
    if (disabledReason || generating || cancelling) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await pipelineStudioApi.generateCanvasNode(nodeId, {
        prompt: "",
        routeId: selectedRouteId,
      });
      onNodeUpdate(response.node, response.edges);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!cancellable || cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const response = await pipelineStudioApi.cancelCanvasNodeGeneration(nodeId);
      onNodeUpdate(response.node);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <section aria-label={t.pipeline.audioAiTitle} className="overflow-hidden rounded-xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-hover)]">
      <div className="flex h-28 items-center gap-3 px-4 text-[var(--pl-text-secondary)]">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--pl-surface)] text-[var(--pl-accent)]"><FileVideo className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--pl-text)]">{t.pipeline.audioAiTitle}</p>
          <p className="mt-1 text-xs leading-5">{t.pipeline.audioAiDescription}</p>
        </div>
      </div>
      {error ? <div role="alert" className="border-t border-[color-mix(in_srgb,var(--pl-error)_24%,transparent)] bg-[color-mix(in_srgb,var(--pl-error)_10%,transparent)] px-4 py-2 text-xs text-[var(--pl-danger)]">{error}</div> : null}
      <footer className="flex h-14 items-center gap-3 border-t border-[var(--pl-border)] px-3">
        <CanvasModelPicker
          ariaLabel={t.pipeline.audioAiRoute}
          disabled={!loaded || generating || !routes.length}
          emptyLabel={!loaded ? t.pipeline.audioAiRoutesLoading : t.pipeline.audioAiNoRoutes}
          itemDetailsLabel={t.pipeline.generationModelDetails}
          items={routes.map((route) => ({
            id: route.id,
            name: route.name,
            meta: route.providerId,
            description: route.description,
            tags: route.tags,
            icon: <FileMusic className="size-3.5" />,
          }))}
          onChange={setSelectedRouteId}
          value={selectedRouteId}
        />
        <span className="flex-1" />
        <CanvasComposerSubmitAction
          cancellable={cancellable}
          cancelling={cancelling}
          cancelLabel={t.pipeline.audioAiCancel}
          disabledReason={disabledReason}
          generateLabel={t.pipeline.audioAiGenerate}
          generating={generating}
          generatingLabel={t.pipeline.audioAiGenerating}
          onCancel={() => void cancel()}
          onSubmit={() => void submit()}
        />
      </footer>
    </section>
  );
}
