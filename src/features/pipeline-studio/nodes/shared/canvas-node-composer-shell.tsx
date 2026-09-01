import type { ReactNode } from "react";
import { Maximize2 } from "@/components/icons";

export function CanvasNodeComposerShell({
  ariaLabel,
  large,
  body,
  footer,
  error,
  compactHeightClass = "h-56",
  expandLabel,
  onExpand,
}: {
  ariaLabel: string;
  large: boolean;
  body: ReactNode;
  footer: ReactNode;
  error?: ReactNode;
  compactHeightClass?: string;
  expandLabel: string;
  onExpand: () => void;
}) {
  return (
    <section
      className={
        "flex flex-col overflow-hidden rounded-xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-hover)] " +
        (large ? "h-[min(68vh,680px)]" : compactHeightClass)
      }
      aria-label={ariaLabel}
    >
      <div className="relative flex min-h-0 flex-1">
        {body}
        {!large ? (
          <button
            aria-label={expandLabel}
            className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-control bg-[var(--pl-surface-elevated)] text-[var(--pl-text-muted)] transition-colors hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
            onClick={onExpand}
            title={expandLabel}
            type="button"
          >
            <Maximize2 className="size-4" />
          </button>
        ) : null}
      </div>
      {error ? <div role="alert" className="border-t border-[color-mix(in_srgb,var(--pl-error)_24%,transparent)] bg-[color-mix(in_srgb,var(--pl-error)_10%,transparent)] px-4 py-2 text-xs text-[var(--pl-danger)]">{error}</div> : null}
      <footer className="flex h-14 shrink-0 items-center gap-3 border-t border-[var(--pl-border)] px-3">
        {footer}
      </footer>
    </section>
  );
}
