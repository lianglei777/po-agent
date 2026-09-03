"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import type { ModelInfo } from "@/contracts/models";
import type { CanvasEdge, CanvasNode, CanvasNodeData, CanvasPromptDocument } from "@/contracts/pipeline";
import { Brain } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { promptDocumentFromPlainText } from "../model/prompt-document";
import { ResourcePromptEditor } from "../prompt-editor/resource-prompt-editor";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";
import { CanvasComposerSubmitAction } from "./shared/canvas-composer-submit-action";
import { InlineCanvasNodeComposer } from "./shared/inline-canvas-node-composer";
import { CanvasModelPicker } from "./shared/canvas-model-picker";
import { connectedCanvasReferences, canvasNodeHasContent } from "../model/canvas-connection-policy";
import { composerDraftKey, useCanvasStore } from "../state/canvas-store";

export function TextAiComposer({
  nodeId,
  data,
  waitingForSave,
  onGenerated,
}: {
  nodeId: string;
  data: CanvasNodeData;
  waitingForSave: boolean;
  onGenerated: (node: CanvasNode, edges?: CanvasEdge[]) => void;
}) {
  const { t } = useI18n();
  const draftKey = composerDraftKey(nodeId, "text");
  const storedDraft = useCanvasStore((state) => state.composerDrafts[draftKey]);
  const storedReferenceDraft = useCanvasStore((state) => state.composerReferenceDrafts[draftKey]);
  const setComposerDraft = useCanvasStore((state) => state.setComposerDraft);
  const clearComposerDraft = useCanvasStore((state) => state.clearComposerDraft);
  const setComposerReferenceDraft = useCanvasStore((state) => state.setComposerReferenceDraft);
  const clearComposerReferenceDraft = useCanvasStore((state) => state.clearComposerReferenceDraft);
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const canvasEdges = useCanvasStore((state) => state.edges);
  const promptDocument = storedDraft
    ?? data.params?.promptDocument
    ?? promptDocumentFromPlainText("");
  const setPromptDocument = (document: CanvasPromptDocument) => setComposerDraft(nodeId, "text", document);
  const instruction = promptDocument.plainText;
  const sourceNode = canvasNodes.find((node) => node.id === nodeId);
  const useReferenceDraft = Boolean(sourceNode && (
    canvasNodeHasContent(sourceNode)
    || sourceNode.data?.taskInfo?.status !== undefined && sourceNode.data.taskInfo.status !== "idle"
  ));
  const connectedReferences = useMemo(() => storedReferenceDraft
    ?? connectedCanvasReferences(nodeId, canvasNodes, canvasEdges), [canvasEdges, canvasNodes, nodeId, storedReferenceDraft]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState(data.params?.model ?? "");
  const [loadingModels, setLoadingModels] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidReferenceCount, setInvalidReferenceCount] = useState(0);
  const [unsupportedReferenceCount, setUnsupportedReferenceCount] = useState(0);
  const plainText = data.textDocument?.plainText ?? data.content?.join("\n") ?? "";
  const mode = plainText.trim() ? "revise" : "generate";
  const referenceCount = data.params?.textList?.filter((reference) => reference.content?.some((content) => content.trim())).length ?? 0;

  useEffect(() => {
    const controller = new AbortController();
    pipelineStudioApi.getTextModels()
      .then((response) => {
        if (controller.signal.aborted) return;
        const textModels = response.models.filter((model) => !model.input || model.input.includes("text"));
        const defaultModel = response.defaultModel
          ? `${response.defaultModel.provider}:${response.defaultModel.modelId}`
          : "";
        setModels(textModels);
        setSelectedModel((current) => {
          const availableValues = new Set(textModels.map(modelValue));
          if (current && availableValues.has(current)) return current;
          if (defaultModel && availableValues.has(defaultModel)) return defaultModel;
          return modelValue(textModels[0]);
        });
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingModels(false);
      });
    return () => controller.abort();
  }, []);

  const disabledReason = useMemo(() => {
    if (waitingForSave) return t.pipeline.textAiPendingSave;
    if (loadingModels) return t.pipeline.textAiModelLoading;
    if (!models.length || !selectedModel) return t.pipeline.textAiNoModels;
    if (invalidReferenceCount) return t.pipeline.promptReferenceUnavailable;
    if (unsupportedReferenceCount) return t.pipeline.promptReferenceUnsupported;
    if (!instruction.trim()) return t.pipeline.textAiInstructionRequired;
    return "";
  }, [instruction, invalidReferenceCount, loadingModels, models.length, selectedModel, t.pipeline, unsupportedReferenceCount, waitingForSave]);

  const submit = async () => {
    if (disabledReason || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await pipelineStudioApi.generateText(nodeId, {
        instruction: instruction.trim(),
        promptDocument,
        mode,
        model: selectedModel,
        references: useReferenceDraft ? connectedReferences
          .filter((reference) => reference.sourceType === "canvas-node")
          .map(({ sourceId, role }) => ({ sourceId, role })) : undefined,
      });
      clearComposerDraft(nodeId, "text");
      clearComposerReferenceDraft(nodeId, "text");
      onGenerated(response.node, response.edges);
      setExpanded(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.pipeline.textAiError);
    } finally {
      setGenerating(false);
    }
  };

  const surface = (large: boolean) => (
    <ComposerSurface
      large={large}
      promptDocument={promptDocument}
      models={models}
      selectedModel={selectedModel}
      loadingModels={loadingModels}
      generating={generating}
      mode={mode}
      referenceCount={referenceCount}
      disabledReason={disabledReason}
      error={error}
      onPromptDocumentChange={setPromptDocument}
      onReferenceStateChange={({ invalidCount, unsupportedCount }) => {
        setInvalidReferenceCount(invalidCount);
        setUnsupportedReferenceCount(unsupportedCount);
      }}
      onModelChange={setSelectedModel}
      referenceDraft={useReferenceDraft ? connectedReferences : undefined}
      onReferenceDraftChange={useReferenceDraft
        ? (references) => setComposerReferenceDraft(nodeId, "text", references)
        : undefined}
      onSubmit={() => void submit()}
      nodeId={nodeId}
      onExpand={() => setExpanded(true)}
    />
  );

  return (
    <>
      <InlineCanvasNodeComposer widthClass="w-[min(720px,calc(100vw-32px))]">
        {surface(false)}
      </InlineCanvasNodeComposer>
      <Modal
        open={expanded}
        title={t.pipeline.textAiTitle}
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
  large,
  promptDocument,
  models,
  selectedModel,
  loadingModels,
  generating,
  mode,
  referenceCount,
  disabledReason,
  error,
  onPromptDocumentChange,
  onReferenceStateChange,
  onModelChange,
  referenceDraft,
  onReferenceDraftChange,
  onSubmit,
  onExpand,
  nodeId,
}: {
  large: boolean;
  promptDocument: CanvasPromptDocument;
  models: ModelInfo[];
  selectedModel: string;
  loadingModels: boolean;
  generating: boolean;
  mode: "generate" | "revise";
  referenceCount: number;
  disabledReason: string;
  error: string | null;
  onPromptDocumentChange: (value: CanvasPromptDocument) => void;
  onReferenceStateChange: (state: { invalidCount: number; unsupportedCount: number }) => void;
  onModelChange: (value: string) => void;
  referenceDraft?: import("@/contracts/pipeline").CanvasResourceReferenceAttrs[];
  onReferenceDraftChange?: (references: import("@/contracts/pipeline").CanvasResourceReferenceAttrs[]) => void;
  onSubmit: () => void;
  onExpand: () => void;
  nodeId: string;
}) {
  const { t } = useI18n();
  return (
    <CanvasNodeComposerShell
      ariaLabel={t.pipeline.textAiTitle}
      large={large}
      error={error}
      expandLabel={t.pipeline.textAiExpand}
      onExpand={onExpand}
      body={(
        <ResourcePromptEditor
          autoFocus={large}
          value={promptDocument}
          disabled={generating}
          onChange={onPromptDocumentChange}
          onReferenceStateChange={onReferenceStateChange}
          onSubmit={onSubmit}
          allowedMediaTypes={["text"]}
          excludedCanvasNodeId={nodeId}
          connectedTargetNodeId={nodeId}
          draftConnectionReferences={referenceDraft}
          onDraftConnectionReferencesChange={onReferenceDraftChange}
          placeholder={mode === "revise" ? t.pipeline.textAiRevisePlaceholder : t.pipeline.textAiGeneratePlaceholder}
          ariaLabel={mode === "revise" ? t.pipeline.textAiRevise : t.pipeline.textAiGenerate}
        />
      )}
      footer={(
        <>
        <CanvasModelPicker
          ariaLabel={t.pipeline.textAiModel}
          value={selectedModel}
          disabled={loadingModels || generating || !models.length}
          emptyLabel={loadingModels ? t.pipeline.textAiModelLoading : t.pipeline.textAiNoModels}
          itemDetailsLabel={t.pipeline.generationModelDetails}
          onChange={onModelChange}
          getPopupContainer={tooltipContainer}
          items={models.map((model) => ({
            id: modelValue(model),
            name: model.name,
            meta: model.provider,
            description: t.pipeline.generationTextModelDescription.replace("{provider}", model.provider),
            tags: [
              ...(model.input?.includes("image") ? [t.pipeline.generationVisionInput] : []),
              ...(model.thinkingLevels.length ? [t.pipeline.generationReasoning] : []),
              ...(model.contextWindow ? [t.pipeline.generationContextWindow.replace("{count}", formatCompactNumber(model.contextWindow))] : []),
            ],
            icon: <Brain className="size-3.5" />,
          }))}
        />
        {referenceCount ? (
          <span className="hidden truncate text-caption text-[var(--pl-text-muted)] sm:block">
            {t.pipeline.textAiReferences.replace("{count}", String(referenceCount))}
          </span>
        ) : null}
        <span className="flex-1" />
        <CanvasComposerSubmitAction
          disabledReason={disabledReason}
          generateLabel={mode === "revise" ? t.pipeline.textAiRevise : t.pipeline.textAiGenerate}
          generating={generating}
          generatingLabel={t.pipeline.textAiGenerating}
          getPopupContainer={tooltipContainer}
          onSubmit={onSubmit}
        />
        </>
      )}
    />
  );
}

function modelValue(model: ModelInfo | undefined) {
  return model ? `${model.provider}:${model.id}` : "";
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function tooltipContainer(trigger: HTMLElement) {
  return trigger.closest<HTMLElement>(".pipeline-studio-shell") ?? document.body;
}
