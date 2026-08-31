"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import type { GenerationRouteDto, JsonValue } from "@/contracts/generation";
import type {
  CanvasGenerationSettingValue,
  CanvasNode,
  CanvasNodeData,
  CanvasPromptDocument,
  CanvasResourceRole,
} from "@/contracts/pipeline";
import { FileVideo } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { promptDocumentFromPlainText } from "../model/prompt-document";
import {
  promptReferenceRouteProblem,
  videoCapabilityForPrompt,
  videoRouteSupportsPrompt,
} from "../model/prompt-reference-validation";
import { connectedCanvasReferences } from "../model/canvas-connection-policy";
import { ResourcePromptEditor } from "../prompt-editor/resource-prompt-editor";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";
import { CanvasComposerSubmitAction } from "./shared/canvas-composer-submit-action";
import { InlineCanvasNodeComposer } from "./shared/inline-canvas-node-composer";
import { composerDraftKey, useCanvasStore } from "../state/canvas-store";
import { reconcileComposerSettings } from "../model/generation-composer-settings";
import { CanvasGenerationConfig } from "./shared/canvas-generation-config";
import { CanvasModelPicker } from "./shared/canvas-model-picker";
import { generationParameterConflict } from "@/components/generation/generation-input-constraints";

export function VideoAiComposer({
  nodeId,
  data,
  waitingForSave,
  workflowLocked,
  onNodeUpdate,
  onInputDirtyChange,
}: {
  nodeId: string;
  data: CanvasNodeData;
  waitingForSave: boolean;
  workflowLocked: boolean;
  onNodeUpdate: (node: CanvasNode) => void;
  onInputDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useI18n();
  const draftKey = composerDraftKey(nodeId, "video");
  const storedDraft = useCanvasStore((state) => state.composerDrafts[draftKey]);
  const setComposerDraft = useCanvasStore((state) => state.setComposerDraft);
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
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const canvasEdges = useCanvasStore((state) => state.edges);
  const connectedReferences = useMemo(
    () => connectedCanvasReferences(nodeId, canvasNodes, canvasEdges),
    [canvasEdges, canvasNodes, nodeId],
  );
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId],
  );
  const inferredCapability = videoCapabilityForPrompt(promptDocument, connectedReferences);
  const availableRoutes = useMemo(
    () => routes.filter((route) => videoRouteSupportsPrompt(promptDocument, route, connectedReferences)),
    [connectedReferences, promptDocument, routes],
  );
  const pickerRoutes = selectedRoute && !availableRoutes.some((route) => route.id === selectedRoute.id)
    ? [selectedRoute, ...availableRoutes]
    : availableRoutes;
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
        const available = response.routes.filter((route) => route.enabled && route.capability.endsWith("-to-video"));
        const selected = available.find((route) => route.id === data.params?.routeId)
          ?? available.find((route) => route.isDefault && route.capability === inferredCapability)
          ?? available.find((route) => route.capability === inferredCapability);
        setRoutes(available);
        setSelectedRouteId(selected?.id ?? "");
        setSettings(selected ? reconcileComposerSettings(selected, data.params?.settings as Record<string, JsonValue>) : {});
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLocalError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRoutesLoaded(true);
      });
    return () => controller.abort();
  }, [data.params?.routeId, data.params?.settings, inferredCapability]);

  const disabledReason = useMemo(() => {
    if (waitingForSave) return t.pipeline.videoAiPendingSave;
    if (loadingRoutes) return t.pipeline.videoAiRoutesLoading;
    if (!selectedRoute) return t.pipeline.videoAiNoRoutes;
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
    const length = promptDocument.plainText.trim().length;
    if (selectedRoute.inputSchema.prompt.required && !length) return t.pipeline.videoAiInstructionRequired;
    if (length < (selectedRoute.inputSchema.prompt.minLength ?? 0)) {
      return t.pipeline.videoAiPromptTooShort.replace("{count}", String(selectedRoute.inputSchema.prompt.minLength));
    }
    if (length > (selectedRoute.inputSchema.prompt.maxLength ?? 20_000)) {
      return t.pipeline.videoAiPromptTooLong.replace("{count}", String(selectedRoute.inputSchema.prompt.maxLength ?? 20_000));
    }
    return "";
  }, [invalidReferenceCount, loadingRoutes, parameterConflictLabels, promptDocument.plainText, referenceProblem, selectedRoute, t.pipeline, unsupportedReferenceCount, waitingForSave]);

  const changeRoute = (routeId: string) => {
    const route = routes.find((candidate) => candidate.id === routeId);
    setSelectedRouteId(routeId);
    const nextSettings = route ? reconcileComposerSettings(route, settings) : {};
    if (route) setSettings(nextSettings);
    onInputDirtyChange?.(
      routeId !== data.params?.routeId
      || JSON.stringify(nextSettings) !== JSON.stringify(data.params?.settings ?? {}),
    );
  };

  const submit = async () => {
    if (disabledReason || generating || cancelling || !selectedRoute) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const response = await pipelineStudioApi.generateCanvasNode(nodeId, {
        prompt: promptDocument.plainText.trim(),
        promptDocument,
        routeId: selectedRoute.id,
        settings: generationRequestSettings(settings),
      });
      onNodeUpdate(response.node);
      setExpanded(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t.pipeline.videoAiError);
    } finally {
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

  const surface = (large: boolean) => (
    <VideoComposerSurface
      large={large}
      nodeId={nodeId}
      promptDocument={promptDocument}
      resourceRole={resourceRole}
      routes={pickerRoutes}
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
      onRouteChange={changeRoute}
      onSettingsChange={(nextSettings) => {
        setSettings(nextSettings);
        onInputDirtyChange?.(
          selectedRouteId !== data.params?.routeId
          || JSON.stringify(nextSettings) !== JSON.stringify(data.params?.settings ?? {}),
        );
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
            onChange={onRouteChange}
            emptyLabel={loadingRoutes ? t.pipeline.videoAiRoutesLoading : t.pipeline.videoAiNoRoutes}
            getPopupContainer={tooltipContainer}
            items={routes.map((route) => ({
              id: route.id,
              name: route.name,
              group: route.product,
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

function tooltipContainer(trigger: HTMLElement) {
  return trigger.closest<HTMLElement>(".pipeline-studio-shell") ?? document.body;
}
