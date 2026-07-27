"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { useI18n } from "@/i18n/use-i18n";
import { loadFile } from "./api";
import { FileTree } from "./file-tree";
import { relativePath } from "./path";
import type { OpenFile } from "./types";

export type { OpenFile } from "./types";

export function FilePanel({
  cwd,
  file,
  onAtMention,
  onOpenFile,
  refreshKey = 0,
}: {
  cwd?: string | null;
  file: OpenFile | null;
  onAtMention?: (path: string) => void;
  onOpenFile?: (path: string, name: string) => void;
  refreshKey?: number;
}) {
  const { t } = useI18n();
  const currentPath = file?.path ?? null;
  const pathSegments = currentPath && cwd
    ? relativePath(cwd, currentPath).split("/").filter(Boolean)
    : [];

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-canvas">
      {currentPath ? (
        <div className="flex h-9 flex-none items-stretch border-b border-line-subtle bg-canvas text-meta text-muted">
          <nav
            aria-label={t.files.currentFilePath}
            className="flex min-w-0 flex-1 items-center overflow-hidden px-3"
            title={currentPath}
          >
            <ol className="flex min-w-0 items-center font-ui-mono">
              {pathSegments.map((segment, index) => (
                <li className="flex min-w-0 items-center" key={`${segment}-${index}`}>
                  {index > 0 ? <ChevronRight className="mx-1 size-3 shrink-0 text-dim" /> : null}
                  <span className={index === pathSegments.length - 1 ? "truncate text-primary" : "truncate text-muted"}>
                    {segment}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        {cwd && onOpenFile ? (
          <aside
            className={`flex shrink-0 bg-canvas ${
              file
                ? "w-[clamp(160px,42%,224px)] border-r border-line-subtle"
                : "w-full"
            }`}
          >
            <FileTree
              cwd={cwd}
              onAtMention={onAtMention}
              onOpenFile={onOpenFile}
              refreshKey={refreshKey}
            />
          </aside>
        ) : null}
        {file ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <LoadedFile file={file} key={file.path} />
          </div>
        ) : cwd && onOpenFile ? null : (
          <EmptyFile />
        )}
      </div>
    </div>
  );
}

function EmptyFile() {
  const { t } = useI18n();
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div className="text-center text-muted">
        <div className="mx-auto mb-3 grid size-9 place-items-center rounded-md border border-line-subtle bg-elevated">
          <FileText className="size-4" />
        </div>
        <p className="m-0 text-xs">{t.files.noFileOpen}</p>
      </div>
    </div>
  );
}

function LoadedFile({ file }: { file: OpenFile }) {
  const { t } = useI18n();
  const [result, setResult] = useState<{
    content: string;
    error: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadFile(file.path, controller.signal)
      .then((data) => setResult({ content: data.content ?? "", error: "" }))
      .catch((cause: unknown) => {
        if ((cause as { name?: string }).name !== "AbortError") {
          setResult({
            content: "",
            error:
              cause instanceof Error ? cause.message : t.files.unableToOpenFile,
          });
        }
      });
    return () => controller.abort();
  }, [file, t.files.unableToOpenFile]);

  if (!result) {
    return <div className="p-4 text-xs text-dim">{t.files.loading}</div>;
  }
  if (result.error) {
    return <div className="p-4 text-xs text-destructive-text">{result.error}</div>;
  }
  return (
    <pre className="m-0 min-h-0 flex-1 overflow-auto p-4 font-ui-mono text-xs leading-5 whitespace-pre-wrap text-primary">
      {result.content}
    </pre>
  );
}
