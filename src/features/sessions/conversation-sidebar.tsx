"use client";

import {
  MessageSquarePlus,
  PanelLeftOpen,
  PanelRight,
  Search,
} from "@/components/icons";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/use-i18n";
import { getProjectName, getSessionTitle } from "./session-utils";
import { SessionTree } from "./session-tree";
import type { SessionTreeNode } from "./types";
import type { SessionNavigationController } from "./use-session-navigation";

export function ConversationSidebar({
  navigation,
  onClose,
  onExpandPrimaryNavigation,
  primaryNavigationHidden,
}: {
  navigation: SessionNavigationController;
  onClose: () => void;
  onExpandPrimaryNavigation: () => void;
  primaryNavigationHidden: boolean;
}) {
  const [query, setQuery] = useState("");
  const { t } = useI18n();
  const nodes = useMemo(
    () => filterSessionNodes(navigation.currentNodes, query),
    [navigation.currentNodes, query],
  );
  const projectName = navigation.selectedCwd
    ? getProjectName(navigation.selectedCwd)
    : t.workspace.projects;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--conversation-bg)]">
      {primaryNavigationHidden ? (
        <header className="flex h-11 flex-none items-center border-b border-line-subtle px-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t.workspace.expandPrimaryNavigation}
                className="text-muted"
                onClick={onExpandPrimaryNavigation}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <PanelLeftOpen />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t.workspace.expandPrimaryNavigation}
            </TooltipContent>
          </Tooltip>
        </header>
      ) : null}

      <header className="flex h-11 flex-none items-center px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary">
            {projectName}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t.workspace.hideConversations}
              onClick={onClose}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <PanelRight />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t.workspace.hideConversations}</TooltipContent>
        </Tooltip>
      </header>

      <div className="space-y-2 px-3 pb-3">
        <Button
          className="w-full justify-center"
          disabled={!navigation.selectedCwd}
          onClick={navigation.newSession}
          type="button"
          variant="outline"
        >
          <MessageSquarePlus />
          {t.workspace.newChat}
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-dim" />
          <Input
            aria-label={t.sessions.searchSessions}
            className="h-8 pl-8 text-xs"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.sessions.searchSessions}
            value={query}
          />
        </div>
      </div>

      <ScrollArea
        className="min-h-0 flex-1"
        viewportClassName="[&>div]:block!"
      >
        {!navigation.selectedCwd ? (
          <p className="p-5 text-center text-xs leading-5 text-dim">
            {t.chat.input.selectProjectBeforeStart}
          </p>
        ) : nodes.length ? (
          <div className="space-y-0.5 px-2 py-1">
            <SessionTree
              nodes={nodes}
              onChanged={navigation.refresh}
              onDeleted={navigation.onSessionDeleted}
              onSelect={navigation.openSession}
              selectedSessionId={navigation.selectedSessionId}
            />
          </div>
        ) : (
          <p className="p-5 text-center text-xs leading-5 text-dim">
            {query ? t.sessions.noMatchingSessions : t.sessions.noSessions}
          </p>
        )}
      </ScrollArea>
    </div>
  );
}

export function filterSessionNodes(
  nodes: SessionTreeNode[],
  query: string,
): SessionTreeNode[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return nodes;

  return nodes.flatMap((node) => {
    const children = filterSessionNodes(node.children, normalized);
    if (
      getSessionTitle(node.session).toLocaleLowerCase().includes(normalized) ||
      children.length
    ) {
      return [{ ...node, children }];
    }
    return [];
  });
}
