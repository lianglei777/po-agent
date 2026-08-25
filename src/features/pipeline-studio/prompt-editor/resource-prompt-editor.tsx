"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { createPortal } from "react-dom";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  CanvasMediaType,
  CanvasPromptDocument,
  CanvasResourceReferenceAttrs,
  CanvasResourceRole,
  CanvasResourceSourceType,
  PipelineAsset,
} from "@/contracts/pipeline";
import { AtSign, X } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { resourcePickerPosition, type CursorRect } from "../model/floating-panel";
import { connectedCanvasReferences } from "../model/canvas-connection-policy";
import { promptDocumentFromJson, promptDocumentResourceAttrs, removePromptResourceReferences } from "../model/prompt-document";
import {
  promptResourceBindings,
  resolvePromptResourcePreview,
} from "../model/prompt-resource-preview";
import { useCanvasStore } from "../state/canvas-store";
import { ResourcePreviewPopover, ResourcePreviewThumbnail } from "../components/resource-preview-thumbnail";

export interface PromptResourceOption {
  sourceType: "canvas-node" | "asset";
  sourceId: string;
  mediaType: CanvasMediaType;
  label: string;
  available: boolean;
}

const PromptResourceAssetsContext = createContext<PipelineAsset[]>([]);

const ResourceReference = Node.create({
  name: "resourceReference",
  inline: true,
  group: "inline",
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      referenceId: { default: "" },
      sourceType: { default: "canvas-node" },
      sourceId: { default: "" },
      mediaType: { default: "image" },
      label: { default: "" },
      role: { default: "reference" },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-resource-reference]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, {
      "data-resource-reference": "",
      class: "mx-0.5 inline-flex rounded-md bg-[var(--pl-accent-soft)] px-1.5 py-0.5 font-medium text-[var(--pl-accent)]",
    }), `@${String(node.attrs.label)}`];
  },
  renderText({ node }) {
    return `@${String(node.attrs.label)}`;
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResourceReferenceView);
  },
});

export function ResourcePromptEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
  autoFocus = false,
  allowedMediaTypes,
  excludedCanvasNodeId,
  connectedTargetNodeId,
  defaultResourceRole = "reference",
  onResourceInserted,
  onReferenceStateChange,
  onSubmit,
}: {
  value: CanvasPromptDocument;
  onChange: (document: CanvasPromptDocument) => void;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  autoFocus?: boolean;
  allowedMediaTypes: CanvasMediaType[];
  excludedCanvasNodeId?: string;
  connectedTargetNodeId?: string;
  defaultResourceRole?: CanvasResourceRole;
  onResourceInserted?: () => void;
  onReferenceStateChange?: (state: { invalidCount: number; unsupportedCount: number }) => void;
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  const projectId = useCanvasStore((state) => state.projectId);
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const canvasEdges = useCanvasStore((state) => state.edges);
  const deleteEdges = useCanvasStore((state) => state.deleteEdges);
  const [assets, setAssets] = useState<PipelineAsset[]>([]);
  const [mention, setMention] = useState<{ from: number; to: number; query: string; cursor: CursorRect } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const mentionRef = useRef(mention);
  const optionsRef = useRef<PromptResourceOption[]>([]);
  const activeIndexRef = useRef(activeIndex);
  const submitRef = useRef(onSubmit);
  const insertResourceRef = useRef<(option: PromptResourceOption | undefined) => void>(() => undefined);

  useEffect(() => {
    const controller = new AbortController();
    pipelineStudioApi.getAssets(projectId, controller.signal)
      .then((response) => setAssets(response.assets))
      .catch(() => undefined);
    return () => controller.abort();
  }, [projectId]);

  const options = useMemo<PromptResourceOption[]>(() => [
    ...canvasNodes.flatMap((node) => node.id !== excludedCanvasNodeId && node.data && allowedMediaTypes.includes(node.data.type)
      ? [{
          sourceType: "canvas-node" as const,
          sourceId: node.id,
          mediaType: node.data.type,
          label: node.data.name,
          available: node.data.type === "text"
            ? Boolean(node.data.textDocument?.plainText.trim() || node.data.content?.some((item) => item.trim()))
            : Boolean(node.data.artifactIds?.length || node.data.workspaceFile),
        }]
      : []),
    ...assets.flatMap((asset) => allowedMediaTypes.includes("image")
      ? [{ sourceType: "asset" as const, sourceId: asset.id, mediaType: "image" as const, label: asset.name, available: Boolean(asset.selectedArtifactId) }]
      : []),
  ], [allowedMediaTypes, assets, canvasNodes, excludedCanvasNodeId]);

  const filteredOptions = useMemo(() => {
    const query = mention?.query.trim().toLocaleLowerCase() ?? "";
    return options
      .filter((option) => !query || option.label.toLocaleLowerCase().includes(query))
      .sort((left, right) => Number(right.available) - Number(left.available))
      .slice(0, 12);
  }, [mention?.query, options]);
  const connectedReferences = useMemo(() => connectedTargetNodeId
    ? connectedCanvasReferences(connectedTargetNodeId, canvasNodes, canvasEdges)
    : [], [canvasEdges, canvasNodes, connectedTargetNodeId]);
  const promptReferences = useMemo(() => promptDocumentResourceAttrs(value), [value]);
  const referencedResources = useMemo(() => promptResourceBindings(
    connectedTargetNodeId,
    canvasNodes,
    canvasEdges,
    promptReferences,
  ).map((binding) => ({
    binding,
    preview: resolvePromptResourcePreview(binding.reference, canvasNodes, assets),
  })), [assets, canvasEdges, canvasNodes, connectedTargetNodeId, promptReferences]);
  const allReferences = useMemo(() => [
    ...connectedReferences,
    ...promptReferences,
  ], [connectedReferences, promptReferences]);
  const invalidReferenceCount = useMemo(() => allReferences.filter((reference) => (
    !resolvePromptResourcePreview(reference, canvasNodes, assets).available
  )).length, [allReferences, assets, canvasNodes]);
  const unsupportedReferenceCount = useMemo(() => allReferences.filter((reference) => (
    !allowedMediaTypes.includes(reference.mediaType)
  )).length, [allReferences, allowedMediaTypes]);
  const pickerHeight = Math.min(258, 42 + Math.max(1, filteredOptions.length) * 36);
  const pickerPosition = mention && typeof window !== "undefined"
    ? resourcePickerPosition({
        cursor: mention.cursor,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        panelWidth: 288,
        panelHeight: pickerHeight,
      })
    : null;
  const portalTarget = typeof document !== "undefined"
    ? document.querySelector<HTMLElement>(".pipeline-studio-shell") ?? document.body
    : null;
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        listItem: false,
        orderedList: false,
        strike: false,
      }),
      Placeholder.configure({ placeholder }),
      ResourceReference,
    ],
    content: value.content,
    editable: !disabled,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": ariaLabel,
        class: "pipeline-prompt-content min-h-full px-5 py-4 text-sm leading-6 text-[var(--pl-text)] outline-none [&_p]:m-0",
      },
      handleKeyDown: (_view, event) => {
        if (event.isComposing || event.keyCode === 229) return false;
        const currentMention = mentionRef.current;
        if (currentMention && optionsRef.current.length) {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => {
              const direction = event.key === "ArrowDown" ? 1 : -1;
              return (current + direction + optionsRef.current.length) % optionsRef.current.length;
            });
            return true;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            insertResourceRef.current(optionsRef.current[activeIndexRef.current] ?? optionsRef.current[0]);
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setMention(null);
            return true;
          }
        }
        if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(promptDocumentFromJson(currentEditor.getJSON() as CanvasPromptDocument["content"]));
      updateMention(currentEditor);
    },
    onSelectionUpdate: ({ editor: currentEditor }) => updateMention(currentEditor),
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || JSON.stringify(editor.getJSON()) === JSON.stringify(value.content)) return;
    editor.commands.setContent(value.content);
  }, [editor, value.content]);

  useEffect(() => {
    if (autoFocus) editor?.commands.focus("end");
  }, [autoFocus, editor]);

  useEffect(() => {
    onReferenceStateChange?.({
      invalidCount: invalidReferenceCount,
      unsupportedCount: unsupportedReferenceCount,
    });
  }, [invalidReferenceCount, onReferenceStateChange, unsupportedReferenceCount]);

  function updateMention(currentEditor: NonNullable<typeof editor>) {
    const { selection } = currentEditor.state;
    if (!selection.empty) return setMention(null);
    const { $from } = selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
    const match = /@([^@\s]*)$/.exec(before);
    if (!match) return setMention(null);
    const cursor = currentEditor.view.coordsAtPos(selection.from);
    setMention({
      from: selection.from - match[0].length,
      to: selection.from,
      query: match[1] ?? "",
      cursor: { left: cursor.left, top: cursor.top, bottom: cursor.bottom },
    });
    setActiveIndex(0);
  }

  function insertResource(option: PromptResourceOption | undefined) {
    if (!editor || !mention || !option) return;
    const role = option.mediaType === "image" ? defaultResourceRole : "reference";
    const attrs: CanvasResourceReferenceAttrs = {
      referenceId: crypto.randomUUID(),
      sourceType: option.sourceType,
      sourceId: option.sourceId,
      mediaType: option.mediaType,
      label: option.label,
      role,
    };
    editor.chain().focus().deleteRange({ from: mention.from, to: mention.to }).insertContent([
      { type: "resourceReference", attrs },
      { type: "text", text: " " },
    ]).run();
    setMention(null);
    onResourceInserted?.();
  }

  function removeResource(sourceType: CanvasResourceSourceType, sourceId: string, edgeIds: string[]) {
    if (disabled) return;
    let removedFromEditor = false;
    if (editor) {
      const ranges: Array<{ from: number; to: number }> = [];
      editor.state.doc.descendants((node, position) => {
        if (node.type.name !== "resourceReference") return;
        if (node.attrs.sourceType === sourceType && node.attrs.sourceId === sourceId) {
          ranges.push({ from: position, to: position + node.nodeSize });
        }
      });
      if (ranges.length) {
        // 从后向前删除，避免前面的 transaction 改变后续引用位置。
        const transaction = editor.state.tr;
        for (const range of ranges.reverse()) transaction.delete(range.from, range.to);
        editor.view.dispatch(transaction);
        removedFromEditor = true;
      }
    }
    if (!removedFromEditor && promptReferences.some((reference) => (
      reference.sourceType === sourceType && reference.sourceId === sourceId
    ))) {
      onChange(removePromptResourceReferences(value, sourceType, sourceId));
    }
    if (edgeIds.length) deleteEdges(edgeIds);
  }
  useEffect(() => {
    mentionRef.current = mention;
    submitRef.current = onSubmit;
    optionsRef.current = filteredOptions;
    activeIndexRef.current = activeIndex;
    insertResourceRef.current = insertResource;
  });

  return (
    <PromptResourceAssetsContext.Provider value={assets}>
    <div className="pipeline-prompt-editor relative flex min-h-0 flex-1 flex-col overflow-hidden" onPointerDown={(event) => event.stopPropagation()}>
      {referencedResources.length ? (
        <div
          role="list"
          aria-label={t.pipeline.promptReferencesPreview}
          className="flex min-h-16 shrink-0 items-center gap-2 overflow-x-auto px-5 py-2"
        >
          {referencedResources.map(({ binding, preview }, index) => {
            const removeLabel = binding.edgeIds.length && binding.promptReferenceIds.length
              ? t.pipeline.promptResourceRemoveAll.replace("{label}", preview.reference.label)
              : binding.edgeIds.length
                ? t.pipeline.promptResourceRemoveConnection.replace("{label}", preview.reference.label)
                : t.pipeline.promptResourceRemoveMentions.replace("{label}", preview.reference.label);
            return (
            <span
              key={binding.key}
              role="listitem"
              title={preview.available ? preview.reference.label : t.pipeline.promptReferenceUnavailable}
              className={`relative shrink-0 ${preview.available ? "" : "opacity-50"}`}
            >
              {preview.reference.mediaType === "image" || preview.reference.mediaType === "video" ? (
                <ResourcePreviewPopover
                  mediaType={preview.reference.mediaType}
                  label={preview.reference.label}
                  url={preview.available ? preview.url : null}
                  poster={preview.poster}
                  detail={`${index + 1} · ${resourceRoleLabel(preview.reference.role, t.pipeline)}`}
                  ariaLabel={t.pipeline.promptReferencePreview.replace("{label}", preview.reference.label)}
                >
                  <ResourcePreviewThumbnail
                    mediaType={preview.reference.mediaType}
                    label={preview.reference.label}
                    url={preview.url}
                    poster={preview.poster}
                    size="strip"
                    badge={index + 1}
                    accessible
                    fit="cover"
                  />
                </ResourcePreviewPopover>
              ) : (
                <ResourcePreviewThumbnail
                  mediaType={preview.reference.mediaType}
                  label={preview.reference.label}
                  url={preview.url}
                  poster={preview.poster}
                  size="strip"
                  badge={index + 1}
                  accessible
                  fit="cover"
                />
              )}
              <button
                type="button"
                disabled={disabled}
                title={disabled ? t.pipeline.promptResourceRemoveBusy : removeLabel}
                aria-label={removeLabel}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  removeResource(binding.reference.sourceType, binding.reference.sourceId, binding.edgeIds);
                }}
                className="absolute -right-1 -top-1 z-10 flex size-5 items-center justify-center rounded-full border border-white/35 bg-black/80 text-white shadow-sm transition-colors duration-150 hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <X className="size-3" />
              </button>
            </span>
            );
          })}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="min-h-full" />
      </div>
      {mention && pickerPosition && portalTarget ? createPortal((
        <div
          className="fixed z-[var(--pl-z-resource-picker)] w-72 overflow-hidden rounded-xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-hover)]"
          data-placement={pickerPosition.placement}
          style={{ left: pickerPosition.left, top: pickerPosition.top }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex h-9 items-center gap-2 border-b border-[var(--pl-border)] px-3 text-[11px] text-[var(--pl-text-muted)]">
            <AtSign className="size-3.5" />
            {t.pipeline.promptReferencePicker}
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filteredOptions.length ? filteredOptions.map((option, index) => {
              const preview = resolvePromptResourcePreview({
                referenceId: `${option.sourceType}:${option.sourceId}`,
                sourceType: option.sourceType,
                sourceId: option.sourceId,
                mediaType: option.mediaType,
                label: option.label,
                role: "reference",
              }, canvasNodes, assets);
              return (
                <button
                  key={`${option.sourceType}:${option.sourceId}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertResource(option)}
                  className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-xs ${index === activeIndex ? "bg-[var(--pl-surface-hover)]" : "hover:bg-[var(--pl-surface-hover)]"} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  <ResourcePreviewThumbnail
                    mediaType={option.mediaType}
                    label={option.label}
                    url={preview.url}
                    poster={preview.poster}
                    size="inline"
                  />
                  <span className="min-w-0 flex-1 truncate text-[var(--pl-text)]">{option.label}</span>
                  <span className="text-[10px] text-[var(--pl-text-muted)]">{option.sourceType === "asset" ? t.pipeline.promptResourceAsset : t.pipeline.promptResourceCanvas}</span>
                </button>
              );
            }) : (
              <div className="px-3 py-5 text-center text-xs text-[var(--pl-text-muted)]">{t.pipeline.promptReferenceEmpty}</div>
            )}
          </div>
        </div>
      ), portalTarget) : null}
    </div>
    </PromptResourceAssetsContext.Provider>
  );
}

function ResourceReferenceView({ node }: ReactNodeViewProps) {
  const { t } = useI18n();
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const assets = useContext(PromptResourceAssetsContext);
  const reference = node.attrs as CanvasResourceReferenceAttrs;
  const preview = resolvePromptResourcePreview(reference, canvasNodes, assets);

  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      title={preview.available ? reference.label : t.pipeline.promptReferenceUnavailable}
      data-invalid={!preview.available || undefined}
      className={`mx-0.5 inline-flex items-center gap-1 rounded-md py-0.5 pl-0.5 pr-1.5 align-middle font-medium ${preview.available
        ? "bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]"
        : "bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-400/30"}`}
      data-resource-reference=""
    >
      <ResourcePreviewThumbnail
        mediaType={reference.mediaType}
        label={reference.label}
        url={preview.url}
        poster={preview.poster}
        size="inline"
      />
      <span>@{reference.label}</span>
    </NodeViewWrapper>
  );
}

function resourceRoleLabel(
  role: CanvasResourceRole,
  pipeline: ReturnType<typeof useI18n>["t"]["pipeline"],
) {
  if (role === "first-frame") return pipeline.promptReferenceRoleFirstFrame;
  if (role === "last-frame") return pipeline.promptReferenceRoleLastFrame;
  return pipeline.promptReferenceRoleReference;
}
