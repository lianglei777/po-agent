"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Handle, NodeResizeControl, Position, useReactFlow } from "@xyflow/react";
import type { CanvasNode } from "@/contracts/pipeline";
import { FileText, Plus } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { calculateTextEditingViewport } from "../model/text-editing-viewport";
import { textDocumentFromData } from "../model/text-document";
import { useCanvasStore } from "../state/canvas-store";
import { RichTextPreview } from "./rich-text-preview";
import { TextNodeEditor } from "./text-node-editor";
import { TextAiComposer } from "./text-ai-composer";

export function TextCanvasNode({
  id,
  node,
  selected,
  dragging,
}: {
  id: string;
  node: CanvasNode;
  selected: boolean;
  dragging: boolean;
}) {
  const { t } = useI18n();
  const { getViewport, setCenter } = useReactFlow();
  const editingNodeId = useCanvasStore((state) => state.editingNodeId);
  const startEditingNode = useCanvasStore((state) => state.startEditingNode);
  const stopEditingNode = useCanvasStore((state) => state.stopEditingNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const updateNodeSizeLive = useCanvasStore((state) => state.updateNodeSizeLive);
  const commitNodeSize = useCanvasStore((state) => state.commitNodeSize);
  const applyServerNodeData = useCanvasStore((state) => state.applyServerNodeData);
  const waitingForSave = useCanvasStore((state) => state.pendingMutations.some((mutation) => (
    mutation.type === "node.create" ? mutation.node.id === id :
      mutation.type === "node.update" && mutation.nodeId === id && mutation.patch.data !== undefined
  )));
  const editing = editingNodeId === id;
  const canvas = node.data;
  const textDocument = canvas ? textDocumentFromData(canvas) : null;
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(canvas?.name ?? "");
  const cancelTitleRef = useRef(false);
  const resizeOriginRef = useRef<{ width: number; height: number } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const latestResizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => () => {
    if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
  }, []);

  const focusNode = useCallback(() => {
    const width = node.width ?? 360;
    const height = node.height ?? 300;
    const { zoom, centerOffsetY } = calculateTextEditingViewport({
      currentZoom: getViewport().zoom,
      nodeWidth: width,
      nodeHeight: height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    const visualCenterY = node.positionY + height / 2 + centerOffsetY;
    void setCenter(node.positionX + width / 2, visualCenterY, {
      zoom,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    });
  }, [getViewport, node.height, node.positionX, node.positionY, node.width, setCenter]);

  if (!canvas) return null;

  const beginEditing = () => {
    startEditingNode(id);
    focusNode();
  };

  const commitTitle = () => {
    if (cancelTitleRef.current) {
      cancelTitleRef.current = false;
      setTitleDraft(canvas.name);
      setRenamingTitle(false);
      return;
    }
    const nextTitle = titleDraft.trim();
    if (nextTitle && nextTitle !== canvas.name) updateNodeData(id, { ...canvas, name: nextTitle });
    setTitleDraft(nextTitle || canvas.name);
    setRenamingTitle(false);
  };

  const updateResizePreview = (size: { width: number; height: number }) => {
    latestResizeRef.current = size;
    if (resizeFrameRef.current !== null) return;
    // React Flow 会高频触发 resize；每个动画帧最多同步一次受控节点尺寸。
    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const latest = latestResizeRef.current;
      if (latest) updateNodeSizeLive(id, latest);
    });
  };

  return (
    <article
      className={
        "group relative h-full min-h-[220px] w-full min-w-[300px] overflow-visible " +
        (editing ? "cursor-text" : dragging ? "cursor-grabbing" : "cursor-grab")
      }
      data-selected={selected}
      data-editing={editing}
      data-dragging={dragging}
      aria-label={canvas.name}
    >
      <NodeResizeControl
        position="bottom-right"
        minWidth={300}
        minHeight={220}
        maxWidth={1600}
        maxHeight={1200}
        className="nodrag group/resize !-bottom-1.5 !-right-1.5 !flex !size-8 !cursor-nwse-resize !items-center !justify-center !border-0 !bg-transparent"
        onResizeStart={(_, params) => {
          resizeOriginRef.current = { width: params.width, height: params.height };
        }}
        onResize={(_, params) => updateResizePreview({ width: params.width, height: params.height })}
        onResizeEnd={(_, params) => {
          if (resizeFrameRef.current !== null) {
            cancelAnimationFrame(resizeFrameRef.current);
            resizeFrameRef.current = null;
          }
          const finalSize = { width: params.width, height: params.height };
          latestResizeRef.current = finalSize;
          updateNodeSizeLive(id, finalSize);
          const previous = resizeOriginRef.current;
          if (previous) commitNodeSize(id, previous);
          resizeOriginRef.current = null;
        }}
      >
        <span
          aria-hidden="true"
          className="size-4 rounded-br-[10px] border-b-2 border-r-2 border-[var(--pl-text-secondary)] opacity-0 transition-[opacity,border-color] duration-150 group-hover/resize:opacity-100 group-hover/resize:border-[var(--pl-text)]"
        />
      </NodeResizeControl>

      <TextConnectionHandle
        type="target"
        position={Position.Left}
        label={t.pipeline.nodeTextInputHandle}
        style={{ left: -40 }}
      />
      <TextConnectionHandle
        type="source"
        position={Position.Right}
        label={t.pipeline.nodeTextOutputHandle}
        style={{ right: -40 }}
      />

      <header className="flex h-9 items-center gap-2 px-2 text-[var(--pl-text-secondary)]">
        <FileText className="size-4 shrink-0 text-[var(--pl-text-muted)]" />
        {renamingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            maxLength={200}
            aria-label={t.pipeline.nodeNameAria.replace("{type}", t.pipeline.nodeText)}
            className="nodrag min-w-0 flex-1 rounded-md border border-[var(--pl-accent)] bg-[var(--pl-surface-elevated)] px-2 py-0.5 text-sm font-medium text-[var(--pl-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]/30"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setTitleDraft(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancelTitleRef.current = true;
                event.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span
            className="nodrag min-w-0 cursor-text truncate rounded px-1 text-sm font-medium text-[var(--pl-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
            title={canvas.name}
            tabIndex={0}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              cancelTitleRef.current = false;
              setTitleDraft(canvas.name);
              setRenamingTitle(true);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              cancelTitleRef.current = false;
              setTitleDraft(canvas.name);
              setRenamingTitle(true);
            }}
          >
            {canvas.name}
          </span>
        )}
      </header>

      <section
        className={
          "nowheel relative h-[calc(100%-36px)] rounded-[20px] border bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-card)] transition-[border-color,box-shadow] duration-200 " +
          (editing ? "overflow-visible " : "overflow-hidden ") +
          (selected || editing || dragging
            ? "border-[var(--pl-border-strong)] shadow-[var(--pl-shadow-hover)]"
            : "border-transparent group-hover:border-[var(--pl-border)]")
        }
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!editing) beginEditing();
        }}
      >
        {editing && textDocument ? (
          <TextNodeEditor
            document={textDocument}
            placeholder={t.pipeline.nodeTextPlaceholder}
            ariaLabel={t.pipeline.nodeTextEditorAria}
            labels={{
              bold: t.pipeline.richTextBold,
              italic: t.pipeline.richTextItalic,
              underline: t.pipeline.richTextUnderline,
              heading1: t.pipeline.richTextHeading1,
              heading2: t.pipeline.richTextHeading2,
              heading3: t.pipeline.richTextHeading3,
              bulletList: t.pipeline.richTextBulletList,
              orderedList: t.pipeline.richTextOrderedList,
              undo: t.pipeline.richTextUndo,
              redo: t.pipeline.richTextRedo,
            }}
            onChange={(nextDocument) => updateNodeData(id, {
              ...canvas,
              content: [nextDocument.plainText],
              textDocument: nextDocument,
            })}
            onExit={() => stopEditingNode(id)}
          />
        ) : textDocument ? (
          <div className="h-full overflow-y-auto p-5 text-sm leading-6 text-[var(--pl-text-secondary)]">
            <RichTextPreview document={textDocument} emptyHint={t.pipeline.nodeTextEmptyHint} />
          </div>
        ) : null}
      </section>

      {selected && !dragging && !textDocument?.plainText.trim() ? (
        <TextAiComposer
          key={id}
          nodeId={id}
          data={canvas}
          waitingForSave={waitingForSave}
          onGenerated={(serverNode) => {
            if (serverNode.data) applyServerNodeData(id, serverNode.data, serverNode.updatedAt);
          }}
        />
      ) : null}
    </article>
  );
}

function TextConnectionHandle({
  type,
  position,
  label,
  style,
}: {
  type: "source" | "target";
  position: Position;
  label: string;
  style: { left?: number; right?: number };
}) {
  return (
    <Handle
      type={type}
      position={position}
      aria-label={label}
      title={label}
      style={style}
      className="nodrag !flex !size-8 !items-center !justify-center !border !border-[var(--pl-border-strong)] !bg-[var(--pl-surface-elevated)] !text-[var(--pl-text-secondary)] !opacity-0 !shadow-[var(--pl-shadow-card)] transition-[opacity,border-color,color] duration-150 hover:!border-[var(--pl-accent)] hover:!text-[var(--pl-accent)] group-hover:!opacity-100 group-data-[selected=true]:!opacity-100 group-data-[editing=true]:!opacity-0"
    >
      <Plus className="pointer-events-none size-3.5" />
    </Handle>
  );
}
