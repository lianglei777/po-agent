"use client";

import { useRef, useState, type ReactNode } from "react";

export function CanvasNodeTitle({
  icon,
  name,
  ariaLabel,
  actions,
  onRename,
}: {
  icon: ReactNode;
  name: string;
  ariaLabel: string;
  actions?: ReactNode;
  onRename: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  const cancelRef = useRef(false);

  const beginRename = () => {
    cancelRef.current = false;
    setDraft(name);
    setRenaming(true);
  };

  const commit = () => {
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(name);
      setRenaming(false);
      return;
    }
    const nextName = draft.trim();
    if (nextName && nextName !== name) onRename(nextName);
    setDraft(nextName || name);
    setRenaming(false);
  };

  return (
    <header className="pipeline-node-drag-handle flex h-9 items-center gap-2 px-2 text-[var(--pl-text-secondary)]">
      <span className="shrink-0 text-[var(--pl-text-muted)]">{icon}</span>
      {renaming ? (
        <input
          autoFocus
          value={draft}
          maxLength={200}
          aria-label={ariaLabel}
          className="nodrag min-w-0 flex-1 rounded-md border border-[var(--pl-accent)] bg-[var(--pl-surface-elevated)] px-2 py-0.5 text-sm font-medium text-[var(--pl-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]/30"
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value)}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelRef.current = true;
              event.currentTarget.blur();
            }
          }}
        />
      ) : (
        <span
          tabIndex={0}
          title={name}
          className="nodrag min-w-0 cursor-text truncate rounded px-1 text-sm font-medium text-[var(--pl-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            beginRename();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            beginRename();
          }}
        >
          {name}
        </span>
      )}
      {actions ? <div className="nodrag ml-auto flex shrink-0 items-center gap-1">{actions}</div> : null}
    </header>
  );
}
