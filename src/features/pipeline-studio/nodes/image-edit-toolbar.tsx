"use client";

import { FlipHorizontal, FlipVertical, RefreshCw, RotateCcw, RotateCw, X } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { CanvasNodeContextToolbar, CanvasNodeToolbarButton } from "./shared/canvas-node-context-toolbar";

export function ImageEditToolbar({
  onRotateLeft,
  onRotateRight,
  onFlipHorizontal,
  onFlipVertical,
  onReset,
  onCancel,
}: {
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  return (
    <CanvasNodeContextToolbar offset={54}>
      <span className="px-2 text-xs font-medium text-[var(--pl-text-secondary)]">
        {t.pipeline.nodeImageEditPreview}
      </span>
      <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-[var(--pl-border)]" />
      <CanvasNodeToolbarButton label={t.pipeline.nodeImageRotateLeft} icon={<RotateCcw className="size-4" />} onClick={onRotateLeft} />
      <CanvasNodeToolbarButton label={t.pipeline.nodeImageRotateRight} icon={<RotateCw className="size-4" />} onClick={onRotateRight} />
      <CanvasNodeToolbarButton label={t.pipeline.nodeImageFlipHorizontal} icon={<FlipHorizontal className="size-4" />} onClick={onFlipHorizontal} />
      <CanvasNodeToolbarButton label={t.pipeline.nodeImageFlipVertical} icon={<FlipVertical className="size-4 rotate-90" />} onClick={onFlipVertical} />
      <CanvasNodeToolbarButton label={t.pipeline.nodeImageEditReset} icon={<RefreshCw className="size-4" />} onClick={onReset} />
      <CanvasNodeToolbarButton label={t.pipeline.nodeImageEditCancel} icon={<X className="size-4" />} onClick={onCancel} />
    </CanvasNodeContextToolbar>
  );
}
