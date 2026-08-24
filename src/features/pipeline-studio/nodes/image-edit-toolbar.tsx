"use client";

import { Check, FlipHorizontal, FlipVertical, LoaderCircle, RefreshCw, RotateCcw, RotateCw, X } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { CanvasNodeContextToolbar, CanvasNodeToolbarButton } from "./shared/canvas-node-context-toolbar";

export function ImageEditToolbar({
  onRotateLeft,
  onRotateRight,
  onFlipHorizontal,
  onFlipVertical,
  onReset,
  onSave,
  onCancel,
  changed,
  saving,
}: {
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onReset: () => void;
  onSave: () => void;
  onCancel: () => void;
  changed: boolean;
  saving: boolean;
}) {
  const { t } = useI18n();
  return (
    <CanvasNodeContextToolbar offset={54}>
      <span className="px-2 text-xs font-medium text-[var(--pl-text-secondary)]">
        {t.pipeline.nodeImageEditPreview}
      </span>
      <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-[var(--pl-border)]" />
      <CanvasNodeToolbarButton disabled={saving} disabledReason={t.pipeline.nodeImageEditSaving} label={t.pipeline.nodeImageRotateLeft} icon={<RotateCcw className="size-4" />} onClick={onRotateLeft} />
      <CanvasNodeToolbarButton disabled={saving} disabledReason={t.pipeline.nodeImageEditSaving} label={t.pipeline.nodeImageRotateRight} icon={<RotateCw className="size-4" />} onClick={onRotateRight} />
      <CanvasNodeToolbarButton disabled={saving} disabledReason={t.pipeline.nodeImageEditSaving} label={t.pipeline.nodeImageFlipHorizontal} icon={<FlipHorizontal className="size-4" />} onClick={onFlipHorizontal} />
      <CanvasNodeToolbarButton disabled={saving} disabledReason={t.pipeline.nodeImageEditSaving} label={t.pipeline.nodeImageFlipVertical} icon={<FlipVertical className="size-4 rotate-90" />} onClick={onFlipVertical} />
      <CanvasNodeToolbarButton disabled={saving} disabledReason={t.pipeline.nodeImageEditSaving} label={t.pipeline.nodeImageEditReset} icon={<RefreshCw className="size-4" />} onClick={onReset} />
      <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-[var(--pl-border)]" />
      <CanvasNodeToolbarButton
        disabled={!changed || saving}
        disabledReason={!changed ? t.pipeline.nodeImageEditSaveDisabled : t.pipeline.nodeImageEditSaving}
        label={saving ? t.pipeline.nodeImageEditSaving : t.pipeline.nodeImageEditSave}
        icon={saving ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
        onClick={onSave}
      />
      <CanvasNodeToolbarButton disabled={saving} disabledReason={t.pipeline.nodeImageEditSaving} label={t.pipeline.nodeImageEditCancel} icon={<X className="size-4" />} onClick={onCancel} />
    </CanvasNodeContextToolbar>
  );
}
