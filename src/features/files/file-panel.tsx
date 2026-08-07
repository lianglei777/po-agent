"use client";

import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Alert, Breadcrumb, Button, Empty, Skeleton, Tooltip } from "antd";
import { ChevronRight, FileText, PanelLeftOpen } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { MediaPreview } from "@/components/ui/media-preview";
import { loadFile, rawFileUrl } from "./api";
import { FileTree } from "./file-tree";
import { relativePath } from "./path";
import {
  FilesStoreProvider,
  useFilesStore,
} from "./state/files-store-provider";
import type { OpenFile } from "./types";

export type { OpenFile } from "./types";

export function FilePanel({
  ...props
}: FilePanelProps) {
  return (
    <FilesStoreProvider>
      <FilePanelContent {...props} />
    </FilesStoreProvider>
  );
}

type FilePanelProps = {
  cwd?: string | null;
  file: OpenFile | null;
  onAtMention?: (path: string) => void;
  onOpenFile?: (path: string, name: string, contentType?: string) => void;
  refreshKey?: number;
};

function FilePanelContent({
  cwd,
  file,
  onAtMention,
  onOpenFile,
  refreshKey = 0,
}: FilePanelProps) {
  const { t } = useI18n();
  const { explorerVisible, setExplorerVisible } = useFilesStore(
    useShallow(({ explorerVisible, setExplorerVisible }) => ({
      explorerVisible,
      setExplorerVisible,
    })),
  );
  const currentPath = file?.path ?? null;
  const pathSegments = currentPath && cwd
    ? relativePath(cwd, currentPath).split("/").filter(Boolean)
    : [];

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-canvas">
      {currentPath ? (
        <div className="flex h-9 flex-none items-stretch border-b border-line-subtle bg-canvas text-meta text-muted">
          <Tooltip placement="bottomLeft" title={currentPath}>
            <span className="flex min-w-0 flex-1 items-center overflow-hidden px-3">
              <Breadcrumb
                aria-label={t.files.currentFilePath}
                className="min-w-0 overflow-hidden font-ui-mono text-meta"
                items={pathSegments.map((segment, index) => ({
                  title: (
                    <span
                      className={
                        index === pathSegments.length - 1
                          ? "text-primary"
                          : "text-muted"
                      }
                    >
                      {segment}
                    </span>
                  ),
                }))}
                separator={
                  <ChevronRight className="size-3 shrink-0 text-dim" />
                }
              />
            </span>
          </Tooltip>
          {!explorerVisible ? (
            <Tooltip placement="bottom" title={t.files.showExplorer}>
              <span className="mr-1.5 inline-flex self-center">
                <Button
                  aria-label={t.files.showExplorer}
                  htmlType="button"
                  icon={<PanelLeftOpen className="size-3.5" />}
                  onClick={() => setExplorerVisible(true)}
                  size="small"
                  type="text"
                />
              </span>
            </Tooltip>
          ) : null}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        {cwd && onOpenFile && explorerVisible ? (
          <aside
            className={`flex min-w-0 shrink-0 overflow-hidden bg-canvas ${
              file
                ? "w-[clamp(152px,32%,192px)] border-r border-line-subtle"
                : "w-full"
            }`}
          >
            <FileTree
              cwd={cwd}
              onAtMention={onAtMention}
              onCollapse={file ? () => setExplorerVisible(false) : undefined}
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
      <Empty
        className="m-0 text-muted"
        description={t.files.noFileOpen}
        image={<FileText className="mx-auto size-8 text-dim" />}
      />
    </div>
  );
}

function LoadedFile({ file }: { file: OpenFile }) {
  if (file.contentType?.startsWith("image/") || file.contentType?.startsWith("video/") || file.contentType?.startsWith("audio/")) {
    return (
      <MediaPreview
        contentType={file.contentType}
        name={file.name}
        src={rawFileUrl(file.path)}
      />
    );
  }
  return <LoadedTextFile file={file} />;
}

function LoadedTextFile({ file }: { file: OpenFile }) {
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
    return (
      <Skeleton
        active
        aria-label={t.files.loading}
        className="p-4"
        paragraph={{ rows: 8 }}
        title={false}
      />
    );
  }
  if (result.error) {
    return (
      <Alert
        className="m-3"
        showIcon
        title={result.error}
        type="error"
      />
    );
  }
  return (
    <pre className="m-0 min-h-0 flex-1 overflow-auto p-4 font-ui-mono text-xs leading-5 whitespace-pre-wrap text-primary">
      {result.content}
    </pre>
  );
}
