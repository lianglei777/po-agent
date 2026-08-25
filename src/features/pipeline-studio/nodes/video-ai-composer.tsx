"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal, Popover, Tooltip } from "antd";
import type { GenerationRouteDto, JsonValue } from "@/contracts/generation";
import type {
  CanvasGenerationSettingValue,
  CanvasNode,
  CanvasNodeData,
  CanvasPromptDocument,
  CanvasResourceRole,
} from "@/contracts/pipeline";
import { FileVideo, LoaderCircle, Maximize2, Send, Settings2, Sparkles, Square } from "@/components/icons";
import {
  GenerationParameterEditor,
  resolvedGenerationParameters,
} from "@/components/generation/generation-parameter-editor";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { promptDocumentFromPlainText } from "../model/prompt-document";
import {
  promptReferenceRouteProblem,
  videoCapabilityForPrompt,
} from "../model/prompt-reference-validation";
import { ResourcePromptEditor } from "../prompt-editor/resource-prompt-editor";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";
import { InlineCanvasNodeComposer } from "./shared/inline-canvas-node-composer";
import { composerDraftKey, useCanvasStore } from "../state/canvas-store";

export function VideoAiComposer({
  nodeId,
  data,
  waitingForSave,
  onNodeUpdate,
}: {
  nodeId: string;
  data: CanvasNodeData;
  waitingForSave: boolean;
  onNodeUpdate: (node: CanvasNode) => void;
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
  const [loadedCapability, setLoadedCapability] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [invalidReferenceCount, setInvalidReferenceCount] = useState(0);
  const capability = videoCapabilityForPrompt(promptDocument);
  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId),
    [routes, selectedRouteId],
  );
  const loadingRoutes = loadedCapability !== capability;
  const referenceProblem = promptReferenceRouteProblem(promptDocument, selectedRoute);
  const status = data.taskInfo?.status;
  const generating = status === "queued" || status === "processing" || submitting;
  const cancellable = Boolean(data.taskInfo?.runId) && (status === "queued" || status === "processing");

  useEffect(() => {
    const controller = new AbortController();
    pipelineStudioApi.getGenerationOptions(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const available = response.routes.filter((route) => route.enabled && route.capability === capability);
        const selected = available.find((route) => route.id === data.params?.routeId)
          ?? available.find((route) => route.isDefault)
          ?? available[0];
        setRoutes(available);
        setSelectedRouteId(selected?.id ?? "");
        setSettings(selected ? resolvedGenerationParameters(selected, data.params?.settings as Record<string, JsonValue>) : {});
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLocalError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedCapability(capability);
      });
    return () => controller.abort();
  }, [capability, data.params?.routeId, data.params?.settings]);

  const disabledReason = useMemo(() => {
    if (waitingForSave) return t.pipeline.videoAiPendingSave;
    if (loadingRoutes) return t.pipeline.videoAiRoutesLoading;
    if (!selectedRoute) return t.pipeline.videoAiNoRoutes;
    if (invalidReferenceCount) return t.pipeline.promptReferenceUnavailable;
    if (referenceProblem?.kind === "unsupported") return t.pipeline.promptReferenceUnsupported;
    if (referenceProblem?.kind === "too-many") {
      return t.pipeline.promptReferenceTooMany
        .replace("{label}", referenceProblem.slot.label)
        .replace("{count}", String(referenceProblem.slot.maxFiles ?? 1));
    }
    if (referenceProblem?.kind === "missing-required") {
      return t.pipeline.promptReferenceRequired.replace("{label}", referenceProblem.slot.label);
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
  }, [invalidReferenceCount, loadingRoutes, promptDocument.plainText, referenceProblem, selectedRoute, t.pipeline, waitingForSave]);

  const changeRoute = (routeId: string) => {
    const route = routes.find((candidate) => candidate.id === routeId);
    setSelectedRouteId(routeId);
    if (route) setSettings(resolvedGenerationParameters(route));
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
      onReferenceStateChange={({ invalidCount }) => setInvalidReferenceCount(invalidCount)}
      onResourceRoleChange={setResourceRole}
      onRouteChange={changeRoute}
      onSettingsChange={setSettings}
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
  onReferenceStateChange: (state: { invalidCount: number }) => void;
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
      body={(
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 px-4">
            <FileVideo className="size-4 text-[var(--pl-accent)]" />
            <span className="text-xs font-medium text-[var(--pl-text-secondary)]">{t.pipeline.videoAiReferenceHint}</span>
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
          <ResourcePromptEditor
            autoFocus={large}
            value={promptDocument}
            disabled={busy}
            onChange={onPromptDocumentChange}
            onReferenceStateChange={onReferenceStateChange}
            onSubmit={onSubmit}
            allowedMediaTypes={["text", "image", "video", "audio"]}
            excludedCanvasNodeId={nodeId}
            defaultResourceRole={resourceRole}
            onResourceInserted={() => onResourceRoleChange("reference")}
            placeholder={t.pipeline.videoAiPlaceholder}
            ariaLabel={t.pipeline.videoAiInstruction}
          />
        </div>
      )}
      footer={(
        <>
          <Sparkles className="size-4 shrink-0 text-[var(--pl-accent)]" />
          <ComposerSelect
            ariaLabel={t.pipeline.videoAiRoute}
            value={selectedRouteId}
            disabled={loadingRoutes || busy || !routes.length}
            onChange={onRouteChange}
            options={routes.map((route) => ({ value: route.id, label: route.name }))}
            emptyLabel={loadingRoutes ? t.pipeline.videoAiRoutesLoading : t.pipeline.imageAiNoRoutesShort}
            className="max-w-56"
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
          {parameterFields.length ? (
            <Popover
              placement="top"
              trigger="click"
              destroyOnHidden
              classNames={{ container: "!max-w-none" }}
              content={(
                <section className="w-[min(620px,calc(100vw-48px))] p-2" aria-label={t.pipeline.videoAiParameters}>
                  <GenerationParameterEditor
                    disabled={busy}
                    fields={parameterFields}
                    values={settings}
                    onChange={onSettingsChange}
                  />
                </section>
              )}
            >
              <button
                type="button"
                aria-label={t.pipeline.videoAiParameters}
                className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
              >
                <Settings2 className="size-3.5" />
                {t.pipeline.videoAiParameters}
              </button>
            </Popover>
          ) : null}
          <span className="flex-1" />
          {generating ? <LoaderCircle className="size-4 animate-spin text-[var(--pl-text-muted)]" /> : null}
          {generating ? (
            <Tooltip title={cancellable ? t.pipeline.videoAiCancel : t.pipeline.videoAiGenerating} getPopupContainer={tooltipContainer}>
              <span>
                <button
                  type="button"
                  disabled={cancelling || !cancellable}
                  aria-label={t.pipeline.videoAiCancel}
                  onClick={onCancel}
                  className="flex size-9 items-center justify-center rounded-full border border-[var(--pl-border-strong)] text-[var(--pl-text)] hover:bg-[var(--pl-surface-hover)] disabled:opacity-50"
                >
                  {cancelling ? <LoaderCircle className="size-4 animate-spin" /> : <Square className="size-3.5" />}
                </button>
              </span>
            </Tooltip>
          ) : (
            <Tooltip title={disabledReason || t.pipeline.videoAiGenerate} getPopupContainer={tooltipContainer}>
              <span>
                <button
                  type="button"
                  disabled={Boolean(disabledReason)}
                  aria-label={t.pipeline.videoAiGenerate}
                  onClick={onSubmit}
                  className="flex size-9 items-center justify-center rounded-full bg-white text-black hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-35"
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
