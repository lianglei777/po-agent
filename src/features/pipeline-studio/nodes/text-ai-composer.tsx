"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import type { ModelInfo } from "@/contracts/models";
import type { CanvasNode, CanvasNodeData, CanvasPromptDocument } from "@/contracts/pipeline";
import { LoaderCircle, Maximize2, Send, Sparkles } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { promptDocumentFromPlainText } from "../model/prompt-document";
import { ResourcePromptEditor } from "../prompt-editor/resource-prompt-editor";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";
import { InlineCanvasNodeComposer } from "./shared/inline-canvas-node-composer";
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
  onGenerated: (node: CanvasNode) => void;
}) {
  const { t } = useI18n();
  const draftKey = composerDraftKey(nodeId, "text");
  const storedDraft = useCanvasStore((state) => state.composerDrafts[draftKey]);
  const setComposerDraft = useCanvasStore((state) => state.setComposerDraft);
  const promptDocument = storedDraft
    ?? data.params?.promptDocument
    ?? promptDocumentFromPlainText("");
  const setPromptDocument = (document: CanvasPromptDocument) => setComposerDraft(nodeId, "text", document);
  const instruction = promptDocument.plainText;
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
      });
      onGenerated(response.node);
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
      body={(
        <>
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
          placeholder={mode === "revise" ? t.pipeline.textAiRevisePlaceholder : t.pipeline.textAiGeneratePlaceholder}
          ariaLabel={mode === "revise" ? t.pipeline.textAiRevise : t.pipeline.textAiGenerate}
        />
        {!large ? (
          <button
            type="button"
            title={t.pipeline.textAiExpand}
            aria-label={t.pipeline.textAiExpand}
            onClick={onExpand}
            className="m-3 flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--pl-text-muted)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
          >
            <Maximize2 className="size-4" />
          </button>
        ) : null}
        </>
      )}
      footer={(
        <>
        <Sparkles className="size-4 shrink-0 text-[var(--pl-accent)]" />
        <label className="sr-only" htmlFor={`text-ai-model-${large ? "large" : "inline"}`}>{t.pipeline.textAiModel}</label>
        <select
          id={`text-ai-model-${large ? "large" : "inline"}`}
          value={selectedModel}
          disabled={loadingModels || generating || !models.length}
          onChange={(event) => onModelChange(event.target.value)}
          className="nodrag h-8 min-w-0 max-w-64 rounded-lg border border-transparent bg-transparent px-2 text-xs text-[var(--pl-text-secondary)] outline-none hover:border-[var(--pl-border)] focus:border-[var(--pl-accent)] disabled:opacity-50"
        >
          {!models.length ? <option value="">{loadingModels ? t.pipeline.textAiModelLoading : t.pipeline.textAiNoModels}</option> : null}
          {models.map((model) => <option key={modelValue(model)} value={modelValue(model)}>{model.name} · {model.provider}</option>)}
        </select>
        {referenceCount ? (
          <span className="hidden truncate text-[10px] text-[var(--pl-text-muted)] sm:block">
            {t.pipeline.textAiReferences.replace("{count}", String(referenceCount))}
          </span>
        ) : null}
        <span className="flex-1" />
        {generating ? <span className="flex items-center gap-2 text-xs text-[var(--pl-text-muted)]"><LoaderCircle className="size-3.5 animate-spin" />{t.pipeline.textAiGenerating}</span> : null}
        <span title={disabledReason || (mode === "revise" ? t.pipeline.textAiRevise : t.pipeline.textAiGenerate)}>
          <button
            type="button"
            disabled={Boolean(disabledReason) || generating}
            aria-label={mode === "revise" ? t.pipeline.textAiRevise : t.pipeline.textAiGenerate}
            onClick={onSubmit}
            className="flex size-9 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            {generating ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </span>
        </>
      )}
    />
  );
}

function modelValue(model: ModelInfo | undefined) {
  return model ? `${model.provider}:${model.id}` : "";
}
