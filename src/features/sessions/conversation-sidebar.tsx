"use client";

import {
  MessageSquarePlus,
  PanelLeftOpen,
  PanelRight,
  Search,
} from "@/components/icons";
import { useMemo, useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { ScrollArea } from "@/components/ui/scroll-area";
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
          <Tooltip
            mouseEnterDelay={0.35}
            placement="bottom"
            title={t.workspace.expandPrimaryNavigation}
          >
            <Button
              aria-label={t.workspace.expandPrimaryNavigation}
              className="text-muted"
              htmlType="button"
              icon={<PanelLeftOpen />}
              onClick={onExpandPrimaryNavigation}
              size="small"
              type="text"
            />
          </Tooltip>
        </header>
      ) : null}

      <header className="flex h-11 flex-none items-center px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-primary">
            {projectName}
          </p>
        </div>
        <Tooltip mouseEnterDelay={0.35} title={t.workspace.hideConversations}>
          <Button
            aria-label={t.workspace.hideConversations}
            htmlType="button"
            icon={<PanelRight />}
            onClick={onClose}
            size="small"
            type="text"
          />
        </Tooltip>
      </header>

      <div className="space-y-2 px-3 pb-3">
        <Button
          block
          disabled={!navigation.selectedCwd}
          htmlType="button"
          icon={<MessageSquarePlus />}
          onClick={navigation.newSession}
        >
          {t.workspace.newChat}
        </Button>
        <Input
          allowClear
          aria-label={t.sessions.searchSessions}
          className="text-xs"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.sessions.searchSessions}
          prefix={<Search className="size-3.5 text-dim" />}
          size="small"
          value={query}
        />
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
