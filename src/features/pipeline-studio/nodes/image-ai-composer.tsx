"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Tooltip } from "antd";
import type { GenerationRouteDto, JsonValue } from "@/contracts/generation";
import type { CanvasEdge, CanvasGenerationSettingValue, CanvasNode, CanvasNodeData, CanvasPromptDocument } from "@/contracts/pipeline";
import { ImagePlus, LoaderCircle, Maximize2, Send, Square } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { promptDocumentFromPlainText, promptDocumentResourceAttrs } from "../model/prompt-document";
import { ResourcePromptEditor } from "../prompt-editor/resource-prompt-editor";
import { imageGenerationRoutes, imagePromptProblem, selectImageGenerationRoute } from "../model/image-generation-options";
import { promptReferenceRouteProblem } from "../model/prompt-reference-validation";
import { connectedCanvasReferences } from "../model/canvas-connection-policy";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";
import { InlineCanvasNodeComposer } from "./shared/inline-canvas-node-composer";
import { composerDraftKey, useCanvasStore } from "../state/canvas-store";
import {
  composerParameterFields,
  IMAGE_ASPECT_RATIO_FIELD,
  reconcileComposerSettings,
} from "../model/generation-composer-settings";
import { CanvasGenerationConfig } from "./shared/canvas-generation-config";
import { CanvasModelPicker } from "./shared/canvas-model-picker";
import { generationParameterConflict } from "@/components/generation/generation-input-constraints";

export function ImageAiComposer({
  nodeId,
  data,
  waitingForSave,
  mode = "create",
  onNodeUpdate,
  onGenerationStarted,
}: {
  nodeId: string;
  data: CanvasNodeData;
  waitingForSave: boolean;
  mode?: "create" | "modify";
  onNodeUpdate: (node: CanvasNode) => void;
  onGenerationStarted?: (node: CanvasNode, edge?: CanvasEdge) => void;
}) {
  const { t } = useI18n();
  const draftKey = composerDraftKey(nodeId, mode === "modify" ? "image-modify" : "image-create");
  const storedDraft = useCanvasStore((state) => state.composerDrafts[draftKey]);
  const setComposerDraft = useCanvasStore((state) => state.setComposerDraft);
  // 已生成节点进入修改模式时沿用生成它的提示词；只有用户自己的修改草稿可以覆盖该基线。
  const promptDocument = storedDraft
    ?? data.params?.promptDocument
    ?? promptDocumentFromPlainText(data.params?.prompt ?? "");
  const setPromptDocument = (document: CanvasPromptDocument) => setComposerDraft(
    nodeId,
    mode === "modify" ? "image-modify" : "image-create",
    document,
  );
  const instruction = promptDocument.plainText;
  const [routes, setRoutes] = useState<GenerationRouteDto[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState(data.params?.routeId ?? "");
  const [settings, setSettings] = useState<Record<string, JsonValue>>({
    aspectRatio: data.params?.settings?.aspectRatio ?? "1:1",
    resolution: data.params?.settings?.resolution ?? "2k",
  });
  const [loadedCapability, setLoadedCapability] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [invalidReferenceCount, setInvalidReferenceCount] = useState(0);
  const [unsupportedReferenceCount, setUnsupportedReferenceCount] = useState(0);
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const canvasEdges = useCanvasStore((state) => state.edges);
  const connectedReferences = useMemo(() => mode === "create"
    ? connectedCanvasReferences(nodeId, canvasNodes, canvasEdges)
    : [], [canvasEdges, canvasNodes, mode, nodeId]);
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId],
  );
  const taskStatus = data.taskInfo?.status;
  const generating = taskStatus === "queued" || taskStatus === "processing" || submitting;
  const hasImageReference = [...connectedReferences, ...promptDocumentResourceAttrs(promptDocument)]
    .some((reference) => reference.mediaType === "image");
  const capability = mode === "modify" || hasImageReference || Boolean(data.params?.imageList?.length)
    ? "image-to-image"
    : "text-to-image";
  const loadingRoutes = loadedCapability !== capability;
  const referenceProblem = promptReferenceRouteProblem(promptDocument, selectedRoute, connectedReferences);
  const parameterConflict = generationParameterConflict(
    selectedRoute?.inputSchema.constraints ?? [],
    settings,
  );
  const parameterConflictLabels = parameterConflict?.keys
    .map((key) => (t.contentGeneration.inputs as Readonly<Record<string, string>>)[key] ?? key)
    .join(" / ");

  useEffect(() => {
    const controller = new AbortController();
    pipelineStudioApi.getGenerationOptions(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const available = imageGenerationRoutes(response.routes, capability);
        const selected = selectImageGenerationRoute(available, data.params?.routeId);
        setRoutes(available);
        setSelectedRouteId(selected?.id ?? "");
        if (selected) setSettings((current) => reconcileComposerSettings(selected, {
          ...current,
          ...(data.params?.settings as Record<string, JsonValue> | undefined),
        }, [IMAGE_ASPECT_RATIO_FIELD]));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLocalError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedCapability(capability);
      });
    return () => controller.abort();
  }, [capability, data.params?.routeId, data.params?.settings]);

  const changeRoute = (routeId: string) => {
    const route = routes.find((candidate) => candidate.id === routeId);
    setSelectedRouteId(routeId);
    if (route) setSettings((current) => reconcileComposerSettings(route, current, [IMAGE_ASPECT_RATIO_FIELD]));
  };

  const promptProblem = imagePromptProblem(selectedRoute, instruction);
  const disabledReason = useMemo(() => {
    if (waitingForSave) return t.pipeline.imageAiPendingSave;
    if (loadingRoutes) return t.pipeline.imageAiRoutesLoading;
    if (!routes.length || !selectedRoute) {
      return capability === "image-to-image" ? t.pipeline.imageAiNoModifyRoutes : t.pipeline.imageAiNoRoutes;
    }
    if (invalidReferenceCount) return t.pipeline.promptReferenceUnavailable;
    if (unsupportedReferenceCount) return t.pipeline.promptReferenceUnsupported;
    if (referenceProblem?.kind === "unsupported") return t.pipeline.promptReferenceUnsupported;
    if (referenceProblem?.kind === "too-many") {
      return t.pipeline.promptReferenceTooMany
        .replace("{label}", referenceProblem.slot.label)
        .replace("{count}", String(referenceProblem.slot.maxFiles ?? 1));
    }
    if (referenceProblem?.kind === "missing-required") {
      return t.pipeline.promptReferenceRequired.replace("{label}", referenceProblem.slot.label);
    }
    if (parameterConflictLabels) {
      return t.pipeline.generationParametersMutuallyExclusive.replace("{fields}", parameterConflictLabels);
    }
    if (promptProblem === "required") return t.pipeline.imageAiInstructionRequired;
    if (promptProblem === "too-short") {
      return t.pipeline.imageAiPromptTooShort.replace("{count}", String(selectedRoute.inputSchema.prompt.minLength ?? 1));
    }
    if (promptProblem === "too-long") {
      return t.pipeline.imageAiPromptTooLong.replace("{count}", String(selectedRoute.inputSchema.prompt.maxLength ?? 20_000));
    }
    return "";
  }, [capability, invalidReferenceCount, loadingRoutes, parameterConflictLabels, promptProblem, referenceProblem, routes.length, selectedRoute, t.pipeline, unsupportedReferenceCount, waitingForSave]);

  const submit = async () => {
    if (disabledReason || generating || cancelling || !selectedRoute) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const response = await pipelineStudioApi.generateCanvasNode(nodeId, {
        prompt: instruction.trim(),
        promptDocument,
        routeId: selectedRoute.id,
        settings: generationRequestSettings(settings),
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

  const surface = (large: boolean) => (
    <ComposerSurface
      large={large}
      mode={mode}
      promptDocument={promptDocument}
      routes={routes}
      selectedRoute={selectedRoute}
      selectedRouteId={selectedRouteId}
      settings={settings}
      loadingRoutes={loadingRoutes}
      generating={generating}
      cancellable={Boolean(data.taskInfo?.runId) && (taskStatus === "queued" || taskStatus === "processing")}
      cancelling={cancelling}
      disabledReason={disabledReason}
      error={localError ?? data.taskInfo?.errorMessage ?? null}
      onPromptDocumentChange={setPromptDocument}
      onReferenceStateChange={({ invalidCount, unsupportedCount }) => {
        setInvalidReferenceCount(invalidCount);
        setUnsupportedReferenceCount(unsupportedCount);
      }}
      onRouteChange={changeRoute}
      onSettingsChange={setSettings}
      onSubmit={() => void submit()}
      onCancel={() => void cancel()}
      onExpand={() => setExpanded(true)}
      nodeId={nodeId}
    />
  );

  return (
    <>
      <InlineCanvasNodeComposer widthClass="w-[min(900px,calc(100vw-32px))]">
        {surface(false)}
      </InlineCanvasNodeComposer>
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
  large, mode, promptDocument, routes, selectedRoute, selectedRouteId, settings,
  loadingRoutes, generating, cancellable, cancelling, disabledReason, error,
  onPromptDocumentChange, onRouteChange, onSettingsChange,
  onReferenceStateChange,
  onSubmit, onCancel, onExpand, nodeId,
}: {
  large: boolean;
  mode: "create" | "modify";
  promptDocument: CanvasPromptDocument;
  routes: GenerationRouteDto[];
  selectedRoute: GenerationRouteDto | undefined;
  selectedRouteId: string;
  settings: Record<string, JsonValue>;
  loadingRoutes: boolean;
  generating: boolean;
  cancellable: boolean;
  cancelling: boolean;
  disabledReason: string;
  error: string | null;
  onPromptDocumentChange: (value: CanvasPromptDocument) => void;
  onReferenceStateChange: (state: { invalidCount: number; unsupportedCount: number }) => void;
  onRouteChange: (value: string) => void;
  onSettingsChange: (value: Record<string, JsonValue>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onExpand: () => void;
  nodeId: string;
}) {
  const { t } = useI18n();
  const busy = generating || cancelling;
  const parameterFields = composerParameterFields(selectedRoute, [IMAGE_ASPECT_RATIO_FIELD]);
  return (
    <CanvasNodeComposerShell
      ariaLabel={mode === "modify" ? t.pipeline.imageAiModifyTitle : t.pipeline.imageAiTitle}
      large={large}
      error={error}
      body={(
        <div className="relative flex min-h-0 flex-1 flex-col">
          {mode === "modify" ? (
            <div className="flex shrink-0 items-center px-4 pt-3">
              <span className="flex h-8 items-center gap-2 text-xs font-medium text-[var(--pl-text-secondary)]">
                <ImagePlus className="size-4 text-[var(--pl-accent)]" />
                {t.pipeline.imageAiCurrentReference}
              </span>
            </div>
          ) : null}
          {!large ? (
            <button
              type="button"
              title={t.pipeline.textAiExpand}
              aria-label={t.pipeline.textAiExpand}
              onClick={onExpand}
              className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg bg-[var(--pl-surface-elevated)] text-[var(--pl-text-muted)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
            >
              <Maximize2 className="size-4" />
            </button>
          ) : null}
          <ResourcePromptEditor
            autoFocus={large}
            value={promptDocument}
            disabled={busy}
            onChange={onPromptDocumentChange}
            onReferenceStateChange={onReferenceStateChange}
            onSubmit={onSubmit}
            allowedMediaTypes={mode === "modify" ? ["text"] : ["text", "image"]}
            excludedCanvasNodeId={nodeId}
            connectedTargetNodeId={mode === "create" ? nodeId : undefined}
            placeholder={mode === "modify" ? t.pipeline.imageAiModifyPlaceholder : t.pipeline.imageAiPlaceholder}
            ariaLabel={t.pipeline.imageAiInstruction}
          />
        </div>
      )}
      footer={(
        <>
          <CanvasModelPicker
            ariaLabel={t.pipeline.imageAiRoute}
            value={selectedRouteId}
            disabled={loadingRoutes || busy || !routes.length}
            onChange={onRouteChange}
            emptyLabel={loadingRoutes ? t.pipeline.imageAiRoutesLoading : t.pipeline.imageAiNoRoutesShort}
            getPopupContainer={tooltipContainer}
            items={routes.map((route) => ({
              id: route.id,
              name: route.name,
              group: route.product,
              meta: route.providerId,
              description: route.description,
              tags: route.tags,
              icon: <ImagePlus className="size-3.5" />,
            }))}
          />
          <CanvasGenerationConfig
            ariaLabel={t.pipeline.videoAiParameters}
            constraints={selectedRoute?.inputSchema.constraints}
            disabled={busy}
            fields={parameterFields}
            getPopupContainer={tooltipContainer}
            onChange={onSettingsChange}
            values={settings}
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
                  className="flex size-9 items-center justify-center rounded-full bg-[var(--pl-accent)] text-white transition-colors hover:bg-[var(--pl-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-35"
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

function generationRequestSettings(values: Record<string, JsonValue>): Record<string, CanvasGenerationSettingValue> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, CanvasGenerationSettingValue] => (
    typeof entry[1] === "string"
    || typeof entry[1] === "number"
    || typeof entry[1] === "boolean"
    || (Array.isArray(entry[1]) && entry[1].every((item) => (
      typeof item === "string" || typeof item === "number" || typeof item === "boolean"
    )))
  )));
}

function tooltipContainer(trigger: HTMLElement): HTMLElement {
  // React Flow 节点可能在交互中短暂脱离 document，弹层跟随触发器父级可保持同一 RootNode。
  return trigger.parentElement ?? trigger;
}
