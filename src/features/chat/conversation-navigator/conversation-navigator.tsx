"use client";

import {
  ArrowDownToLine,
  ListTree,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import {
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/use-i18n";
import { cn } from "@/lib/utils";
import type { ConversationNavigatorEntry } from "./conversation-navigator-adapter";
import { selectActiveConversationEntry } from "./conversation-navigator-logic";

const NAVIGATOR_STORAGE_KEY = "po.chat.conversation-navigator.expanded.v1";
const BOTTOM_TOLERANCE = 32;
const HIGHLIGHT_DURATION = 1200;

export function ConversationNavigator({
  compact,
  entries,
  messageElementsRef,
  onHighlightMessageChange,
  running,
  scroller,
}: {
  compact: boolean;
  entries: ConversationNavigatorEntry[];
  messageElementsRef: RefObject<Map<string, HTMLElement>>;
  onHighlightMessageChange?: (messageId: string | null) => void;
  running: boolean;
  scroller: HTMLDivElement | null;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(
    entries[0]?.id ?? null,
  );
  const [atLatest, setAtLatest] = useState(true);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const updateFrameRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(NAVIGATOR_STORAGE_KEY);
      if (stored === "false") setExpanded(false);
      setPreferenceReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!preferenceReady) return;
    window.localStorage.setItem(NAVIGATOR_STORAGE_KEY, String(expanded));
  }, [expanded, preferenceReady]);

  useEffect(() => {
    if (!compact) return;
    const timer = window.setTimeout(() => setOverlayOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [compact]);

  useEffect(() => {
    if (!overlayOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setOverlayOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOverlayOpen(false);
        rootRef.current
          ?.querySelector<HTMLButtonElement>("[data-navigator-trigger]")
          ?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [overlayOpen]);

  const updateActiveEntry = useCallback(() => {
    if (!scroller || entries.length === 0) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const bottomDistance =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    const nextAtLatest = bottomDistance <= BOTTOM_TOLERANCE;
    const referenceTop =
      scrollerRect.top + Math.min(144, scroller.clientHeight * 0.22);
    const anchors = entries.flatMap((entry) => {
      const element = messageElementsRef.current?.get(entry.id);
      return element
        ? [{ id: entry.id, top: element.getBoundingClientRect().top }]
        : [];
    });
    const nextActiveId = selectActiveConversationEntry({
      anchors,
      atLatest: nextAtLatest,
      referenceTop,
    });

    setAtLatest(nextAtLatest);
    setActiveId(nextActiveId);
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

  useEffect(() => {
    if (!activeId) return;
    const activeItem = itemRefs.current.get(activeId);
    if (!activeItem) return;
    const list = activeItem.closest<HTMLElement>("[data-navigator-list]");
    if (!list) return;
    const itemTop = activeItem.offsetTop;
    const itemBottom = itemTop + activeItem.offsetHeight;
    if (itemTop < list.scrollTop) list.scrollTop = itemTop;
    else if (itemBottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = itemBottom - list.clientHeight;
    }
  }, [activeId]);

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
      if (compact) setOverlayOpen(false);
    },
    [compact, highlightMessage, messageElementsRef, scroller],
  );

  const jumpToLatest = useCallback(() => {
    if (!scroller) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollTo({
      behavior: reducedMotion ? "auto" : "smooth",
      top: scroller.scrollHeight,
    });
    const latestId = entries.at(-1)?.id;
    if (latestId) {
      setActiveId(latestId);
      highlightMessage(latestId);
    }
    if (compact) setOverlayOpen(false);
  }, [compact, entries, highlightMessage, scroller]);

  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const currentIndex = entries.findIndex((entry) => entry.id === activeId);
      let nextIndex: number | null = null;
      if (event.key === "ArrowDown") {
        nextIndex = Math.min(entries.length - 1, currentIndex + 1);
      } else if (event.key === "ArrowUp") {
        nextIndex = Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = entries.length - 1;
      }
      if (nextIndex === null) return;
      event.preventDefault();
      const next = entries[nextIndex];
      if (!next) return;
      itemRefs.current.get(next.id)?.focus();
      navigateTo(next.id);
    },
    [activeId, entries, navigateTo],
  );

  if (entries.length < 2) return null;

  const panel = (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="flex h-11 flex-none items-center gap-2 px-3">
        <ListTree aria-hidden="true" className="size-4 text-muted" />
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold text-primary">
          {t.workspace.conversationNavigator}
        </h2>
        <Button
          aria-label={t.workspace.collapseConversationNavigator}
          className="size-7"
          onClick={() => {
            if (compact) setOverlayOpen(false);
            else setExpanded(false);
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <PanelRightClose className="size-3.5" />
        </Button>
      </div>

      <nav
        aria-label={t.workspace.conversationNavigator}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 [scrollbar-width:thin]"
        data-navigator-list
        onKeyDown={handleListKeyDown}
      >
        <ol className="space-y-1">
          {entries.map((entry, index) => {
            const active = entry.id === activeId;
            const live = running && index === entries.length - 1;
            return (
              <li key={entry.id}>
                <button
                  aria-current={active ? "location" : undefined}
                  className={cn(
                    "group flex min-h-12 w-full cursor-pointer items-start gap-2 rounded-control px-2 py-2 text-left outline-none transition-colors duration-[var(--motion-fast)] focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-selected text-primary"
                      : "text-muted hover:bg-hover hover:text-primary",
                  )}
                  onClick={() => navigateTo(entry.id)}
                  ref={(element) => {
                    if (element) itemRefs.current.set(entry.id, element);
                    else itemRefs.current.delete(entry.id);
                  }}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 w-5 flex-none font-ui-mono text-[10px] leading-4 text-dim"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="line-clamp-2 min-w-0 flex-1 text-xs leading-5">
                    {entry.title}
                  </span>
                  {live ? (
                    <span
                      aria-hidden="true"
                      className="mt-1.5 size-1.5 flex-none rounded-full bg-accent"
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex-none px-2 py-2">
        <Button
          className="w-full justify-start"
          disabled={atLatest}
          onClick={jumpToLatest}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ArrowDownToLine className="size-3.5" />
          {t.workspace.jumpToLatest}
        </Button>
      </div>
    </div>
  );

  if (!compact && expanded) {
    return (
      <aside
        aria-label={t.workspace.conversationNavigator}
        className="flex h-full w-56 flex-none border-l border-line-subtle bg-canvas"
        ref={rootRef}
      >
        {panel}
      </aside>
    );
  }

  return (
    <aside
      aria-label={t.workspace.conversationNavigator}
      className="relative flex h-full w-9 flex-none justify-center bg-canvas pt-2"
      ref={rootRef}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-expanded={compact ? overlayOpen : false}
            aria-label={t.workspace.expandConversationNavigator}
            className="size-8"
            data-navigator-trigger
            onClick={() => {
              if (compact) setOverlayOpen((open) => !open);
              else setExpanded(true);
            }}
            size="icon-sm"
            type="button"
            variant={overlayOpen ? "secondary" : "ghost"}
          >
            <PanelRightOpen className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {t.workspace.expandConversationNavigator}
        </TooltipContent>
      </Tooltip>

      {compact && overlayOpen ? (
        <div className="absolute top-0 right-9 bottom-0 z-30 flex w-60 overflow-hidden border border-line-subtle bg-canvas shadow-[var(--shadow-floating)]">
          {panel}
        </div>
      ) : null}
    </aside>
  );
}
