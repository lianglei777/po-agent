"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AtSign,
  ChevronDown,
  File,
  FileCode2,
  Folder,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useI18n } from "@/i18n/use-i18n";
import { loadDirectory } from "./api";
import { joinPath, relativePath } from "./path";
import type { FileEntry } from "./types";

export type FileTreeProps = {
  cwd: string;
  onAtMention?: (path: string) => void;
  onOpenFile: (path: string, name: string, contentType?: string) => void;
  refreshKey?: number;
};

export function FileTree({
  cwd,
  onAtMention,
  onOpenFile,
  refreshKey = 0,
}: FileTreeProps) {
  const [entriesByPath, setEntriesByPath] = useState<Record<string, FileEntry[]>>(
    {},
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const { t } = useI18n();

  const load = useCallback(
    async (path: string) => {
      setLoading((current) => new Set(current).add(path));
      try {
        const entries = await loadDirectory(path);
        setEntriesByPath((current) => ({ ...current, [path]: entries }));
        setError("");
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : t.files.unableToLoadFiles,
        );
      } finally {
        setLoading((current) => {
          const next = new Set(current);
          next.delete(path);
          return next;
        });
      }
    },
    [t.files.unableToLoadFiles],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(cwd), 0);
    return () => window.clearTimeout(timer);
  }, [cwd, load]);

  useEffect(() => {
    if (!refreshKey) return;
    const timer = window.setTimeout(() => {
      void load(cwd);
      expanded.forEach((path) => void load(path));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [cwd, expanded, load, refreshKey]);

  async function toggleDirectory(path: string) {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else {
      next.add(path);
      if (!entriesByPath[path]) await load(path);
    }
    setExpanded(next);
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-canvas">
      <div className="flex h-9 flex-none items-center border-b border-line-subtle px-2 text-meta font-medium text-muted">
        <span className="flex-1">{t.files.explorer}</span>
        <Button
          aria-label={t.files.refreshFiles}
          className="size-7"
          onClick={() => void load(cwd)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {error ? (
          <div className="p-3 text-meta text-destructive-text">
            <p>{error}</p>
            <Button
              className="mt-2"
              onClick={() => void load(cwd)}
              size="sm"
              variant="outline"
            >
              {t.common.retry}
            </Button>
          </div>
        ) : (
          <FileNodes
            cwd={cwd}
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

  return entries.map((entry) => {
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
          aria-label={entry.name}
          className="group flex h-6 cursor-pointer items-center rounded-sm px-1 text-meta hover:bg-hover focus-within:bg-selected focus-within:text-primary"
          onClick={() =>
            entry.isDir ? void onToggle(path) : onOpenFile(path, entry.name, entry.contentType)
          }
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              if (entry.isDir) {
                void onToggle(path);
              } else {
                onOpenFile(path, entry.name, entry.contentType);
              }
            }
          }}
          role="button"
          style={{ paddingLeft: `${6 + depth * 14}px` }}
          tabIndex={0}
          title={path}
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
          {onAtMention ? (
            <Button
              aria-label={`${text.mention} ${entry.name}`}
              className="hidden size-6 group-hover:inline-flex group-focus-within:inline-flex"
              onClick={(event) => {
                event.stopPropagation();
                onAtMention(relativePath(cwd, path));
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <AtSign className="size-3" />
            </Button>
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
