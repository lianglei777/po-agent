"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import type { GenerationRouteDto, JsonValue } from "@/contracts/generation";
import type { CanvasEdge, CanvasGenerationSettingValue, CanvasNode, CanvasNodeData, CanvasPromptDocument } from "@/contracts/pipeline";
import { ImagePlus } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { promptDocumentFromPlainText, promptDocumentResourceAttrs } from "../model/prompt-document";
import { ResourcePromptEditor } from "../prompt-editor/resource-prompt-editor";
import { imageGenerationRoutes, imagePromptProblem, selectImageGenerationRoute } from "../model/image-generation-options";
import { promptReferenceRouteProblem } from "../model/prompt-reference-validation";
import { canvasNodeHasContent, connectedCanvasReferences } from "../model/canvas-connection-policy";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";
import { CanvasComposerSubmitAction } from "./shared/canvas-composer-submit-action";
import { InlineCanvasNodeComposer } from "./shared/inline-canvas-node-composer";
import { composerDraftKey, useCanvasStore } from "../state/canvas-store";
import {
  composerParameterFields,
  reconcileComposerSettings,
} from "../model/generation-composer-settings";
import { CanvasGenerationConfig } from "./shared/canvas-generation-config";
import { CanvasModelPicker } from "./shared/canvas-model-picker";
import { generationParameterConflict } from "@/components/generation/generation-input-constraints";

export function ImageAiComposer({
  nodeId,
  data,
  waitingForSave,
  workflowLocked,
  mode = "create",
  onNodeUpdate,
}: {
  nodeId: string;
  data: CanvasNodeData;
  waitingForSave: boolean;
  workflowLocked: boolean;
  mode?: "create" | "modify";
  onNodeUpdate: (node: CanvasNode, edges?: CanvasEdge[]) => void;
}) {
  const { t } = useI18n();
  const draftKey = composerDraftKey(nodeId, mode === "modify" ? "image-modify" : "image-create");
  const storedDraft = useCanvasStore((state) => state.composerDrafts[draftKey]);
  const storedReferenceDraft = useCanvasStore((state) => state.composerReferenceDrafts[draftKey]);
  const setComposerDraft = useCanvasStore((state) => state.setComposerDraft);
  const clearComposerDraft = useCanvasStore((state) => state.clearComposerDraft);
  const setComposerReferenceDraft = useCanvasStore((state) => state.setComposerReferenceDraft);
  const clearComposerReferenceDraft = useCanvasStore((state) => state.clearComposerReferenceDraft);
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
  const [settings, setSettings] = useState<Record<string, JsonValue>>(
    data.params?.settings as Record<string, JsonValue> | undefined ?? {},
  );
  const [loadedCapability, setLoadedCapability] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [invalidReferenceCount, setInvalidReferenceCount] = useState(0);
  const [unsupportedReferenceCount, setUnsupportedReferenceCount] = useState(0);
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const canvasEdges = useCanvasStore((state) => state.edges);
  const sourceNode = canvasNodes.find((node) => node.id === nodeId);
  const useReferenceDraft = Boolean(sourceNode && (
    canvasNodeHasContent(sourceNode)
    || sourceNode.data?.taskInfo?.status !== undefined && sourceNode.data.taskInfo.status !== "idle"
 ));
  const connectedReferences = useMemo(() => mode === "create"
    ? storedReferenceDraft ?? connectedCanvasReferences(nodeId, canvasNodes, canvasEdges)
    : [], [canvasEdges, canvasNodes, mode, nodeId, storedReferenceDraft]);
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
        }));
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
    if (route) setSettings((current) => reconcileComposerSettings(route, current));
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
    if (referenceProblem?.kind === "missing-constrained") {
      return t.pipeline.promptReferenceMinimumRequired
        .replace("{count}", String(referenceProblem.minFiles))
        .replace("{labels}", referenceProblem.slots.map((slot) => slot.label).join(" / "));
    }
    if (referenceProblem?.kind === "too-many-constrained") {
      return t.pipeline.promptReferenceTotalTooMany
        .replace("{count}", String(referenceProblem.maxFiles))
        .replace("{labels}", referenceProblem.slots.map((slot) => slot.label).join(" / "));
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
        references: useReferenceDraft ? connectedReferences
          .filter((reference) => reference.sourceType === "canvas-node")
          .map(({ sourceId, role }) => ({ sourceId, role })) : undefined,
      });
      clearComposerDraft(nodeId, mode === "modify" ? "image-modify" : "image-create");
      clearComposerReferenceDraft(nodeId, mode === "modify" ? "image-modify" : "image-create");
      onNodeUpdate(response.node, response.edges);
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
      cancellable={!workflowLocked && Boolean(data.taskInfo?.runId) && (taskStatus === "queued" || taskStatus === "processing")}
      cancelling={cancelling}
      disabledReason={disabledReason}
      error={localError ?? data.taskInfo?.errorMessage ?? null}
      onPromptDocumentChange={setPromptDocument}
      onReferenceStateChange={({ invalidCount, unsupportedCount }) => {
        setInvalidReferenceCount(invalidCount);
        setUnsupportedReferenceCount(unsupportedCount);
      }}
      referenceDraft={useReferenceDraft ? connectedReferences : undefined}
      onReferenceDraftChange={useReferenceDraft
        ? (references) => setComposerReferenceDraft(nodeId, mode === "modify" ? "image-modify" : "image-create", references)
        : undefined}
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
  referenceDraft, onReferenceDraftChange,
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
  referenceDraft?: import("@/contracts/pipeline").CanvasResourceReferenceAttrs[];
  onReferenceDraftChange?: (references: import("@/contracts/pipeline").CanvasResourceReferenceAttrs[]) => void;
  onRouteChange: (value: string) => void;
  onSettingsChange: (value: Record<string, JsonValue>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onExpand: () => void;
  nodeId: string;
}) {
  const { t } = useI18n();
  const busy = generating || cancelling;
  const parameterFields = composerParameterFields(selectedRoute);
  return (
    <CanvasNodeComposerShell
      ariaLabel={mode === "modify" ? t.pipeline.imageAiModifyTitle : t.pipeline.imageAiTitle}
      large={large}
      error={error}
      expandLabel={t.pipeline.textAiExpand}
      onExpand={onExpand}
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
            draftConnectionReferences={referenceDraft}
            onDraftConnectionReferencesChange={onReferenceDraftChange}
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
            itemDetailsLabel={t.pipeline.generationModelDetails}
            getPopupContainer={tooltipContainer}
            items={routes.map((route) => ({
              id: route.id,
              name: route.name,
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
          <CanvasComposerSubmitAction
            cancellable={cancellable}
            cancelling={cancelling}
            cancelLabel={t.pipeline.imageAiCancel}
            disabledReason={disabledReason}
            generateLabel={mode === "modify" ? t.pipeline.imageAiModify : t.pipeline.imageAiGenerate}
            generating={generating}
            generatingLabel={t.pipeline.imageAiGenerating}
            getPopupContainer={tooltipContainer}
            onCancel={onCancel}
            onSubmit={onSubmit}
          />
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
