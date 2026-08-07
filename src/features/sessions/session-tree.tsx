"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Dropdown, Input, type InputRef } from "antd";
import {
  ChevronDown,
  GitFork,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n/use-i18n";
import { deleteSession, renameSession } from "./api";
import { getSessionTitle } from "./session-utils";
import type { SessionInfo, SessionTreeNode } from "./types";

export function SessionTree({
  nodes,
  selectedSessionId,
  onSelect,
  onChanged,
  onDeleted,
}: {
  nodes: SessionTreeNode[];
  selectedSessionId: string | null;
  onSelect: (session: SessionInfo) => void;
  onChanged: () => Promise<void>;
  onDeleted: (session: SessionInfo) => void;
}) {
  return nodes.map((node) => (
    <SessionTreeItem
      key={node.session.id}
      node={node}
      onChanged={onChanged}
      onDeleted={onDeleted}
      onSelect={onSelect}
      selectedSessionId={selectedSessionId}
    />
  ));
}

function SessionTreeItem({
  node,
  selectedSessionId,
  onSelect,
  onChanged,
  onDeleted,
  depth = 0,
}: {
  node: SessionTreeNode;
  selectedSessionId: string | null;
  onSelect: (session: SessionInfo) => void;
  onChanged: () => Promise<void>;
  onDeleted: (session: SessionInfo) => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="py-px">
      <SessionRow
        collapsed={collapsed}
        depth={depth}
        hasChildren={node.children.length > 0}
        onChanged={onChanged}
        onDeleted={onDeleted}
        onSelect={onSelect}
        onToggle={() => setCollapsed((current) => !current)}
        selected={node.session.id === selectedSessionId}
        session={node.session}
      />
      {!collapsed && node.children.length ? (
        <div className="ml-4 mt-1 mb-1 border-l border-line-subtle pl-1.5">
          {node.children.map((child) => (
            <SessionTreeItem
              depth={depth + 1}
              key={child.session.id}
              node={child}
              onChanged={onChanged}
              onDeleted={onDeleted}
              onSelect={onSelect}
              selectedSessionId={selectedSessionId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SessionRow({
  session,
  selected,
  depth,
  hasChildren,
  collapsed,
  onToggle,
  onSelect,
  onChanged,
  onDeleted,
}: {
  session: SessionInfo;
  selected: boolean;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (session: SessionInfo) => void;
  onChanged: () => Promise<void>;
  onDeleted: (session: SessionInfo) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // 菜单打开时保持触发按钮可见，同时不挤压会话标题的布局空间。
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(session.name ?? "");
  const [error, setError] = useState("");
  const inputRef = useRef<InputRef>(null);
  const title = getSessionTitle(session);
  const { t } = useI18n();
  const isDraft = Boolean(session.draft);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function submitRename() {
    const nextName = value.trim();
    if (!nextName || nextName === (session.name ?? "")) {
      setEditing(false);
      setValue(session.name ?? "");
      return;
    }
    setBusy(true);
    try {
      await renameSession(session.id, nextName);
      await onChanged();
      setEditing(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.sessions.renameFailed);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteSession(session.id);
      onDeleted(session);
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.sessions.deleteFailed);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex h-9 items-center gap-1 px-2">
        <Input
          aria-invalid={Boolean(error)}
          aria-label={`${t.sessions.rename} ${title}`}
          className="text-xs"
          disabled={busy}
          onBlur={submitRename}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submitRename();
            if (event.key === "Escape") {
              setEditing(false);
              setValue(session.name ?? "");
            }
          }}
          ref={inputRef}
          size="small"
          value={value}
        />
        {error ? <span className="sr-only">{error}</span> : null}
      </div>
    );
  }

  return (
    <>
      <div
        className={`group relative mx-1 flex h-9 min-w-0 cursor-pointer items-center rounded-md border pr-1 transition-colors duration-[var(--motion-fast)] focus-within:bg-hover ${
          selected
            ? "border-transparent bg-selected"
            : hasChildren && !collapsed
              ? "border-transparent hover:bg-hover"
              : "border-transparent hover:bg-hover"
        }`}
        onClick={() => onSelect(session)}
        onDoubleClick={(event) => {
          if (isDraft) return;
          event.stopPropagation();
          setEditing(true);
          setError("");
        }}
        style={{ paddingLeft: `${depth * 12}px` }}
        title={title}
      >
        {hasChildren ? (
          <Button
            aria-label={
              collapsed
                ? t.sessions.expandForks
                : t.sessions.collapseForks
            }
            className="size-6"
            htmlType="button"
            icon={
              <ChevronDown
                className={`size-3 transition-transform ${collapsed ? "-rotate-90" : ""}`}
              />
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            size="small"
            type="text"
          />
        ) : depth ? (
          <GitFork className="mx-1.5 size-3 flex-none text-dim" />
        ) : (
          <span className="w-6 flex-none" />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-xs ${selected ? "font-semibold text-primary" : "font-medium text-primary"}`}
        >
          {title}
        </span>
        {error && !confirming ? (
          <span
            className="ml-2 min-w-0 max-w-28 flex-none truncate text-caption tabular-nums text-destructive-text"
            title={error}
          >
            {error}
          </span>
        ) : isDraft ? (
          <span className="ml-2 min-w-0 max-w-28 flex-none truncate text-caption tabular-nums text-dim">
            {t.sessions.draftHint}
          </span>
        ) : null}
        {isDraft ? null : (
          <div
            className={`absolute right-1 top-1/2 -translate-y-1/2 bg-inherit opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100 group-focus-within:opacity-100 ${
              menuOpen ? "opacity-100" : ""
            }`}
          >
            <Dropdown
              menu={{
                items: [
                  {
                    icon: <Pencil className="size-3.5" />,
                    key: "rename",
                    label: t.sessions.rename,
                    onClick: () => {
                      setEditing(true);
                      setError("");
                    },
                  },
                  {
                    danger: true,
                    icon: <Trash2 className="size-3.5" />,
                    key: "delete",
                    label: t.common.delete,
                    onClick: () => {
                      setConfirming(true);
                      setError("");
                    },
                  },
                ],
              }}
              onOpenChange={setMenuOpen}
              open={menuOpen}
              placement="bottomRight"
              trigger={["click"]}
            >
              <Button
                aria-label={t.sessions.sessionActions}
                className="size-7"
                htmlType="button"
                icon={<MoreHorizontal className="size-3.5" />}
                onClick={(event) => event.stopPropagation()}
                size="small"
                type="text"
              />
            </Dropdown>
          </div>
        )}
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open && !busy) setConfirming(false);
        }}
        open={confirming}
      >
        <DialogContent
          className="sm:max-w-[420px]"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>{t.sessions.deleteSessionTitle}</DialogTitle>
            <DialogDescription>
              {t.sessions.deleteSessionDescription.replace("{session}", title)}
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p className="text-sm text-destructive-text" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              autoFocus
              disabled={busy}
              htmlType="button"
              onClick={() => setConfirming(false)}
            >
              {t.common.cancel}
            </Button>
            <Button
              danger
              disabled={busy}
              htmlType="button"
              loading={busy}
              onClick={() => void remove()}
              type="primary"
            >
              {busy
                ? t.sessions.deletingSession
                : t.sessions.deleteSessionAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
