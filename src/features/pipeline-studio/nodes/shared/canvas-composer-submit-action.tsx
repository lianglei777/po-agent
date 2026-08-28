"use client";

import { Tooltip } from "antd";
import { LoaderCircle, Send, Square } from "@/components/icons";

export function CanvasComposerSubmitAction({
  cancellable = false,
  cancelling = false,
  disabledReason,
  generateLabel,
  generating,
  generatingLabel,
  onCancel,
  onSubmit,
  cancelLabel,
  getPopupContainer,
}: {
  cancellable?: boolean;
  cancelling?: boolean;
  disabledReason: string;
  generateLabel: string;
  generating: boolean;
  generatingLabel: string;
  onCancel?: () => void;
  onSubmit: () => void;
  cancelLabel?: string;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
}) {
  if (generating && onCancel) {
    return (
      <>
        <span className="hidden items-center gap-2 text-xs text-[var(--pl-text-muted)] sm:flex">
          <LoaderCircle className="size-3.5 animate-spin" />
          {generatingLabel}
        </span>
        <Tooltip title={cancellable ? cancelLabel : generatingLabel} getPopupContainer={getPopupContainer}>
          <span>
            <button
              aria-label={cancelLabel}
              className="flex size-9 items-center justify-center rounded-full border border-[var(--pl-border-strong)] text-[var(--pl-text)] transition-colors hover:bg-[var(--pl-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:opacity-50"
              disabled={cancelling || !cancellable}
              onClick={onCancel}
              type="button"
            >
              {cancelling ? <LoaderCircle className="size-4 animate-spin" /> : <Square className="size-3.5" />}
            </button>
          </span>
        </Tooltip>
      </>
    );
  }

  return (
    <>
      {generating ? (
        <span className="hidden items-center gap-2 text-xs text-[var(--pl-text-muted)] sm:flex">
          <LoaderCircle className="size-3.5 animate-spin" />
          {generatingLabel}
        </span>
      ) : null}
      <Tooltip title={disabledReason || (generating ? generatingLabel : generateLabel)} getPopupContainer={getPopupContainer}>
        <span>
          <button
            aria-label={generateLabel}
            className="flex size-9 items-center justify-center rounded-full bg-[var(--pl-accent)] text-white transition-colors hover:bg-[var(--pl-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-35"
            disabled={Boolean(disabledReason) || generating}
            onClick={onSubmit}
            type="button"
          >
            {generating ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </span>
      </Tooltip>
    </>
  );
}
