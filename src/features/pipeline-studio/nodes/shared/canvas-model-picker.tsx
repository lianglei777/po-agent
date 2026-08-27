"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "antd";
import { Check, ChevronDown } from "@/components/icons";

export interface CanvasModelPickerItem {
  id: string;
  name: string;
  group?: string;
  meta?: string;
  description?: string;
  tags?: string[];
  icon?: ReactNode;
}

export function CanvasModelPicker({
  ariaLabel,
  disabled,
  emptyLabel,
  items,
  value,
  onChange,
  getPopupContainer,
}: {
  ariaLabel: string;
  disabled: boolean;
  emptyLabel: string;
  items: CanvasModelPickerItem[];
  value: string;
  onChange: (value: string) => void;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
}) {
  const [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selected = items.find((item) => item.id === value);
  const groups = useMemo(() => Array.from(new Set(items.map((item) => item.group ?? ""))), [items]);

  useEffect(() => () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
  }, []);

  const schedulePreview = (itemId: string) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreviewId(itemId), 80);
  };

  const restoreSelected = (delay = 110) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => setPreviewId(null), delay);
  };

  return (
    <Popover
      arrow={false}
      content={(
        <div
          aria-label={ariaLabel}
          className="nodrag max-h-[min(420px,60vh)] w-[min(390px,calc(100vw-48px))] overflow-y-auto p-1 [scrollbar-gutter:stable]"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) restoreSelected(0);
          }}
          onMouseLeave={(event) => {
            if (!event.currentTarget.contains(document.activeElement)) restoreSelected();
          }}
          role="listbox"
        >
          {groups.map((group) => (
            <section className="space-y-1" key={group || "models"}>
              {group ? <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--pl-text-muted)]">{group}</p> : null}
              {items.filter((item) => (item.group ?? "") === group).map((item) => {
                const active = (previewId ?? value) === item.id;
                const checked = value === item.id;
                return (
                  <button
                    aria-selected={checked}
                    className={`group/model w-full rounded-lg border px-2.5 py-2 text-left transition-[background-color,border-color] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] ${active ? "border-[var(--pl-border-strong)] bg-[var(--pl-surface-hover)]" : "border-transparent hover:bg-[var(--pl-surface-hover)]"}`}
                    key={item.id}
                    onClick={() => {
                      if (previewTimer.current) clearTimeout(previewTimer.current);
                      onChange(item.id);
                      setOpen(false);
                      setPreviewId(null);
                    }}
                    onFocus={() => {
                      if (previewTimer.current) clearTimeout(previewTimer.current);
                      setPreviewId(item.id);
                    }}
                    onMouseEnter={() => schedulePreview(item.id)}
                    role="option"
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--pl-surface)] text-[var(--pl-text-secondary)]">{item.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold text-[var(--pl-text)]">{item.name}</span>
                          {item.meta ? <span className="ml-auto shrink-0 text-[10px] text-[var(--pl-text-muted)]">{item.meta}</span> : null}
                          {checked ? <Check className="size-3.5 shrink-0 text-[var(--pl-accent)]" /> : null}
                        </span>
                      </span>
                    </span>
                    <span
                      aria-hidden={!active}
                      className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                    >
                      <span className="min-h-0 overflow-hidden">
                        <span className={`block pl-9 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${active ? "translate-y-0 opacity-100" : "translate-y-0.5 opacity-0"}`}>
                          {item.description ? <span className="mt-1 block line-clamp-2 text-[11px] leading-4 text-[var(--pl-text-secondary)]">{item.description}</span> : null}
                          {item.tags?.length ? (
                            <span className="mt-2 flex flex-wrap gap-1">
                              {item.tags.slice(0, 3).map((tag) => <span className="rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface)] px-1.5 py-0.5 text-[10px] text-[var(--pl-text-muted)]" key={tag}>{tag}</span>)}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
      destroyOnHidden
      getPopupContainer={getPopupContainer}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          if (previewTimer.current) clearTimeout(previewTimer.current);
          setPreviewId(null);
        }
      }}
      open={open}
      placement="topLeft"
      trigger="click"
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="nodrag flex h-8 min-w-0 max-w-56 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">{selected?.icon}</span>
        <span className="truncate">{selected?.name ?? emptyLabel}</span>
        <ChevronDown className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </Popover>
  );
}
