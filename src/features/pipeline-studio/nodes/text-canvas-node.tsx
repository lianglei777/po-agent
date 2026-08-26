"use client";

import { useCallback } from "react";
import { Position, useReactFlow } from "@xyflow/react";
import type { CanvasNode } from "@/contracts/pipeline";
import { FileText } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { calculateTextEditingViewport } from "../model/text-editing-viewport";
import { textDocumentFromData } from "../model/text-document";
import { useCanvasStore } from "../state/canvas-store";
import { RichTextPreview } from "./rich-text-preview";
import { TextNodeEditor } from "./text-node-editor";
import { TextAiComposer } from "./text-ai-composer";
import { CanvasNodeConnectionHandle } from "./shared/canvas-node-connection-handle";
import { CanvasNodeResizeControl } from "./shared/canvas-node-resize-control";
import { CanvasNodeTitle } from "./shared/canvas-node-title";

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
  const applyServerNodeData = useCanvasStore((state) => state.applyServerNodeData);
  const composerActive = useCanvasStore((state) => state.activeComposerNodeId === id);
  const waitingForSave = useCanvasStore((state) => state.pendingMutations.some((mutation) => (
    mutation.type === "node.create" ? mutation.node.id === id :
      mutation.type === "node.update" && mutation.nodeId === id && mutation.patch.data !== undefined
  )));
  const editing = editingNodeId === id;
  const canvas = node.data;
  const textDocument = canvas ? textDocumentFromData(canvas) : null;

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
      <CanvasNodeResizeControl
        nodeId={id}
        minWidth={300}
        minHeight={220}
        maxWidth={1600}
        maxHeight={1200}
      />

      <CanvasNodeConnectionHandle
        type="target"
        position={Position.Left}
        label={t.pipeline.nodeTextInputHandle}
        hideWhenEditing
      />
      <CanvasNodeConnectionHandle
        type="source"
        position={Position.Right}
        label={t.pipeline.nodeTextOutputHandle}
        hideWhenEditing
      />

      <CanvasNodeTitle
        icon={<FileText className="size-4" />}
        name={canvas.name}
        ariaLabel={t.pipeline.nodeNameAria.replace("{type}", t.pipeline.nodeText)}
        onRename={(name) => updateNodeData(id, { ...canvas, name })}
      />

      <section
        className={
          "nowheel relative h-[calc(100%-36px)] rounded-xl border bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-card)] transition-[border-color,box-shadow] duration-200 " +
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

      {composerActive && !dragging && !textDocument?.plainText.trim() ? (
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
