"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CanvasMediaType,
  CanvasPromptDocument,
  CanvasResourceReferenceAttrs,
  CanvasResourceRole,
  PipelineAsset,
} from "@/contracts/pipeline";
import { AtSign, FileImage, FileMusic, FileText, FileVideo } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { promptDocumentFromJson } from "../model/prompt-document";
import { useCanvasStore } from "../state/canvas-store";

export interface PromptResourceOption {
  sourceType: "canvas-node" | "asset";
  sourceId: string;
  mediaType: CanvasMediaType;
  label: string;
  available: boolean;
}

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
  onSubmit: () => void;
}) {
  const { t } = useI18n();
  const projectId = useCanvasStore((state) => state.projectId);
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const [assets, setAssets] = useState<PipelineAsset[]>([]);
  const [mention, setMention] = useState<{ from: number; to: number; query: string } | null>(null);
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

  function updateMention(currentEditor: NonNullable<typeof editor>) {
    const { selection } = currentEditor.state;
    if (!selection.empty) return setMention(null);
    const { $from } = selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
    const match = /@([^@\s]*)$/.exec(before);
    if (!match) return setMention(null);
    setMention({ from: selection.from - match[0].length, to: selection.from, query: match[1] ?? "" });
    setActiveIndex(0);
  }

  function insertResource(option: PromptResourceOption | undefined, role: CanvasResourceRole = "reference") {
    if (!editor || !mention || !option?.available) return;
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
  }
  useEffect(() => {
    mentionRef.current = mention;
    submitRef.current = onSubmit;
    optionsRef.current = filteredOptions;
    activeIndexRef.current = activeIndex;
    insertResourceRef.current = insertResource;
  });

  return (
    <div className="pipeline-prompt-editor relative min-h-0 flex-1 overflow-auto" onPointerDown={(event) => event.stopPropagation()}>
      <EditorContent editor={editor} className="min-h-full" />
      {mention ? (
        <div className="absolute left-4 top-12 z-50 w-80 overflow-hidden rounded-xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] shadow-xl">
          <div className="flex items-center gap-2 border-b border-[var(--pl-border)] px-3 py-2 text-[11px] text-[var(--pl-text-muted)]">
            <AtSign className="size-3.5" />
            {t.pipeline.promptReferencePicker}
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {filteredOptions.length ? filteredOptions.map((option, index) => (
              <button
                key={`${option.sourceType}:${option.sourceId}`}
                type="button"
                disabled={!option.available}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertResource(option)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs ${index === activeIndex ? "bg-[var(--pl-surface-hover)]" : "hover:bg-[var(--pl-surface-hover)]"} disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <ResourceIcon mediaType={option.mediaType} />
                <span className="min-w-0 flex-1 truncate text-[var(--pl-text)]">{option.label}</span>
                <span className="text-[10px] text-[var(--pl-text-muted)]">{option.sourceType === "asset" ? t.pipeline.promptResourceAsset : t.pipeline.promptResourceCanvas}</span>
              </button>
            )) : (
              <div className="px-3 py-6 text-center text-xs text-[var(--pl-text-muted)]">{t.pipeline.promptReferenceEmpty}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResourceIcon({ mediaType }: { mediaType: CanvasMediaType }) {
  const Icon = mediaType === "text" ? FileText : mediaType === "image" ? FileImage : mediaType === "video" ? FileVideo : FileMusic;
  return <Icon className="size-4 shrink-0 text-[var(--pl-text-secondary)]" />;
}
