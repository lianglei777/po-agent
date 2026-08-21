"use client";

import { useState } from "react";
import { Modal, Tooltip } from "antd";
import { ImagePlus, Maximize2, Send, Sparkles } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";

export function ImageAiComposer({ onUpload }: { onUpload: () => void }) {
  const { t } = useI18n();
  const [instruction, setInstruction] = useState("");
  const [expanded, setExpanded] = useState(false);

  const surface = (large: boolean) => (
    <CanvasNodeComposerShell
      ariaLabel={t.pipeline.imageAiTitle}
      large={large}
      body={(
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-4 pt-4">
            <button
              type="button"
              onClick={onUpload}
              className="flex h-11 items-center gap-2 rounded-lg border border-[var(--pl-border-strong)] bg-[var(--pl-surface)] px-3 text-xs font-medium text-[var(--pl-text-secondary)] hover:border-[var(--pl-accent)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
            >
              <ImagePlus className="size-4" />
              {t.pipeline.nodeImageChoose}
            </button>
            {!large ? (
              <button
                type="button"
                title={t.pipeline.textAiExpand}
                aria-label={t.pipeline.textAiExpand}
                onClick={() => setExpanded(true)}
                className="ml-auto flex size-8 items-center justify-center rounded-lg text-[var(--pl-text-muted)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
              >
                <Maximize2 className="size-4" />
              </button>
            ) : null}
          </div>
          <textarea
            autoFocus={large}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={t.pipeline.imageAiPlaceholder}
            aria-label={t.pipeline.imageAiInstruction}
            className="nodrag nowheel min-h-0 flex-1 resize-none border-0 bg-transparent px-5 py-4 text-sm leading-6 text-[var(--pl-text)] outline-none placeholder:text-[var(--pl-text-muted)]"
          />
        </div>
      )}
      footer={(
        <>
          <Sparkles className="size-4 shrink-0 text-[var(--pl-accent)]" />
          <span className="text-xs text-[var(--pl-text-secondary)]">{t.pipeline.imageAiComingSoon}</span>
          <span className="flex-1" />
          <Tooltip title={t.pipeline.imageAiDisabledReason}>
            <span>
              <button
                type="button"
                disabled
                aria-label={t.pipeline.imageAiGenerate}
                className="flex size-9 items-center justify-center rounded-full bg-white text-black disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Send className="size-4" />
              </button>
            </span>
          </Tooltip>
        </>
      )}
    />
  );

  return (
    <>
      <div
        className="nodrag nowheel absolute left-1/2 top-[calc(100%+14px)] z-30 w-[min(900px,84vw)] -translate-x-1/2"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {surface(false)}
      </div>
      <Modal
        open={expanded}
        title={t.pipeline.imageAiTitle}
        width={1000}
        footer={null}
        mask={{ closable: false }}
        keyboard={false}
        onCancel={() => setExpanded(false)}
        destroyOnHidden
      >
        {surface(true)}
      </Modal>
    </>
  );
}
