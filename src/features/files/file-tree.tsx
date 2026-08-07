"use client";

import { useCallback, useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { Alert, Button, Skeleton, Tooltip } from "antd";
import {
  AtSign,
  ChevronDown,
  File,
  FileCode2,
  Folder,
  FolderOpen,
  PanelLeftClose,
  RefreshCw,
} from "@/components/icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/i18n/use-i18n";
import { loadDirectory } from "./api";
import {
  compactGeneratedEntries,
  isGeneratedArtifactsPath,
} from "./file-tree-model";
import { joinPath, relativePath } from "./path";
import { useFilesStore } from "./state/files-store-provider";
import type { FileEntry } from "./types";

export type FileTreeProps = {
  cwd: string;
  onAtMention?: (path: string) => void;
  onCollapse?: () => void;
  onOpenFile: (path: string, name: string, contentType?: string) => void;
  refreshKey?: number;
};

export function FileTree({
  cwd,
  onAtMention,
  onCollapse,
  onOpenFile,
  refreshKey = 0,
}: FileTreeProps) {
  const {
    entriesByPath,
    error,
    expanded,
    loading,
    resetTree,
    setEntriesByPath,
    setError,
    setExpanded,
    setLoading,
  } = useFilesStore(
    useShallow(
      ({
        entriesByPath,
        error,
        expanded,
        loading,
        resetTree,
        setEntriesByPath,
        setError,
        setExpanded,
        setLoading,
      }) => ({
        entriesByPath,
        error,
        expanded,
        loading,
        resetTree,
        setEntriesByPath,
        setError,
        setExpanded,
        setLoading,
      }),
    ),
  );
  const { t } = useI18n();
  // 当前项目的目录请求共享取消信号，切换项目时统一失效。
  const treeRequestRef = useRef(new AbortController());

  const load = useCallback(
    async (
      path: string,
      signal: AbortSignal = treeRequestRef.current.signal,
    ) => {
      setLoading((current) => new Set(current).add(path));
      try {
        const entries = await loadDirectory(path, signal);
        if (signal.aborted) return null;
        setEntriesByPath((current) => ({ ...current, [path]: entries }));
        setError("");
        return entries;
      } catch (cause) {
        if (signal.aborted) return null;
        setError(
          cause instanceof Error ? cause.message : t.files.unableToLoadFiles,
        );
      } finally {
        if (!signal.aborted) {
          setLoading((current) => {
            const next = new Set(current);
            next.delete(path);
            return next;
          });
        }
      }
      return null;
    },
    [setEntriesByPath, setError, setLoading, t.files.unableToLoadFiles],
  );

  useEffect(() => {
    treeRequestRef.current.abort();
    const controller = new AbortController();
    treeRequestRef.current = controller;
    resetTree();
    const timer = window.setTimeout(
      () => void load(cwd, controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cwd, load, resetTree]);

  const refreshDirectory = useCallback(
    async (path: string) => {
      const entries = await load(path);
      if (!entries || !isGeneratedArtifactsPath(cwd, path)) return;
      await Promise.all(
        entries.filter((entry) => entry.isDir).map((entry) => load(entry.path)),
      );
    },
    [cwd, load],
  );

  useEffect(() => {
    if (!refreshKey) return;
    const timer = window.setTimeout(() => {
      void load(cwd);
      expanded.forEach((path) => void refreshDirectory(path));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cwd, expanded, load, refreshDirectory, refreshKey]);

  async function toggleDirectory(path: string) {
    const next = new Set(expanded);
    if (next.has(path)) {
      next.delete(path);
      setExpanded(next);
    } else {
      next.add(path);
      setExpanded(next);
      const entries = entriesByPath[path] ?? (await load(path));
      if (entries && isGeneratedArtifactsPath(cwd, path)) {
        await Promise.all(
          entries
            .filter((entry) => entry.isDir && !entriesByPath[entry.path])
            .map((entry) => load(entry.path)),
        );
      }
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
      <div className="flex h-9 flex-none items-center border-b border-line-subtle px-2 text-meta font-medium text-muted">
        <span className="flex-1">{t.files.explorer}</span>
        {onCollapse ? (
          <Tooltip placement="bottom" title={t.files.hideExplorer}>
            <span className="inline-flex">
              <Button
                aria-label={t.files.hideExplorer}
                className="size-7"
                htmlType="button"
                icon={<PanelLeftClose className="size-3.5" />}
                onClick={onCollapse}
                size="small"
                type="text"
              />
            </span>
          </Tooltip>
        ) : null}
        <Tooltip placement="bottom" title={t.files.refreshFiles}>
          <span className="inline-flex">
            <Button
              aria-label={t.files.refreshFiles}
              className="size-7"
              htmlType="button"
              icon={<RefreshCw className="size-3.5" />}
              onClick={() => void load(cwd)}
              size="small"
              type="text"
            />
          </span>
        </Tooltip>
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1">
        {error ? (
          <Alert
            action={
              <Button
                htmlType="button"
                onClick={() => void load(cwd)}
                size="small"
              >
                {t.common.retry}
              </Button>
            }
            className="m-2"
            showIcon
            title={error}
            type="error"
          />
        ) : loading.has(cwd) && !entriesByPath[cwd] ? (
          <Skeleton
            active
            className="p-3"
            paragraph={{ rows: 6 }}
            title={false}
          />
        ) : (
          <FileNodes
            cwd={cwd}
            directoryPath={cwd}
            entries={entriesByPath[cwd] ?? []}
            entriesByPath={entriesByPath}
            expanded={expanded}
            loading={loading}
            onAtMention={onAtMention}
            onOpenFile={onOpenFile}
            onToggle={toggleDirectory}
            text={{
              empty: t.files.empty,
              loading: t.files.loading,
              mention: t.files.mention,
            }}
          />
        )}
      </ScrollArea>
    </section>
  );
}

function FileNodes({
  cwd,
  directoryPath,
  entries,
  entriesByPath,
  expanded,
  loading,
  text,
  onToggle,
  onOpenFile,
  onAtMention,
  depth = 0,
}: {
  cwd: string;
  directoryPath: string;
  entries: FileEntry[];
  entriesByPath: Record<string, FileEntry[]>;
  expanded: Set<string>;
  loading: Set<string>;
  text: { empty: string; loading: string; mention: string };
  onToggle: (path: string) => Promise<void>;
  onOpenFile: (path: string, name: string, contentType?: string) => void;
  onAtMention?: (path: string) => void;
  depth?: number;
}) {
  if (!entries.length) {
    return <div className="px-4 py-2 text-caption text-dim">{text.empty}</div>;
  }

  const displayEntries = compactGeneratedEntries({
    cwd,
    directoryPath,
    entries,
    entriesByPath,
  });

  return displayEntries.map(({ entry, runName }) => {
    const path = entry.path || joinPath(cwd, entry.name);
    const isExpanded = expanded.has(path);
    const Icon = entry.isDir
      ? isExpanded
        ? FolderOpen
        : Folder
      : /\.(tsx?|jsx?|json|css|html|md)$/i.test(entry.name)
        ? FileCode2
        : File;
    return (
      <div key={path}>
        <div
          className="group flex h-6 cursor-pointer items-center rounded-sm px-1 text-meta hover:bg-hover focus-within:bg-selected focus-within:text-primary"
          style={{ paddingLeft: `${6 + depth * 14}px` }}
        >
          <button
            aria-label={entry.name}
            className="flex h-full min-w-0 flex-1 cursor-pointer items-center border-0 bg-transparent p-0 text-left text-inherit"
            onClick={() =>
              entry.isDir
                ? void onToggle(path)
                : onOpenFile(path, entry.name, entry.contentType)
            }
            title={path}
            type="button"
          >
            {entry.isDir ? (
              <ChevronDown
                className={`mr-1 size-3 flex-none transition-transform duration-[var(--motion-standard)] ${
                  isExpanded ? "" : "-rotate-90"
                }`}
              />
            ) : (
              <span className="mr-1 w-3" />
            )}
            <Icon className="mr-1.5 size-3.5 flex-none text-muted" />
            <span className="min-w-0 flex-1 truncate">{entry.name}</span>
            {runName ? (
              <span className="ml-2 max-w-16 flex-none truncate font-ui-mono text-caption text-dim">
                {runName.slice(0, 8)}
              </span>
            ) : null}
          </button>
          {onAtMention ? (
            <Tooltip
              placement="left"
              title={`${text.mention} ${entry.name}`}
            >
              <span className="hidden group-hover:inline-flex group-focus-within:inline-flex">
                <Button
                  aria-label={`${text.mention} ${entry.name}`}
                  className="size-6"
                  htmlType="button"
                  icon={<AtSign className="size-3" />}
                  onClick={(event) => {
                    event.stopPropagation();
                    onAtMention(relativePath(cwd, path));
                  }}
                  size="small"
                  type="text"
                />
              </span>
            </Tooltip>
          ) : null}
        </div>
        {entry.isDir && isExpanded ? (
          loading.has(path) ? (
            <div
              className="h-6 text-caption text-dim"
              style={{ paddingLeft: `${20 + depth * 14}px` }}
            >
              {text.loading}
            </div>
          ) : (
            <FileNodes
              cwd={cwd}
              directoryPath={path}
              depth={depth + 1}
              entries={entriesByPath[path] ?? []}
              entriesByPath={entriesByPath}
              expanded={expanded}
              loading={loading}
              onAtMention={onAtMention}
              onOpenFile={onOpenFile}
              onToggle={onToggle}
              text={text}
            />
          )
        ) : null}
      </div>
    );
  });
}
