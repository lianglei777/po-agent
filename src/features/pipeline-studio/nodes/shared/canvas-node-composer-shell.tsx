import type { ReactNode } from "react";

export function CanvasNodeComposerShell({
  ariaLabel,
  large,
  body,
  footer,
  error,
}: {
  ariaLabel: string;
  large: boolean;
  body: ReactNode;
  footer: ReactNode;
  error?: ReactNode;
}) {
  return (
    <section
      className={
        "flex flex-col overflow-hidden rounded-2xl border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] shadow-[var(--pl-shadow-hover)] " +
        (large ? "h-[min(68vh,680px)]" : "h-56")
      }
      aria-label={ariaLabel}
    >
      <div className="flex min-h-0 flex-1">{body}</div>
      {error ? <div role="alert" className="border-t border-red-400/20 bg-red-500/10 px-4 py-2 text-xs text-red-200">{error}</div> : null}
      <footer className="flex h-14 shrink-0 items-center gap-3 border-t border-[var(--pl-border)] px-3">
        {footer}
      </footer>
    </section>
  );
}
