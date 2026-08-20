"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Modal } from "antd";
import type { ModelInfo } from "@/contracts/models";
import type { CanvasNode, CanvasNodeData } from "@/contracts/pipeline";
import { LoaderCircle, Maximize2, Send, Sparkles } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";

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
  const [instruction, setInstruction] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState(data.params?.model ?? "");
  const [loadingModels, setLoadingModels] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (!instruction.trim()) return t.pipeline.textAiInstructionRequired;
    return "";
  }, [instruction, loadingModels, models.length, selectedModel, t.pipeline, waitingForSave]);

  const submit = async () => {
    if (disabledReason || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await pipelineStudioApi.generateText(nodeId, {
        instruction: instruction.trim(),
        mode,
        model: selectedModel,
      });
      onGenerated(response.node);
      setInstruction("");
      setExpanded(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t.pipeline.textAiError);
    } finally {
      setGenerating(false);
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
      instruction={instruction}
      models={models}
      selectedModel={selectedModel}
      loadingModels={loadingModels}
      generating={generating}
      mode={mode}
      referenceCount={referenceCount}
      disabledReason={disabledReason}
      error={error}
      onInstructionChange={setInstruction}
      onModelChange={setSelectedModel}
      onKeyDown={handleKeyDown}
      onSubmit={() => void submit()}
      onExpand={() => setExpanded(true)}
    />
  );

  return (
    <>
      <div
        className="nodrag nowheel absolute left-1/2 top-[calc(100%+14px)] z-30 w-[min(720px,80vw)] -translate-x-1/2"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {surface(false)}
      </div>
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
  instruction,
  models,
  selectedModel,
  loadingModels,
  generating,
  mode,
  referenceCount,
  disabledReason,
  error,
  onInstructionChange,
  onModelChange,
  onKeyDown,
  onSubmit,
  onExpand,
}: {
  large: boolean;
  instruction: string;
  models: ModelInfo[];
  selectedModel: string;
  loadingModels: boolean;
  generating: boolean;
  mode: "generate" | "revise";
  referenceCount: number;
  disabledReason: string;
  error: string | null;
  onInstructionChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onExpand: () => void;
}) {
  const { t } = useI18n();
  return (
    <section
      className={
        "flex flex-col overflow-hidden rounded-2xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-hover)] " +
        (large ? "h-[min(68vh,680px)]" : "h-56")
      }
      aria-label={t.pipeline.textAiTitle}
    >
      <div className="flex min-h-0 flex-1">
        <textarea
          autoFocus={large}
          value={instruction}
          disabled={generating}
          onChange={(event) => onInstructionChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={mode === "revise" ? t.pipeline.textAiRevisePlaceholder : t.pipeline.textAiGeneratePlaceholder}
          aria-label={mode === "revise" ? t.pipeline.textAiRevise : t.pipeline.textAiGenerate}
          className="nodrag nowheel min-h-0 flex-1 resize-none border-0 bg-transparent p-5 text-sm leading-6 text-[var(--pl-text)] outline-none placeholder:text-[var(--pl-text-muted)] disabled:opacity-60"
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
      </div>

      {error ? <div role="alert" className="border-t border-red-400/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{error}</div> : null}

      <footer className="flex h-14 shrink-0 items-center gap-3 border-t border-[var(--pl-border)] px-3">
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
      </footer>
    </section>
  );
}

function modelValue(model: ModelInfo | undefined) {
  return model ? `${model.provider}:${model.id}` : "";
}
