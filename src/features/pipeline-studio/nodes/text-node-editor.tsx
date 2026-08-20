"use client";

import { useEffect, type ComponentType } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { NodeToolbar, Position } from "@xyflow/react";
import type { CanvasRichTextNode, CanvasTextDocument } from "@/contracts/pipeline";
import {
  Bold,
  Italic,
  OrderedList,
  RotateCcw,
  RotateCw,
  Underline,
  UnorderedList,
} from "@/components/icons";
import { createTextDocument } from "../model/text-document";

interface ToolbarLabels {
  bold: string;
  italic: string;
  underline: string;
  heading1: string;
  heading2: string;
  heading3: string;
  bulletList: string;
  orderedList: string;
  undo: string;
  redo: string;
}

export function TextNodeEditor({
  document,
  placeholder,
  ariaLabel,
  labels,
  onChange,
  onExit,
}: {
  document: CanvasTextDocument;
  placeholder: string;
  ariaLabel: string;
  labels: ToolbarLabels;
  onChange: (document: CanvasTextDocument) => void;
  onExit: () => void;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        code: false,
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
        link: false,
        strike: false,
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: document.content as JSONContent,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class: "pipeline-rich-text-content",
      },
      handleKeyDown: (_, event) => {
        if (event.key !== "Escape") return false;
        event.preventDefault();
        event.stopPropagation();
        onExit();
        return true;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(createTextDocument(
        currentEditor.getJSON() as CanvasRichTextNode,
        currentEditor.getText({ blockSeparator: "\n" }),
      ));
    },
    onBlur: ({ event }) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof HTMLElement && nextTarget.closest("[data-text-toolbar]")) return;
      onExit();
    },
  });

  useEffect(() => {
    if (!editor) return;
    const frame = window.requestAnimationFrame(() => editor.commands.focus("end"));
    return () => window.cancelAnimationFrame(frame);
  }, [editor]);

  if (!editor) return null;

  return (
    <>
      <TextEditorToolbar editor={editor} labels={labels} ariaLabel={ariaLabel} />
      <EditorContent editor={editor} className="pipeline-rich-text-editor nodrag nowheel h-full" />
    </>
  );
}

function TextEditorToolbar({
  editor,
  labels,
  ariaLabel,
}: {
  editor: Editor;
  labels: ToolbarLabels;
  ariaLabel: string;
}) {
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor.isActive("bold"),
      italic: currentEditor.isActive("italic"),
      underline: currentEditor.isActive("underline"),
      heading1: currentEditor.isActive("heading", { level: 1 }),
      heading2: currentEditor.isActive("heading", { level: 2 }),
      heading3: currentEditor.isActive("heading", { level: 3 }),
      bulletList: currentEditor.isActive("bulletList"),
      orderedList: currentEditor.isActive("orderedList"),
      canUndo: currentEditor.can().chain().undo().run(),
      canRedo: currentEditor.can().chain().redo().run(),
    }),
  });

  return (
    <NodeToolbar
      isVisible
      position={Position.Top}
      offset={12}
      className="nodrag nowheel z-20 flex max-w-[calc(100vw-32px)] items-center gap-1 overflow-x-auto rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-1.5 shadow-[var(--pl-shadow-hover)]"
      role="toolbar"
      aria-label={ariaLabel}
      data-text-toolbar
      onMouseDown={(event) => event.preventDefault()}
    >
      <ToolbarButton label={labels.bold} active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} icon={Bold} />
      <ToolbarButton label={labels.italic} active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} icon={Italic} />
      <ToolbarButton label={labels.underline} active={state.underline} onClick={() => editor.chain().focus().toggleUnderline().run()} icon={Underline} />
      <ToolbarDivider />
      <ToolbarButton label={labels.heading1} text="H1" active={state.heading1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} />
      <ToolbarButton label={labels.heading2} text="H2" active={state.heading2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton label={labels.heading3} text="H3" active={state.heading3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
      <ToolbarDivider />
      <ToolbarButton label={labels.bulletList} active={state.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} icon={UnorderedList} />
      <ToolbarButton label={labels.orderedList} active={state.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} icon={OrderedList} />
      <ToolbarDivider />
      <ToolbarButton label={labels.undo} disabled={!state.canUndo} onClick={() => editor.chain().focus().undo().run()} icon={RotateCcw} />
      <ToolbarButton label={labels.redo} disabled={!state.canRedo} onClick={() => editor.chain().focus().redo().run()} icon={RotateCw} />
    </NodeToolbar>
  );
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  icon: Icon,
  text,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon?: ComponentType<{ className?: string }>;
  text?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={
        "flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-30 " +
        (active
          ? "bg-[var(--pl-accent)] text-white"
          : "text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]")
      }
    >
      {Icon ? <Icon className="size-4" /> : text}
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--pl-border)]" aria-hidden="true" />;
}
