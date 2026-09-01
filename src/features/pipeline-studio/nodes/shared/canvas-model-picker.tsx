"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Popover, Tooltip } from "antd";
import { Check, ChevronDown, Info } from "@/components/icons";

export interface CanvasModelPickerItem {
  id: string;
  name: string;
  badge?: string;
  meta?: string;
  description?: string;
  tags?: string[];
  icon?: ReactNode;
}

export function CanvasModelPicker({
  ariaLabel,
  disabled,
  emptyLabel,
  itemDetailsLabel,
  items,
  value,
  onChange,
  getPopupContainer,
}: {
  ariaLabel: string;
  disabled: boolean;
  emptyLabel: string;
  itemDetailsLabel: string;
  items: CanvasModelPickerItem[];
  value: string;
  onChange: (value: string) => void;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((item) => item.id === value);

  return (
    <Popover
      arrow={false}
      content={(
        <div
          aria-label={ariaLabel}
          className="nodrag max-h-[min(420px,60vh)] w-[min(390px,calc(100vw-48px))] overflow-y-auto p-1 [scrollbar-gutter:stable]"
          role="dialog"
        >
          <div className="space-y-1">
            {items.map((item) => {
              const checked = value === item.id;
              const details = item.description || item.tags?.length ? (
                <div className="max-w-72">
                  {item.description ? <p className="text-caption leading-5">{item.description}</p> : null}
                  {item.tags?.length ? <p className="mt-1 text-caption text-[var(--pl-text-muted)]">{item.tags.slice(0, 3).join(" · ")}</p> : null}
                </div>
              ) : null;
              return (
                <div
                  className={`group/model flex h-10 w-full items-center rounded-lg border transition-[background-color,border-color] duration-200 ease-out motion-reduce:transition-none ${checked ? "border-[var(--pl-border-strong)] bg-[var(--pl-surface-hover)]" : "border-transparent hover:bg-[var(--pl-surface-hover)]"}`}
                  key={item.id}
                >
                  <button
                    aria-pressed={checked}
                    className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--pl-accent)]"
                    onClick={() => {
                      onChange(item.id);
                      setOpen(false);
                    }}
                    type="button"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--pl-surface)] text-[var(--pl-text-secondary)]">{item.icon}</span>
                    <span className="truncate text-xs font-semibold text-[var(--pl-text)]">{item.name}</span>
                    {item.badge ? <span className="shrink-0 rounded border border-[var(--pl-border)] px-1 py-0.5 text-[9px] font-medium text-[var(--pl-text-muted)]">{item.badge}</span> : null}
                    {item.meta ? <span className="ml-auto shrink-0 text-[10px] text-[var(--pl-text-muted)]">{item.meta}</span> : null}
                  </button>
                  {details ? (
                    <Tooltip
                      getPopupContainer={getPopupContainer}
                      placement="right"
                      title={details}
                      trigger={["hover", "focus", "click"]}
                    >
                      <button
                        aria-label={`${itemDetailsLabel}: ${item.name}`}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--pl-text-muted)] transition-colors hover:bg-[var(--pl-surface)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)]"
                        onClick={(event) => event.stopPropagation()}
                        type="button"
                      >
                        <Info className="size-3.5" />
                      </button>
                    </Tooltip>
                  ) : null}
                  {checked ? <Check className="mx-2 size-3.5 shrink-0 text-[var(--pl-accent)]" /> : <span className="w-[30px] shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      )}
      destroyOnHidden
      getPopupContainer={getPopupContainer}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
      open={open}
      placement="topLeft"
      trigger="click"
    >
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className="nodrag flex h-8 min-w-0 max-w-56 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">{selected?.icon}</span>
        <span className="truncate">{selected?.name ?? emptyLabel}</span>
        {selected?.badge ? <span className="hidden shrink-0 text-[10px] text-[var(--pl-text-muted)] sm:inline">{selected.badge}</span> : null}
        <ChevronDown className={`size-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </Popover>
  );
}
