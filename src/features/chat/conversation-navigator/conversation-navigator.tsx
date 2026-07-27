"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/i18n/use-i18n";
import type { ConversationNavigatorEntry } from "./conversation-navigator-adapter";
import {
  selectActiveConversationEntry,
  waveLineWidth,
} from "./conversation-navigator-logic";

const BOTTOM_TOLERANCE = 32;
const HIGHLIGHT_DURATION = 1200;
const ROW_HEIGHT = 9;

export function ConversationNavigator({
  entries,
  messageElementsRef,
  onHighlightMessageChange,
  scroller,
}: {
  entries: ConversationNavigatorEntry[];
  messageElementsRef: RefObject<Map<string, HTMLElement>>;
  onHighlightMessageChange?: (messageId: string | null) => void;
  scroller: HTMLDivElement | null;
}) {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState<string | null>(
    entries[0]?.id ?? null,
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const updateFrameRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);
  const hoveredIndex = entries.findIndex((entry) => entry.id === hoveredId);
  const hoveredEntry =
    hoveredIndex >= 0 ? (entries[hoveredIndex] ?? null) : null;

  const updateActiveEntry = useCallback(() => {
    if (!scroller || entries.length === 0) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const bottomDistance =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const referenceTop =
      scrollerRect.top + Math.min(144, scroller.clientHeight * 0.22);
    const anchors = entries.flatMap((entry) => {
      const element = messageElementsRef.current?.get(entry.id);
      return element
        ? [{ id: entry.id, top: element.getBoundingClientRect().top }]
        : [];
    });

    setActiveId(
      selectActiveConversationEntry({
        anchors,
        atLatest: bottomDistance <= BOTTOM_TOLERANCE,
        referenceTop,
      }),
    );
  }, [entries, messageElementsRef, scroller]);

  const scheduleActiveUpdate = useCallback(() => {
    if (updateFrameRef.current !== null) return;
    updateFrameRef.current = window.requestAnimationFrame(() => {
      updateFrameRef.current = null;
      updateActiveEntry();
    });
  }, [updateActiveEntry]);

  useEffect(() => {
    if (!scroller) return;
    const observer = new ResizeObserver(scheduleActiveUpdate);
    observer.observe(scroller);
    for (const entry of entries) {
      const element = messageElementsRef.current?.get(entry.id);
      if (element) observer.observe(element);
    }
    scroller.addEventListener("scroll", scheduleActiveUpdate, {
      passive: true,
    });
    const initialFrame = window.requestAnimationFrame(scheduleActiveUpdate);

    return () => {
      window.cancelAnimationFrame(initialFrame);
      observer.disconnect();
      scroller.removeEventListener("scroll", scheduleActiveUpdate);
      if (updateFrameRef.current !== null) {
        window.cancelAnimationFrame(updateFrameRef.current);
        updateFrameRef.current = null;
      }
    };
  }, [entries, messageElementsRef, scheduleActiveUpdate, scroller]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      onHighlightMessageChange?.(null);
    },
    [onHighlightMessageChange],
  );

  const highlightMessage = useCallback(
    (id: string) => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      onHighlightMessageChange?.(id);
      highlightTimerRef.current = window.setTimeout(() => {
        onHighlightMessageChange?.(null);
        highlightTimerRef.current = null;
      }, HIGHLIGHT_DURATION);
    },
    [onHighlightMessageChange],
  );

  const navigateTo = useCallback(
    (id: string) => {
      const element = messageElementsRef.current?.get(id);
      if (!element || !scroller) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      scroller.scrollTo({
        behavior: reducedMotion ? "auto" : "smooth",
        top: scroller.scrollTop + elementRect.top - scrollerRect.top - 16,
      });
      setActiveId(id);
      highlightMessage(id);
    },
    [highlightMessage, messageElementsRef, scroller],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const currentIndex =
        hoveredIndex >= 0
          ? hoveredIndex
          : Math.max(
              0,
              entries.findIndex((entry) => entry.id === activeId),
            );
      let nextIndex: number | null = null;
      if (event.key === "ArrowDown") {
        nextIndex = Math.min(entries.length - 1, currentIndex + 1);
      } else if (event.key === "ArrowUp") {
        nextIndex = Math.max(0, currentIndex - 1);
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = entries.length - 1;
      }
      if (nextIndex === null) return;
      event.preventDefault();
      const nextEntry = entries[nextIndex];
      if (!nextEntry) return;
      setHoveredId(nextEntry.id);
      itemRefs.current.get(nextEntry.id)?.focus();
    },
    [activeId, entries, hoveredIndex],
  );

  const previewStyle = useMemo(() => {
    if (hoveredIndex < 0 || entries.length === 0) return undefined;
    return {
      "--conversation-preview-y": `${((hoveredIndex + 0.5) / entries.length) * 100}%`,
    } as CSSProperties;
  }, [entries.length, hoveredIndex]);

  if (entries.length < 2) return null;

  return (
    <aside
      aria-label={t.workspace.conversationNavigator}
      className="pointer-events-none absolute top-0 right-3 bottom-0 z-30 flex w-12 items-center justify-end overflow-visible"
    >
      <nav
        aria-label={t.workspace.conversationNavigator}
        className="pointer-events-auto relative flex w-12 items-stretch justify-end overflow-visible"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHoveredId(null);
          }
        }}
        onKeyDown={handleKeyDown}
        onPointerLeave={() => setHoveredId(null)}
        style={{
          height: `min(68%, ${entries.length * ROW_HEIGHT}px)`,
        }}
      >
        <ol className="flex h-full w-10 flex-col items-end">
          {entries.map((entry, index) => {
            const active = entry.id === activeId;
            const hovered = entry.id === hoveredId;
            const lineWidth = waveLineWidth({
              active,
              hoveredIndex,
              index,
            });
            return (
              <li className="min-h-1 flex-1" key={entry.id}>
                <button
                  aria-current={active ? "location" : undefined}
                  aria-label={t.workspace.jumpToConversation.replace(
                    "{title}",
                    entry.title,
                  )}
                  className="group flex h-full w-10 cursor-pointer items-center justify-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => navigateTo(entry.id)}
                  onFocus={() => setHoveredId(entry.id)}
                  onPointerEnter={() => setHoveredId(entry.id)}
                  ref={(element) => {
                    if (element) itemRefs.current.set(entry.id, element);
                    else itemRefs.current.delete(entry.id);
                  }}
                  tabIndex={active ? 0 : -1}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`h-0.5 rounded-full transition-[width,background-color,opacity] duration-150 ease-out ${
                      hovered || active
                        ? "bg-primary opacity-90"
                        : "bg-dim"
                    }`}
                    style={{ width: `${lineWidth}px` }}
                  />
                </button>
              </li>
            );
          })}
        </ol>

        {hoveredEntry ? (
          <div
            className="absolute right-12 z-40 w-[340px] max-w-[calc(100vw-5rem)] -translate-y-1/2 rounded-xl border border-line-subtle bg-elevated px-3 py-2.5 shadow-[var(--shadow-floating)]"
            data-conversation-preview
            style={{
              ...previewStyle,
              top: "var(--conversation-preview-y)",
            }}
          >
            <p className="line-clamp-1 text-[13px] leading-5 font-semibold text-primary">
              {hoveredEntry.title}
            </p>
            {hoveredEntry.summary ? (
              <p className="mt-1 line-clamp-3 text-xs leading-[1.55] text-muted">
                {hoveredEntry.summary}
              </p>
            ) : null}
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
