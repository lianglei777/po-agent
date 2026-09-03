"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { Modal } from "antd";
import type { GenerationRouteDto, JsonValue } from "@/contracts/generation";
import type {
  CanvasEdge,
  CanvasGenerationSettingValue,
  CanvasNode,
  CanvasNodeData,
  CanvasPromptDocument,
  CanvasResourceReferenceAttrs,
  CanvasResourceRole,
  LipSyncPreparationDto,
} from "@/contracts/pipeline";
import { FileVideo } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { promptDocumentFromPlainText } from "../model/prompt-document";
import {
  promptReferenceRouteProblem,
  videoCapabilityForPrompt,
} from "../model/prompt-reference-validation";
import { selectInitialVideoGenerationRoute, videoGenerationRoutes } from "../model/video-generation-options";
import { canvasNodeHasContent, connectedCanvasReferences } from "../model/canvas-connection-policy";
import { ResourcePromptEditor } from "../prompt-editor/resource-prompt-editor";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";
import { CanvasComposerSubmitAction } from "./shared/canvas-composer-submit-action";
import { InlineCanvasNodeComposer } from "./shared/inline-canvas-node-composer";
import { composerDraftKey, useCanvasStore } from "../state/canvas-store";
import { reconcileComposerSettings } from "../model/generation-composer-settings";
import { CanvasGenerationConfig } from "./shared/canvas-generation-config";
import { CanvasModelPicker } from "./shared/canvas-model-picker";
import { generationParameterConflict } from "@/components/generation/generation-input-constraints";
import { KlingLipSyncComposer } from "./kling-lip-sync-composer";

export function VideoAiComposer({
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
  const draftKey = composerDraftKey(nodeId, "video");
  const storedDraft = useCanvasStore((state) => state.composerDrafts[draftKey]);
  const storedReferenceDraft = useCanvasStore((state) => state.composerReferenceDrafts[draftKey]);
  const setComposerDraft = useCanvasStore((state) => state.setComposerDraft);
  const clearComposerDraft = useCanvasStore((state) => state.clearComposerDraft);
  const setComposerReferenceDraft = useCanvasStore((state) => state.setComposerReferenceDraft);
  const clearComposerReferenceDraft = useCanvasStore((state) => state.clearComposerReferenceDraft);
  const promptDocument = storedDraft
    ?? data.params?.promptDocument
    ?? promptDocumentFromPlainText(data.params?.prompt ?? "");
  const setPromptDocument = (document: CanvasPromptDocument) => setComposerDraft(nodeId, "video", document);
  const [resourceRole, setResourceRole] = useState<CanvasResourceRole>("reference");
  const [routes, setRoutes] = useState<GenerationRouteDto[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState(data.params?.routeId ?? "");
  const [settings, setSettings] = useState<Record<string, JsonValue>>({});
  const [routesLoaded, setRoutesLoaded] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [invalidReferenceCount, setInvalidReferenceCount] = useState(0);
  const [unsupportedReferenceCount, setUnsupportedReferenceCount] = useState(0);
  const [lipSyncPreparation, setLipSyncPreparation] = useState<LipSyncPreparationDto | null>(null);
  const [lipSyncFaceKey, setLipSyncFaceKey] = useState(data.params?.lipSync?.faceKey ?? "");
  const [automaticTiming, setAutomaticTiming] = useState(true);
  const preparationController = useRef<AbortController | null>(null);
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const canvasEdges = useCanvasStore((state) => state.edges);
  const sourceNode = canvasNodes.find((node) => node.id === nodeId);
  const useReferenceDraft = Boolean(sourceNode && (
    canvasNodeHasContent(sourceNode)
    || sourceNode.data?.taskInfo?.status !== undefined && sourceNode.data.taskInfo.status !== "idle"
 ));
  const connectedReferences = useMemo(() => storedReferenceDraft
    ?? connectedCanvasReferences(nodeId, canvasNodes, canvasEdges), [canvasEdges, canvasNodes, nodeId, storedReferenceDraft]);
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId],
  );
  const isLipSync = selectedRoute?.capability === "audio-to-video";
  const videoReferences = connectedReferences.filter((reference) => reference.mediaType === "video");
  const audioReferences = connectedReferences.filter((reference) => reference.mediaType === "audio");
  const sourceAudioDurationMs = audioReferences.length === 1
    ? durationMilliseconds(canvasNodes.find((node) => node.id === audioReferences[0].sourceId)?.data?.audioMetadata?.durationSeconds)
    : undefined;
  const videoSource = videoReferences.length === 1
    ? canvasNodes.find((node) => node.id === videoReferences[0].sourceId)
    : undefined;
  const videoReferenceIdentity = videoReferences.length === 1 ? mediaReferenceIdentity(videoReferences[0], videoSource) : "";
  const previousVideoReferenceIdentity = useRef(videoReferenceIdentity);
  const inferredCapability = videoCapabilityForPrompt(promptDocument, connectedReferences);
  // 素材只参与首次推荐；后续变化必须保留用户手动选择的 Route，避免模型被静默替换。
  const initialRouteId = useRef(data.params?.routeId);
  const initialSettings = useRef(data.params?.settings as Record<string, JsonValue> | undefined);
  const initialCapability = useRef(inferredCapability);
  const loadingRoutes = !routesLoaded;
  const referenceProblem = promptReferenceRouteProblem(promptDocument, selectedRoute, connectedReferences);
  const parameterConflict = generationParameterConflict(
    selectedRoute?.inputSchema.constraints ?? [],
    settings,
  );
  const parameterConflictLabels = parameterConflict?.keys
    .map((key) => (t.contentGeneration.inputs as Readonly<Record<string, string>>)[key] ?? key)
    .join(" / ");
  const status = data.taskInfo?.status;
  const generating = status === "queued" || status === "processing" || submitting;
  const cancellable = !workflowLocked && Boolean(data.taskInfo?.runId) && (status === "queued" || status === "processing");

  useEffect(() => {
    const controller = new AbortController();
    pipelineStudioApi.getGenerationOptions(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const available = videoGenerationRoutes(response.routes);
        const selected = selectInitialVideoGenerationRoute(
          available,
          initialRouteId.current,
          initialCapability.current,
        );
        setRoutes(available);
        setSelectedRouteId(selected?.id ?? "");
        setSettings(selected ? reconcileComposerSettings(selected, initialSettings.current) : {});
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLocalError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRoutesLoaded(true);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => preparationController.current?.abort(), []);

  useEffect(() => {
    if (previousVideoReferenceIdentity.current === videoReferenceIdentity) return;
    previousVideoReferenceIdentity.current = videoReferenceIdentity;
    preparationController.current?.abort();
    setLipSyncPreparation(null);
    setLipSyncFaceKey("");
  }, [videoReferenceIdentity]);

  useEffect(() => {
    const stored = data.params?.lipSync;
    if (!stored) return;
    const controller = new AbortController();
    pipelineStudioApi.getLipSyncPreparation(nodeId, stored.preparationId, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setLipSyncPreparation(response.preparation);
        if (response.preparation.faces.some((face) => face.key === stored.faceKey)) {
          setLipSyncFaceKey(stored.faceKey);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [data.params?.lipSync, nodeId]);

  const disabledReason = (() => {
    if (waitingForSave) return t.pipeline.videoAiPendingSave;
    if (loadingRoutes) return t.pipeline.videoAiRoutesLoading;
    if (!selectedRoute) return t.pipeline.videoAiNoRoutes;
    if (selectedRoute.capability === "audio-to-video") {
      if (videoReferences.length !== 1) return t.pipeline.lipSyncVideoCountRequired;
      if (audioReferences.length !== 1) return t.pipeline.lipSyncAudioCountRequired;
      if (lipSyncPreparation?.status === "ready" && !lipSyncFaceKey) return t.pipeline.lipSyncFaceRequired;
      const timingError = lipSyncTimingProblem(settings, lipSyncPreparation, lipSyncFaceKey);
      if (timingError === "duration") return t.pipeline.lipSyncDurationTooShort;
      if (timingError === "overlap") return t.pipeline.lipSyncOverlapRequired;
      return "";
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
    const length = promptDocument.plainText.trim().length;
    if (selectedRoute.inputSchema.prompt.required && !length) return t.pipeline.videoAiInstructionRequired;
    if (length < (selectedRoute.inputSchema.prompt.minLength ?? 0)) {
      return t.pipeline.videoAiPromptTooShort.replace("{count}", String(selectedRoute.inputSchema.prompt.minLength));
    }
    if (length > (selectedRoute.inputSchema.prompt.maxLength ?? 20_000)) {
      return t.pipeline.videoAiPromptTooLong.replace("{count}", String(selectedRoute.inputSchema.prompt.maxLength ?? 20_000));
    }
    return "";
  })();

  const changeRoute = (routeId: string) => {
    const route = routes.find((candidate) => candidate.id === routeId);
    setSelectedRouteId(routeId);
    if (route?.capability === "image-to-video") setResourceRole("first-frame");
    if (route?.capability !== "audio-to-video") {
      preparationController.current?.abort();
      setLipSyncPreparation(null);
      setLipSyncFaceKey("");
    }
    const nextSettings = route ? reconcileComposerSettings(route, settings) : {};
    if (route) setSettings(nextSettings);
  };

  const submit = async () => {
    if (disabledReason || generating || cancelling || !selectedRoute) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      if (selectedRoute.capability === "audio-to-video") {
        const wasReady = lipSyncPreparation?.status === "ready";
        const preparation = wasReady ? lipSyncPreparation : await prepareLipSync(
          nodeId,
          preparationController,
          setLipSyncPreparation,
          t.pipeline.lipSyncAnalysisTimeout,
        );
        if (preparation.status !== "ready") {
          throw new Error(preparation.errorMessage ?? t.pipeline.lipSyncAnalysisFailed);
        }
        const face = preparation.faces.find((candidate) => candidate.key === lipSyncFaceKey)
          ?? preparation.faces.find((candidate) => candidate.recommended)
          ?? preparation.faces[0];
        if (!face) throw new Error(t.pipeline.lipSyncAnalysisFailed);
        const nextSettings = automaticTiming
          ? automaticLipSyncSettings(settings, face, sourceAudioDurationMs)
          : settings;
        setLipSyncPreparation(preparation);
        setLipSyncFaceKey(face.key);
        setSettings(nextSettings);
        // 多人脸第一次点击只完成识别并展示选择，避免未经用户确认就消耗生成额度。
        if (!wasReady && preparation.faces.length > 1) return;
        const response = await pipelineStudioApi.generateCanvasNode(nodeId, {
          prompt: "",
          routeId: selectedRoute.id,
          settings: generationRequestSettings(nextSettings),
          lipSync: { preparationId: preparation.id, faceKey: face.key },
          references: useReferenceDraft ? generationReferences(connectedReferences) : undefined,
        });
        clearComposerDraft(nodeId, "video");
        clearComposerReferenceDraft(nodeId, "video");
        onNodeUpdate(response.node, response.edges);
        setExpanded(false);
        return;
      }
      const response = await pipelineStudioApi.generateCanvasNode(nodeId, {
        prompt: promptDocument.plainText.trim(),
        promptDocument,
        routeId: selectedRoute.id,
        settings: generationRequestSettings(settings),
        references: useReferenceDraft ? generationReferences(connectedReferences) : undefined,
      });
      clearComposerDraft(nodeId, "video");
      clearComposerReferenceDraft(nodeId, "video");
      onNodeUpdate(response.node, response.edges);
      setExpanded(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t.pipeline.videoAiError);
    } finally {
      preparationController.current = null;
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    if (!cancellable || cancelling) return;
    setCancelling(true);
    setLocalError(null);
    try {
      const response = await pipelineStudioApi.cancelCanvasNodeGeneration(nodeId);
      onNodeUpdate(response.node);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t.pipeline.videoAiCancelError);
    } finally {
      setCancelling(false);
    }
  };

  const surface = (large: boolean) => isLipSync ? (
    <KlingLipSyncComposer
      large={large}
      routes={routes}
      selectedRouteId={selectedRouteId}
      references={connectedReferences}
      preparation={lipSyncPreparation}
      faceKey={lipSyncFaceKey}
      settings={settings}
      automaticTiming={automaticTiming}
      busy={generating || cancelling}
      cancellable={cancellable}
      cancelling={cancelling}
      disabledReason={disabledReason}
      error={localError ?? lipSyncPreparation?.errorMessage ?? data.taskInfo?.errorMessage ?? null}
      onRouteChange={changeRoute}
      onFaceChange={(faceKey) => {
        setLipSyncFaceKey(faceKey);
        const face = lipSyncPreparation?.faces.find((candidate) => candidate.key === faceKey);
        if (automaticTiming && face) {
          setSettings((current) => automaticLipSyncSettings(current, face, sourceAudioDurationMs));
        }
      }}
      onSettingsChange={(nextSettings) => {
        setSettings(nextSettings);
      }}
      onAutomaticTimingChange={(value) => {
        setAutomaticTiming(value);
        const face = lipSyncPreparation?.faces.find((candidate) => candidate.key === lipSyncFaceKey);
        if (value && face) {
          setSettings((current) => automaticLipSyncSettings(current, face, sourceAudioDurationMs));
        }
      }}
      onSubmit={() => void submit()}
      onCancel={() => void cancel()}
      onExpand={() => setExpanded(true)}
    />
  ) : (
    <VideoComposerSurface
      large={large}
      nodeId={nodeId}
      promptDocument={promptDocument}
      resourceRole={resourceRole}
      routes={routes}
      selectedRoute={selectedRoute}
      selectedRouteId={selectedRouteId}
      settings={settings}
      loadingRoutes={loadingRoutes}
      generating={generating}
      cancellable={cancellable}
      cancelling={cancelling}
      disabledReason={disabledReason}
      error={localError ?? data.taskInfo?.errorMessage ?? null}
      onPromptDocumentChange={setPromptDocument}
      onReferenceStateChange={({ invalidCount, unsupportedCount }) => {
        setInvalidReferenceCount(invalidCount);
        setUnsupportedReferenceCount(unsupportedCount);
      }}
      onResourceRoleChange={setResourceRole}
      referenceDraft={useReferenceDraft ? connectedReferences : undefined}
      onReferenceDraftChange={useReferenceDraft
        ? (references) => setComposerReferenceDraft(nodeId, "video", references)
        : undefined}
      onRouteChange={changeRoute}
      onSettingsChange={(nextSettings) => {
        setSettings(nextSettings);
      }}
      onSubmit={() => void submit()}
      onCancel={() => void cancel()}
      onExpand={() => setExpanded(true)}
    />
  );

  return (
    <>
      <InlineCanvasNodeComposer widthClass="w-[min(920px,calc(100vw-32px))]">
        {surface(false)}
      </InlineCanvasNodeComposer>
      <Modal
        open={expanded}
        title={t.pipeline.videoAiTitle}
        width={1040}
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

function VideoComposerSurface({
  large, nodeId, promptDocument, resourceRole, routes, selectedRoute, selectedRouteId, settings,
  loadingRoutes, generating, cancellable, cancelling, disabledReason, error,
  onPromptDocumentChange, onReferenceStateChange, onResourceRoleChange, onRouteChange,
  referenceDraft, onReferenceDraftChange,
  onSettingsChange, onSubmit, onCancel, onExpand,
}: {
  large: boolean;
  nodeId: string;
  promptDocument: CanvasPromptDocument;
  resourceRole: CanvasResourceRole;
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
  onResourceRoleChange: (role: CanvasResourceRole) => void;
  referenceDraft?: CanvasResourceReferenceAttrs[];
  onReferenceDraftChange?: (references: CanvasResourceReferenceAttrs[]) => void;
  onRouteChange: (routeId: string) => void;
  onSettingsChange: (settings: Record<string, JsonValue>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onExpand: () => void;
}) {
  const { t } = useI18n();
  const busy = generating || cancelling;
  const parameterFields = selectedRoute?.inputSchema.parameters ?? [];
  return (
    <CanvasNodeComposerShell
      ariaLabel={t.pipeline.videoAiTitle}
      large={large}
      error={error}
      expandLabel={t.pipeline.textAiExpand}
      onExpand={onExpand}
      body={(
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 px-4">
            <FileVideo className="size-4 text-[var(--pl-accent)]" />
            <span className="text-xs font-medium text-[var(--pl-text-secondary)]">{t.pipeline.videoAiReferenceHint}</span>
          </div>
          <ResourcePromptEditor
            autoFocus={large}
            value={promptDocument}
            disabled={busy}
            onChange={onPromptDocumentChange}
            onReferenceStateChange={onReferenceStateChange}
            onSubmit={onSubmit}
            allowedMediaTypes={["text", "image", "video", "audio"]}
            excludedCanvasNodeId={nodeId}
            connectedTargetNodeId={nodeId}
            draftConnectionReferences={referenceDraft}
            onDraftConnectionReferencesChange={onReferenceDraftChange}
            defaultResourceRole={resourceRole}
            onResourceInserted={() => onResourceRoleChange("reference")}
            placeholder={t.pipeline.videoAiPlaceholder}
            ariaLabel={t.pipeline.videoAiInstruction}
          />
        </div>
      )}
      footer={(
        <>
          <CanvasModelPicker
            ariaLabel={t.pipeline.videoAiRoute}
            value={selectedRouteId}
            disabled={loadingRoutes || busy || !routes.length}
            itemDetailsLabel={t.pipeline.generationModelDetails}
            onChange={onRouteChange}
            emptyLabel={loadingRoutes ? t.pipeline.videoAiRoutesLoading : t.pipeline.videoAiNoRoutes}
            getPopupContainer={tooltipContainer}
            items={routes.map((route) => ({
              id: route.id,
              name: route.name,
              meta: route.providerId,
              description: route.description,
              tags: route.tags,
              icon: <FileVideo className="size-3.5" />,
            }))}
          />
          <ComposerSelect
            ariaLabel={t.pipeline.videoAiImageRole}
            value={resourceRole}
            disabled={busy}
            onChange={(value) => onResourceRoleChange(value as CanvasResourceRole)}
            options={[
              { value: "reference", label: t.pipeline.videoAiRoleReference },
              { value: "first-frame", label: t.pipeline.videoAiRoleFirstFrame },
              { value: "last-frame", label: t.pipeline.videoAiRoleLastFrame },
            ]}
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
            cancelLabel={t.pipeline.videoAiCancel}
            disabledReason={disabledReason}
            generateLabel={t.pipeline.videoAiGenerate}
            generating={generating}
            generatingLabel={t.pipeline.videoAiGenerating}
            getPopupContainer={tooltipContainer}
            onCancel={onCancel}
            onSubmit={onSubmit}
          />
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

function generationReferences(references: CanvasResourceReferenceAttrs[]) {
  return references
    .filter((reference) => reference.sourceType === "canvas-node")
    .map(({ sourceId, role }) => ({ sourceId, role }));
}

async function prepareLipSync(
  nodeId: string,
  controllerRef: MutableRefObject<AbortController | null>,
  onChange: (preparation: LipSyncPreparationDto) => void,
  timeoutMessage: string,
) {
  controllerRef.current?.abort();
  const controller = new AbortController();
  controllerRef.current = controller;
  let preparation = (await pipelineStudioApi.createLipSyncPreparation(nodeId)).preparation;
  onChange(preparation);
  for (let attempt = 0; preparation.status === "analyzing" && attempt < 80; attempt += 1) {
    await abortableDelay(1_500, controller.signal);
    preparation = (await pipelineStudioApi.getLipSyncPreparation(nodeId, preparation.id, controller.signal)).preparation;
    onChange(preparation);
  }
  if (preparation.status === "analyzing") throw new Error(timeoutMessage);
  return preparation;
}

function automaticLipSyncSettings(
  current: Record<string, JsonValue>,
  face: LipSyncPreparationDto["faces"][number],
  audioDurationMs: number | undefined,
) {
  const availableDuration = face.availableEndMs - face.availableStartMs;
  const cropDuration = Math.min(audioDurationMs ?? 2_000, availableDuration, 60_000);
  return {
    ...current,
    soundStartTime: 0,
    soundEndTime: Math.max(2_000, cropDuration),
    soundInsertTime: face.availableStartMs,
  };
}

function lipSyncTimingProblem(
  settings: Record<string, JsonValue>,
  preparation: LipSyncPreparationDto | null,
  faceKey: string,
): "duration" | "overlap" | "" {
  if (preparation?.status !== "ready" || !faceKey) return "";
  const face = preparation.faces.find((candidate) => candidate.key === faceKey);
  if (!face) return "";
  const start = numericSetting(settings.soundStartTime, 0);
  const end = numericSetting(settings.soundEndTime, 2_000);
  const insert = numericSetting(settings.soundInsertTime, 0);
  const duration = end - start;
  if (duration < 2_000) return "duration";
  const overlap = Math.min(insert + duration, face.availableEndMs) - Math.max(insert, face.availableStartMs);
  return overlap < 2_000 ? "overlap" : "";
}

function numericSetting(value: JsonValue | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function durationMilliseconds(seconds: number | undefined) {
  return typeof seconds === "number" && Number.isFinite(seconds) ? Math.round(seconds * 1_000) : undefined;
}

function mediaReferenceIdentity(reference: CanvasResourceReferenceAttrs, source: CanvasNode | undefined) {
  return [
    reference.sourceId,
    source?.data?.videoSelection?.artifactId,
    source?.data?.artifactIds?.join(","),
    source?.data?.workspaceFile?.relativePath,
    source?.data?.url?.join(","),
  ].filter(Boolean).join(":");
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function tooltipContainer(trigger: HTMLElement) {
  return trigger.closest<HTMLElement>(".pipeline-studio-shell") ?? document.body;
}
