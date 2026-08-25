"use client";

import NextImage from "next/image";
import { memo, useCallback, useRef, useState } from "react";
import { App, Button, Modal, Spin } from "antd";
import { Position, useReactFlow } from "@xyflow/react";
import type { CanvasNode } from "@/contracts/pipeline";
import { Copy, Download, Eye, ImagePlus, Images, Pencil, RefreshCw, Sparkles, Trash2 } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { calculateImageFocusViewport } from "../model/image-focus-viewport";
import { findDerivedImagePosition } from "../model/image-derived-position";
import { exportTransformedImage } from "../model/image-edit-export";
import {
  EMPTY_IMAGE_EDIT_TRANSFORM,
  flipImagePreview,
  imagePreviewChanged,
  imagePreviewTransformCss,
  rotateImagePreview,
  type ImageEditTransform,
} from "../model/image-edit-transform";
import { calculateImageNodeSize, IMAGE_NODE_SIZE_LIMITS } from "../model/image-node-geometry";
import { resolveCanvasMediaSource, shouldDeferCanvasMediaLoad } from "../model/canvas-media-source";
import { imageNodePresentation } from "../model/node-interaction";
import { useCanvasStore, useCanvasStoreApi } from "../state/canvas-store";
import { ImageAiComposer } from "./image-ai-composer";
import { ImageEditToolbar } from "./image-edit-toolbar";
import { CanvasNodeConnectionHandle } from "./shared/canvas-node-connection-handle";
import { CanvasNodeContextToolbar, CanvasNodeToolbarButton } from "./shared/canvas-node-context-toolbar";
import { CanvasNodeResizeControl } from "./shared/canvas-node-resize-control";
import { CanvasNodeTitle } from "./shared/canvas-node-title";

type ImageLoadState = "loading" | "ready" | "error";

export function ImageCanvasNode({
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
  const { message } = App.useApp();
  const { getViewport, setCenter } = useReactFlow();
  const store = useCanvasStoreApi();
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);
  const fitNodeSize = useCanvasStore((state) => state.fitNodeSize);
  const applyServerNodeData = useCanvasStore((state) => state.applyServerNodeData);
  const insertServerNode = useCanvasStore((state) => state.insertServerNode);
  const insertServerGenerationResult = useCanvasStore((state) => state.insertServerGenerationResult);
  const modifyComposerOpen = useCanvasStore((state) => state.imageComposerNodeId === id);
  const openImageComposer = useCanvasStore((state) => state.openImageComposer);
  const closeImageComposer = useCanvasStore((state) => state.closeImageComposer);
  const editing = useCanvasStore((state) => state.editingNodeId === id);
  const startEditingNode = useCanvasStore((state) => state.startEditingNode);
  const stopEditingNode = useCanvasStore((state) => state.stopEditingNode);
  const deleteNodes = useCanvasStore((state) => state.deleteNodes);
  const duplicateNodes = useCanvasStore((state) => state.duplicateNodes);
  const awaitingNodeCreation = useCanvasStore((state) => state.pendingMutations.some((mutation) => (
    mutation.type === "node.create" && mutation.node.id === id
  )));
  const waitingForSave = useCanvasStore((state) => state.pendingMutations.some((mutation) => (
    mutation.type === "node.create" ? mutation.node.id === id :
      mutation.type === "node.update" && mutation.nodeId === id && mutation.patch.data !== undefined
  )));
  const canvas = node.data;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editTransform, setEditTransform] = useState<ImageEditTransform>(EMPTY_IMAGE_EDIT_TRANSFORM);
  const [savingEdit, setSavingEdit] = useState(false);
  const [imageStatus, setImageStatus] = useState<{ url: string | null; state: ImageLoadState }>({
    url: null,
    state: "loading",
  });
  const [imageDimensions, setImageDimensions] = useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);

  const mediaSource = resolveCanvasMediaSource(id, canvas);
  const mediaUrl = mediaSource?.url ?? null;
  const deferMediaLoad = shouldDeferCanvasMediaLoad(mediaSource, awaitingNodeCreation);
  const hasImage = Boolean(mediaUrl);
  const imageState = imageStatus.url === mediaUrl ? imageStatus.state : "loading";
  const dimensions = imageDimensions?.url === mediaUrl ? imageDimensions : null;
  const presentation = imageNodePresentation({ selected, dragging, hasImage });
  const isGenerating = canvas?.taskInfo?.status === "queued" || canvas?.taskInfo?.status === "processing";
  const handleImageReady = useCallback((width: number, height: number) => {
    if (!mediaUrl) return;
    setImageStatus({ url: mediaUrl, state: "ready" });
    setImageDimensions({ url: mediaUrl, width, height });
    const currentWidth = store.getState().nodes.find((candidate) => candidate.id === id)?.width ?? 360;
    const targetSize = calculateImageNodeSize({
      naturalWidth: width,
      naturalHeight: height,
      currentWidth,
    });
    if (targetSize) fitNodeSize(id, targetSize);
  }, [fitNodeSize, id, mediaUrl, store]);
  const handleImageError = useCallback(() => {
    if (mediaUrl) setImageStatus({ url: mediaUrl, state: "error" });
  }, [mediaUrl]);

  const uploadImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      void message.error(t.pipeline.nodeImageOnlyError);
      return;
    }
    setUploading(true);
    try {
      const result = await pipelineStudioApi.uploadFile(
        node.projectId,
        file,
        node.positionX,
        node.positionY,
        id,
      );
      insertServerNode(result.node);
    } catch (error) {
      void message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  }, [id, insertServerNode, message, node.positionX, node.positionY, node.projectId, t.pipeline.nodeImageOnlyError]);

  if (!canvas || canvas.type !== "image") return null;

  const focusNode = () => {
    const width = node.width ?? 360;
    const height = node.height ?? 300;
    const zoom = calculateImageFocusViewport({
      currentZoom: getViewport().zoom,
      nodeWidth: width,
      nodeHeight: height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    });
    void setCenter(node.positionX + width / 2, node.positionY + height / 2, {
      zoom,
      duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220,
    });
  };

  const downloadImage = () => {
    if (!mediaUrl) return;
    const anchor = document.createElement("a");
    anchor.href = mediaUrl;
    anchor.download = canvas.workspaceFile?.name ?? `${canvas.name}.png`;
    anchor.click();
  };

  const beginEditing = () => {
    setEditTransform(EMPTY_IMAGE_EDIT_TRANSFORM);
    startEditingNode(id);
  };

  const cancelEditing = () => {
    if (savingEdit) return;
    setEditTransform(EMPTY_IMAGE_EDIT_TRANSFORM);
    stopEditingNode(id);
  };

  const saveEditing = async () => {
    if (!mediaUrl || savingEdit || !imagePreviewChanged(editTransform)) return;
    setSavingEdit(true);
    try {
      const file = await exportTransformedImage({
        sourceUrl: mediaUrl,
        sourceName: canvas.workspaceFile?.name ?? canvas.name,
        transform: editTransform,
      });
      const position = findDerivedImagePosition(node, store.getState().nodes);
      const uploaded = await pipelineStudioApi.uploadFile(node.projectId, file, position.x, position.y);
      try {
        const { edge } = await pipelineStudioApi.connectCanvasNodes(node.projectId, id, uploaded.node.id);
        const snapshot = await pipelineStudioApi.getSnapshot(node.projectId);
        const connectedNode = snapshot.nodes.find((candidate) => candidate.id === uploaded.node.id) ?? uploaded.node;
        insertServerGenerationResult(connectedNode, edge);
        setEditTransform(EMPTY_IMAGE_EDIT_TRANSFORM);
        void message.success(t.pipeline.nodeImageEditSaved);
      } catch (error) {
        // 图片已经写入项目目录时必须保留新节点，连线失败不能让用户误以为编辑结果也丢失了。
        insertServerNode(uploaded.node);
        throw error;
      }
    } catch {
      void message.error(t.pipeline.nodeImageEditSaveError);
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <article
      className={
        "group relative h-full min-h-[120px] w-full min-w-[120px] overflow-visible " +
        (editing ? "cursor-default" : dragging ? "cursor-grabbing" : "cursor-grab")
      }
      data-selected={selected}
      data-dragging={dragging}
      data-editing={editing}
      aria-label={canvas.name}
      onDragOver={(event) => {
        if (editing) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setDragActive(false);
      }}
      onDrop={(event) => {
        if (editing) return;
        event.preventDefault();
        event.stopPropagation();
        setDragActive(false);
        const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
        if (image) void uploadImage(image);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void uploadImage(file);
        }}
      />

      {!editing ? (
        <CanvasNodeResizeControl
          nodeId={id}
          minWidth={IMAGE_NODE_SIZE_LIMITS.minWidth}
          minHeight={IMAGE_NODE_SIZE_LIMITS.minHeight}
          maxWidth={IMAGE_NODE_SIZE_LIMITS.maxWidth}
          maxHeight={IMAGE_NODE_SIZE_LIMITS.maxHeight}
          keepAspectRatio={Boolean(dimensions && hasImage)}
        />
      ) : null}

      {!editing ? (
        <>
          <CanvasNodeConnectionHandle type="target" position={Position.Left} label={t.pipeline.nodeImageInputHandle} />
          <CanvasNodeConnectionHandle type="source" position={Position.Right} label={t.pipeline.nodeImageOutputHandle} />
        </>
      ) : null}

      {presentation.showToolbar && !deferMediaLoad && !editing ? (
        <CanvasNodeContextToolbar offset={54}>
          <CanvasNodeToolbarButton label={t.pipeline.nodeImageEdit} icon={<Pencil className="size-4" />} onClick={beginEditing} />
          <CanvasNodeToolbarButton
            label={t.pipeline.imageAiModify}
            icon={<Sparkles className="size-4" />}
            onClick={() => openImageComposer(id)}
          />
          <CanvasNodeToolbarButton label={t.pipeline.nodeImagePreview} icon={<Eye className="size-4" />} onClick={() => setPreviewOpen(true)} />
          <CanvasNodeToolbarButton label={t.pipeline.nodeImageReplace} icon={<RefreshCw className="size-4" />} onClick={() => inputRef.current?.click()} />
          <CanvasNodeToolbarButton label={t.pipeline.nodeImageDownload} icon={<Download className="size-4" />} onClick={downloadImage} />
          <CanvasNodeToolbarButton label={t.pipeline.nodeCreateCopy} icon={<Copy className="size-4" />} onClick={() => duplicateNodes([id])} />
          <CanvasNodeToolbarButton danger label={t.pipeline.nodeDelete} icon={<Trash2 className="size-4" />} onClick={() => deleteNodes([id])} />
        </CanvasNodeContextToolbar>
      ) : null}

      {selected && hasImage && !dragging && editing ? (
        <ImageEditToolbar
          onRotateLeft={() => setEditTransform((current) => rotateImagePreview(current, "left"))}
          onRotateRight={() => setEditTransform((current) => rotateImagePreview(current, "right"))}
          onFlipHorizontal={() => setEditTransform((current) => flipImagePreview(current, "horizontal"))}
          onFlipVertical={() => setEditTransform((current) => flipImagePreview(current, "vertical"))}
          onReset={() => setEditTransform(EMPTY_IMAGE_EDIT_TRANSFORM)}
          onSave={() => void saveEditing()}
          onCancel={cancelEditing}
          changed={imagePreviewChanged(editTransform)}
          saving={savingEdit}
        />
      ) : null}

      <div className="absolute bottom-[calc(100%+4px)] left-0 w-full">
        <CanvasNodeTitle
          icon={<Images className="size-4" />}
          name={canvas.name}
          ariaLabel={t.pipeline.nodeNameAria.replace("{type}", t.pipeline.nodeImage)}
          onRename={(name) => updateNodeData(id, { ...canvas, name })}
          actions={(
            <>
              {dimensions && hasImage ? (
                <span className="text-caption tabular-nums text-[var(--pl-text-muted)]">
                  {dimensions.width} × {dimensions.height}
                </span>
              ) : null}
              {presentation.showUploadAction ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
                >
                  <ImagePlus className="size-3.5" />
                  {t.pipeline.canvasUploadMedia}
                </button>
              ) : null}
            </>
          )}
        />
      </div>

      <section
        className={
          "nowheel relative h-full overflow-hidden rounded-[20px] border bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-card)] transition-[border-color,box-shadow] duration-200 " +
          (editing
            ? "nodrag !border-[var(--pl-accent)] shadow-[0_0_0_1px_var(--pl-accent)] "
            : selected || dragging
              ? "border-[var(--pl-border-strong)] shadow-[var(--pl-shadow-hover)]"
              : "border-transparent group-hover:border-[var(--pl-border)]") +
          (dragActive ? " !border-[var(--pl-accent)]" : "")
        }
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (hasImage && !editing) focusNode();
        }}
      >
        {uploading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--pl-surface-elevated)]/90 text-sm text-[var(--pl-text-secondary)]">
            <Spin />
            <span>{t.pipeline.nodeImageUploading}</span>
          </div>
        ) : null}
        {dragActive && !uploading ? (
          <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border border-dashed border-[var(--pl-accent)] bg-[var(--pl-accent-soft)]/90 px-5 text-center text-sm font-medium text-[var(--pl-accent)]">
            {hasImage ? t.pipeline.nodeImageDropReplace : t.pipeline.nodeImageDropHere}
          </div>
        ) : null}

        {mediaUrl ? (
          <div className="relative h-full w-full bg-[var(--pl-surface-subtle)]">
            {deferMediaLoad ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-[var(--pl-text-secondary)]">
                <Spin size="small" />
                <span>{t.pipeline.nodeImageCreatingCopy}</span>
              </div>
            ) : imageState === "error" ? (
              <ImageErrorState
                onRetry={() => setImageStatus({ url: mediaUrl, state: "loading" })}
                onReplace={() => inputRef.current?.click()}
              />
            ) : (
              <>
                {imageState === "loading" ? <div className="absolute inset-0 animate-pulse bg-[var(--pl-surface-hover)]" /> : null}
                <CanvasImageMedia
                  src={mediaUrl}
                  alt={canvas.name}
                  editing={editing}
                  transform={imagePreviewTransformCss(editTransform, {
                    width: node.width ?? 360,
                    height: node.height ?? 300,
                  })}
                  onReady={handleImageReady}
                  onError={handleImageError}
                />
                {editing ? (
                  <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)]/90 px-2.5 py-1 text-caption text-[var(--pl-text-secondary)] shadow-sm">
                    {imagePreviewChanged(editTransform)
                      ? savingEdit ? t.pipeline.nodeImageEditSaving : t.pipeline.nodeImageEditChangedHint
                      : t.pipeline.nodeImageEditHint}
                  </span>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className="pointer-events-none flex h-full w-full items-center justify-center bg-[var(--pl-surface-subtle)] text-[var(--pl-text-muted)]">
            {isGenerating ? (
              <span className="flex flex-col items-center gap-3 text-sm text-[var(--pl-text-secondary)]">
                <Spin size="small" />
                {t.pipeline.imageAiGenerating}
              </span>
            ) : <Images className="size-10 opacity-45" />}
          </div>
        )}
      </section>

      {presentation.showComposer && !editing ? (
        <ImageAiComposer
          key={id}
          nodeId={id}
          data={canvas}
          waitingForSave={waitingForSave}
          onNodeUpdate={(serverNode) => {
            if (serverNode.data) applyServerNodeData(id, serverNode.data, serverNode.updatedAt);
          }}
        />
      ) : null}

      {selected && hasImage && !dragging && modifyComposerOpen && !editing ? (
        <ImageAiComposer
          key={`${id}:modify`}
          nodeId={id}
          data={canvas}
          mode="modify"
          waitingForSave={waitingForSave}
          onNodeUpdate={(serverNode) => {
            if (serverNode.data) applyServerNodeData(id, serverNode.data, serverNode.updatedAt);
          }}
          onGenerationStarted={(serverNode, edge) => {
            insertServerGenerationResult(serverNode, edge);
            closeImageComposer(id);
          }}
        />
      ) : null}

      <Modal
        open={previewOpen}
        title={canvas.name}
        footer={null}
        width="min(1180px, calc(100vw - 80px))"
        onCancel={() => setPreviewOpen(false)}
        mask={{ closable: false }}
        keyboard={false}
        destroyOnHidden
      >
        {mediaUrl ? (
          <div className="relative h-[min(72vh,820px)] w-full bg-[var(--pl-surface-subtle)]">
            <NextImage src={mediaUrl} alt={canvas.name} fill unoptimized sizes="1180px" className="object-contain" />
          </div>
        ) : null}
      </Modal>
    </article>
  );
}

const CanvasImageMedia = memo(function CanvasImageMedia({
  src,
  alt,
  editing,
  transform,
  onReady,
  onError,
}: {
  src: string;
  alt: string;
  editing: boolean;
  transform: string;
  onReady: (width: number, height: number) => void;
  onError: () => void;
}) {
  return (
    <NextImage
      src={src}
      alt={alt}
      fill
      unoptimized
      sizes="900px"
      draggable={false}
      className={
        "pointer-events-none select-none transition-transform duration-200 motion-reduce:transition-none " +
        (editing ? "object-contain" : "object-cover")
      }
      style={{ transform: editing ? transform : undefined }}
      onLoad={(event) => onReady(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
      onError={onError}
    />
  );
});

function ImageErrorState({ onRetry, onReplace }: { onRetry: () => void; onReplace: () => void }) {
  const { t } = useI18n();
  return (
    <div className="nodrag absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <Images className="size-7 text-[var(--pl-text-muted)]" />
      <span className="text-sm font-medium text-[var(--pl-text)]">{t.pipeline.nodeImageLoadFailed}</span>
      <div className="flex gap-2">
        <Button size="small" onClick={onRetry}>{t.pipeline.nodeImageRetry}</Button>
        <Button size="small" type="primary" onClick={onReplace}>{t.pipeline.nodeImageReplace}</Button>
      </div>
    </div>
  );
}
