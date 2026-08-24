"use client";

import { useEffect, useState } from "react";
import { Popover } from "antd";
import { Keyboard, X } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import {
  CANVAS_SHORTCUT_GROUPS,
  type CanvasShortcutGroupId,
  type CanvasShortcutId,
} from "../model/canvas-shortcuts";

export function CanvasShortcutsPopover() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const groupLabels = {
    editing: t.pipeline.canvasShortcutGroupEditing,
    tools: t.pipeline.canvasShortcutGroupTools,
    selection: t.pipeline.canvasShortcutGroupSelection,
  } satisfies Record<CanvasShortcutGroupId, string>;
  const shortcutLabels = {
    undo: t.pipeline.canvasShortcutUndo,
    redo: t.pipeline.canvasShortcutRedo,
    copy: t.pipeline.canvasShortcutCopy,
    paste: t.pipeline.canvasShortcutPaste,
    duplicate: t.pipeline.canvasShortcutDuplicate,
    delete: t.pipeline.canvasShortcutDelete,
    selectTool: t.pipeline.canvasShortcutSelectTool,
    panTool: t.pipeline.canvasShortcutPanTool,
    fitCanvas: t.pipeline.canvasShortcutFitCanvas,
    zoomIn: t.pipeline.canvasShortcutZoomIn,
    zoomOut: t.pipeline.canvasShortcutZoomOut,
    temporaryPan: t.pipeline.canvasShortcutTemporaryPan,
    multiSelect: t.pipeline.canvasShortcutMultiSelect,
    boxSelect: t.pipeline.canvasShortcutBoxSelect,
    clearSelection: t.pipeline.canvasShortcutClearSelection,
  } satisfies Record<CanvasShortcutId, string>;
  const tokenLabels: Record<string, string> = {
    Mod: t.pipeline.canvasShortcutModifier,
    Click: t.pipeline.canvasShortcutClick,
    Drag: t.pipeline.canvasShortcutDrag,
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const content = (
    <section
      id="pipeline-canvas-shortcuts"
      role="dialog"
      aria-label={t.pipeline.canvasShortcuts}
      aria-modal="false"
      className="w-[min(820px,calc(100vw-32px))] overflow-hidden rounded-xl bg-[var(--pl-surface-elevated)] text-[var(--pl-text)]"
    >
      <header className="flex items-start justify-between gap-4 border-b border-[var(--pl-border)] px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{t.pipeline.canvasShortcuts}</h2>
          <p className="mt-1 text-caption text-[var(--pl-text-muted)]">{t.pipeline.canvasShortcutsDescription}</p>
        </div>
        <button
          type="button"
          aria-label={t.pipeline.canvasShortcutsClose}
          onClick={() => setOpen(false)}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--pl-text-muted)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pl-accent)]"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="grid max-h-[min(560px,calc(100vh-180px))] overflow-y-auto divide-y divide-[var(--pl-border)] md:grid-cols-3 md:divide-x md:divide-y-0">
        {CANVAS_SHORTCUT_GROUPS.map((group) => (
          <section key={group.id} className="min-w-0 px-5 py-4">
            <h3 className="mb-3 text-caption font-semibold text-[var(--pl-accent)]">{groupLabels[group.id]}</h3>
            <dl className="space-y-1">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.id} className="flex min-h-9 items-center justify-between gap-4">
                  <dt className="min-w-0 text-caption text-[var(--pl-text-secondary)]">{shortcutLabels[shortcut.id]}</dt>
                  <dd className="flex shrink-0 items-center gap-1.5">
                    {shortcut.sequences.map((sequence, sequenceIndex) => (
                      <span key={sequence.join("+")} className="flex items-center gap-1">
                        {sequenceIndex > 0 ? <span className="px-0.5 text-caption text-[var(--pl-text-muted)]">/</span> : null}
                        {sequence.map((token, tokenIndex) => (
                          <span key={token} className="flex items-center gap-1">
                            {tokenIndex > 0 ? <span className="text-caption text-[var(--pl-text-muted)]">+</span> : null}
                            <kbd className="min-w-7 rounded-md border border-[var(--pl-border-strong)] bg-[var(--pl-surface)] px-1.5 py-1 text-center font-mono text-caption leading-none text-[var(--pl-text)] shadow-[inset_0_-1px_0_var(--pl-border)]">
                              {tokenLabels[token] ?? token}
                            </kbd>
                          </span>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      <footer className="border-t border-[var(--pl-border)] px-5 py-3 text-caption text-[var(--pl-text-muted)]">
        {t.pipeline.canvasShortcutsInputHint}
      </footer>
    </section>
  );

  return (
    <Popover
      arrow={{ pointAtCenter: true }}
      content={content}
      destroyOnHidden
      open={open}
      onOpenChange={setOpen}
      placement="top"
      trigger="click"
      classNames={{ container: "!max-w-none !p-0" }}
    >
      <button
        type="button"
        aria-controls="pipeline-canvas-shortcuts"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t.pipeline.canvasShortcuts}
        className="flex h-8 items-center justify-center rounded-lg px-2 text-[var(--pl-text-secondary)] transition-colors hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] active:translate-y-px focus-visible:outline-2 focus-visible:outline-[var(--pl-accent)]"
      >
        <Keyboard className="size-4" />
      </button>
    </Popover>
  );
}
