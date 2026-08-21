"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Modal, Tooltip } from "antd";
import type { GenerationRouteDto } from "@/contracts/generation";
import type { CanvasEdge, CanvasNode, CanvasNodeData } from "@/contracts/pipeline";
import { ImagePlus, LoaderCircle, Maximize2, Send, Sparkles, Square } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { imageGenerationRoutes, imagePromptProblem, selectImageGenerationRoute } from "../model/image-generation-options";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
const RESOLUTIONS = ["1k", "2k"] as const;

export function ImageAiComposer({
  nodeId,
  data,
  waitingForSave,
  mode = "create",
  onUpload,
  onNodeUpdate,
  onGenerationStarted,
}: {
  nodeId: string;
  data: CanvasNodeData;
  waitingForSave: boolean;
  mode?: "create" | "modify";
  onUpload: () => void;
  onNodeUpdate: (node: CanvasNode) => void;
  onGenerationStarted?: (node: CanvasNode, edge?: CanvasEdge) => void;
}) {
  const { t } = useI18n();
  const [instruction, setInstruction] = useState(mode === "modify" ? "" : data.params?.prompt ?? "");
  const [routes, setRoutes] = useState<GenerationRouteDto[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState(data.params?.routeId ?? "");
  const [aspectRatio, setAspectRatio] = useState(readOption(data.params?.settings?.aspectRatio, ASPECT_RATIOS, "1:1"));
  const [resolution, setResolution] = useState(readOption(data.params?.settings?.resolution, RESOLUTIONS, "2k"));
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId],
  );
  const taskStatus = data.taskInfo?.status;
  const generating = taskStatus === "queued" || taskStatus === "processing" || submitting;
  const capability = mode === "modify" || Boolean(data.params?.imageList?.length)
    ? "image-to-image"
    : "text-to-image";

  useEffect(() => {
    const controller = new AbortController();
    pipelineStudioApi.getGenerationOptions(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const available = imageGenerationRoutes(response.routes, capability);
        const selected = selectImageGenerationRoute(available, data.params?.routeId);
        setRoutes(available);
        setSelectedRouteId(selected?.id ?? "");
        if (selected && !data.params?.settings?.resolution) {
          setResolution(readOption(selected.defaults.resolution, RESOLUTIONS, "2k"));
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLocalError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingRoutes(false);
      });
    return () => controller.abort();
  }, [capability, data.params?.routeId, data.params?.settings?.resolution]);

  const promptProblem = imagePromptProblem(selectedRoute, instruction);
  const disabledReason = useMemo(() => {
    if (waitingForSave) return t.pipeline.imageAiPendingSave;
    if (loadingRoutes) return t.pipeline.imageAiRoutesLoading;
    if (!routes.length || !selectedRoute) {
      return capability === "image-to-image" ? t.pipeline.imageAiNoModifyRoutes : t.pipeline.imageAiNoRoutes;
    }
    if (promptProblem === "required") return t.pipeline.imageAiInstructionRequired;
    if (promptProblem === "too-short") {
      return t.pipeline.imageAiPromptTooShort.replace("{count}", String(selectedRoute.inputSchema.prompt.minLength ?? 1));
    }
    if (promptProblem === "too-long") {
      return t.pipeline.imageAiPromptTooLong.replace("{count}", String(selectedRoute.inputSchema.prompt.maxLength ?? 20_000));
    }
    return "";
  }, [capability, loadingRoutes, promptProblem, routes.length, selectedRoute, t.pipeline, waitingForSave]);

  const submit = async () => {
    if (disabledReason || generating || cancelling || !selectedRoute) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const response = await pipelineStudioApi.generateCanvasNode(nodeId, {
        prompt: instruction.trim(),
        routeId: selectedRoute.id,
        settings: { aspectRatio, resolution },
        createNewNode: mode === "modify",
      });
      if (onGenerationStarted) onGenerationStarted(response.node, response.edge);
      else onNodeUpdate(response.node);
      setExpanded(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t.pipeline.imageAiError);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!data.taskInfo?.runId || cancelling) return;
    setCancelling(true);
    setLocalError(null);
    try {
      const response = await pipelineStudioApi.cancelCanvasNodeGeneration(nodeId);
      onNodeUpdate(response.node);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t.pipeline.imageAiCancelError);
    } finally {
      setCancelling(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  const surface = (large: boolean) => (
    <ComposerSurface
      large={large}
      mode={mode}
      instruction={instruction}
      routes={routes}
      selectedRouteId={selectedRouteId}
      aspectRatio={aspectRatio}
      resolution={resolution}
      loadingRoutes={loadingRoutes}
      generating={generating}
      cancellable={Boolean(data.taskInfo?.runId) && (taskStatus === "queued" || taskStatus === "processing")}
      cancelling={cancelling}
      disabledReason={disabledReason}
      error={localError ?? data.taskInfo?.errorMessage ?? null}
      onInstructionChange={setInstruction}
      onRouteChange={setSelectedRouteId}
      onAspectRatioChange={(value) => setAspectRatio(readOption(value, ASPECT_RATIOS, "1:1"))}
      onResolutionChange={(value) => setResolution(readOption(value, RESOLUTIONS, "2k"))}
      onKeyDown={handleKeyDown}
      onSubmit={() => void submit()}
      onCancel={() => void cancel()}
      onUpload={onUpload}
      onExpand={() => setExpanded(true)}
    />
  );

  return (
    <>
      <div
        className="nodrag nowheel absolute left-1/2 top-[calc(100%+14px)] z-30 w-[min(900px,84vw)] -translate-x-1/2"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {surface(false)}
      </div>
      <Modal
        open={expanded}
        title={mode === "modify" ? t.pipeline.imageAiModifyTitle : t.pipeline.imageAiTitle}
        width={1000}
        footer={null}
        mask={{ closable: false }}
        keyboard={false}
        onCancel={() => setExpanded(false)}
        destroyOnHidden
      >
        {surface(true)}
      </Modal>
    </>
  );
}

function ComposerSurface({
  large, mode, instruction, routes, selectedRouteId, aspectRatio, resolution,
  loadingRoutes, generating, cancellable, cancelling, disabledReason, error,
  onInstructionChange, onRouteChange, onAspectRatioChange, onResolutionChange,
  onKeyDown, onSubmit, onCancel, onUpload, onExpand,
}: {
  large: boolean;
  mode: "create" | "modify";
  instruction: string;
  routes: GenerationRouteDto[];
  selectedRouteId: string;
  aspectRatio: string;
  resolution: string;
  loadingRoutes: boolean;
  generating: boolean;
  cancellable: boolean;
  cancelling: boolean;
  disabledReason: string;
  error: string | null;
  onInstructionChange: (value: string) => void;
  onRouteChange: (value: string) => void;
  onAspectRatioChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onUpload: () => void;
  onExpand: () => void;
}) {
  const { t } = useI18n();
  const busy = generating || cancelling;
  return (
    <CanvasNodeComposerShell
      ariaLabel={mode === "modify" ? t.pipeline.imageAiModifyTitle : t.pipeline.imageAiTitle}
      large={large}
      error={error}
      body={(
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center px-4 pt-4">
            {mode === "create" ? (
              <button
                type="button"
                disabled={busy}
                onClick={onUpload}
                className="flex h-9 items-center gap-2 rounded-lg border border-[var(--pl-border-strong)] bg-[var(--pl-surface)] px-3 text-xs font-medium text-[var(--pl-text-secondary)] hover:border-[var(--pl-accent)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ImagePlus className="size-4" />
                {t.pipeline.nodeImageChoose}
              </button>
            ) : (
              <span className="flex h-9 items-center gap-2 text-xs font-medium text-[var(--pl-text-secondary)]">
                <ImagePlus className="size-4 text-[var(--pl-accent)]" />
                {t.pipeline.imageAiCurrentReference}
              </span>
            )}
            {!large ? (
              <button
                type="button"
                title={t.pipeline.textAiExpand}
                aria-label={t.pipeline.textAiExpand}
                onClick={onExpand}
                className="ml-auto flex size-8 items-center justify-center rounded-lg text-[var(--pl-text-muted)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
              >
                <Maximize2 className="size-4" />
              </button>
            ) : null}
          </div>
          <textarea
            autoFocus={large}
            value={instruction}
            disabled={busy}
            onChange={(event) => onInstructionChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={mode === "modify" ? t.pipeline.imageAiModifyPlaceholder : t.pipeline.imageAiPlaceholder}
            aria-label={t.pipeline.imageAiInstruction}
            className="nodrag nowheel min-h-0 flex-1 resize-none border-0 bg-transparent px-5 py-4 text-sm leading-6 text-[var(--pl-text)] outline-none placeholder:text-[var(--pl-text-muted)] disabled:opacity-60"
          />
        </div>
      )}
      footer={(
        <>
          <Sparkles className="size-4 shrink-0 text-[var(--pl-accent)]" />
          <ComposerSelect
            ariaLabel={t.pipeline.imageAiRoute}
            value={selectedRouteId}
            disabled={loadingRoutes || busy || !routes.length}
            onChange={onRouteChange}
            options={routes.map((route) => ({ value: route.id, label: route.name }))}
            emptyLabel={loadingRoutes ? t.pipeline.imageAiRoutesLoading : t.pipeline.imageAiNoRoutesShort}
            className="max-w-56"
          />
          <ComposerSelect
            ariaLabel={t.pipeline.imageAiAspectRatio}
            value={aspectRatio}
            disabled={busy}
            onChange={onAspectRatioChange}
            options={ASPECT_RATIOS.map((value) => ({ value, label: value }))}
          />
          <ComposerSelect
            ariaLabel={t.pipeline.imageAiResolution}
            value={resolution}
            disabled={busy}
            onChange={onResolutionChange}
            options={RESOLUTIONS.map((value) => ({ value, label: value.toUpperCase() }))}
          />
          <span className="flex-1" />
          {generating ? (
            <span className="hidden items-center gap-2 text-xs text-[var(--pl-text-muted)] sm:flex">
              <LoaderCircle className="size-3.5 animate-spin" />
              {t.pipeline.imageAiGenerating}
            </span>
          ) : null}
          {generating ? (
            <Tooltip
              title={cancellable ? t.pipeline.imageAiCancel : t.pipeline.imageAiGenerating}
              getPopupContainer={tooltipContainer}
            >
              <span>
                <button
                  type="button"
                  disabled={cancelling || !cancellable}
                  aria-label={t.pipeline.imageAiCancel}
                  onClick={onCancel}
                  className="flex size-9 items-center justify-center rounded-full border border-[var(--pl-border-strong)] text-[var(--pl-text)] hover:bg-[var(--pl-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:opacity-50"
                >
                  {cancelling ? <LoaderCircle className="size-4 animate-spin" /> : <Square className="size-3.5" />}
                </button>
              </span>
            </Tooltip>
          ) : (
            <Tooltip
              title={disabledReason || (mode === "modify" ? t.pipeline.imageAiModify : t.pipeline.imageAiGenerate)}
              getPopupContainer={tooltipContainer}
            >
              <span>
                <button
                  type="button"
                  disabled={Boolean(disabledReason)}
                  aria-label={mode === "modify" ? t.pipeline.imageAiModify : t.pipeline.imageAiGenerate}
                  onClick={onSubmit}
                  className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Send className="size-4" />
                </button>
              </span>
            </Tooltip>
          )}
        </>
      )}
    />
  );
}

function ComposerSelect({
  ariaLabel, value, disabled, options, emptyLabel, className = "", onChange,
}: {
  ariaLabel: string;
  value: string;
  disabled: boolean;
  options: Array<{ value: string; label: string }>;
  emptyLabel?: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={ariaLabel}
      title={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`nodrag h-8 min-w-0 rounded-lg border border-transparent bg-transparent px-2 text-xs text-[var(--pl-text-secondary)] outline-none hover:border-[var(--pl-border)] focus:border-[var(--pl-accent)] disabled:opacity-50 ${className}`}
    >
      {!options.length ? <option value="">{emptyLabel}</option> : null}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function readOption<const T extends readonly string[]>(value: unknown, options: T, fallback: T[number]): T[number] {
  return typeof value === "string" && options.includes(value) ? value as T[number] : fallback;
}

function tooltipContainer(trigger: HTMLElement): HTMLElement {
  // React Flow 节点可能在交互中短暂脱离 document，弹层跟随触发器父级可保持同一 RootNode。
  return trigger.parentElement ?? trigger;
}
