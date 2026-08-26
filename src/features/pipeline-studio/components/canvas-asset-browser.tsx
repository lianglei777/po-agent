"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CanvasMediaType, CanvasNode, PipelineAsset } from "@/contracts/pipeline";
import { FileImage, FileMusic, FileText, FileVideo, Images, Search } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { resolveCanvasMediaSource } from "../model/canvas-media-source";
import { ResourcePreviewThumbnail } from "./resource-preview-thumbnail";

type BrowserTab = "canvas" | "assets";
type MediaFilter = "all" | CanvasMediaType;

export function CanvasAssetBrowser({
  projectId,
  nodes,
  onLocateNode,
}: {
  projectId: string;
  nodes: CanvasNode[];
  onLocateNode: (nodeId: string) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<BrowserTab>("canvas");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<PipelineAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    pipelineStudioApi.getAssets(projectId, controller.signal)
      .then((response) => setAssets(response.assets))
      .catch(() => setAssets([]))
      .finally(() => setLoadingAssets(false));
    return () => controller.abort();
  }, [projectId]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const canvasItems = useMemo(() => nodes.filter((node) => {
    if (!node.data) return false;
    if (filter !== "all" && node.data.type !== filter) return false;
    return !normalizedQuery || node.data.name.toLocaleLowerCase().includes(normalizedQuery);
  }), [filter, nodes, normalizedQuery]);
  const assetItems = useMemo(() => assets.filter((asset) => !normalizedQuery || asset.name.toLocaleLowerCase().includes(normalizedQuery)), [assets, normalizedQuery]);
  const canvasNodeByAssetId = useMemo(() => new Map(nodes.flatMap((node) => node.data?.legacyEntity?.type === "asset"
    ? [[node.data.legacyEntity.id, node] as const]
    : [])), [nodes]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--pl-surface)]">
      <div className="flex h-12 items-center gap-1 border-b border-[var(--pl-border)] px-3">
        <TabButton active={tab === "canvas"} onClick={() => setTab("canvas")}>{t.pipeline.canvasElements}</TabButton>
        <TabButton active={tab === "assets"} onClick={() => setTab("assets")}>{t.pipeline.canvasProjectAssets}</TabButton>
      </div>
      <label className="mx-3 mt-3 flex h-8 items-center gap-2 rounded-md bg-[var(--pl-surface-subtle)] px-2.5 transition-colors hover:bg-[var(--pl-surface-hover)] focus-within:ring-1 focus-within:ring-[var(--pl-accent-hover)]">
        <Search className="size-3.5 text-[var(--pl-text-muted)]" />
        <span className="sr-only">{t.pipeline.canvasAssetSearch}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.pipeline.canvasAssetSearch}
          className="min-w-0 flex-1 bg-transparent text-xs text-[var(--pl-text)] outline-none placeholder:text-[var(--pl-text-muted)]"
        />
      </label>
      {tab === "canvas" ? (
        <div className="flex gap-0.5 overflow-x-auto px-3 py-2.5">
          {(["all", "text", "image", "video", "audio"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`h-6 shrink-0 rounded-md px-2 text-caption font-medium transition-colors ${filter === value ? "bg-[var(--pl-surface-hover)] text-[var(--pl-text)]" : "text-[var(--pl-text-muted)] hover:text-[var(--pl-text-secondary)]"}`}
            >
              {mediaFilterLabel(value, t.pipeline)}
            </button>
          ))}
        </div>
      ) : <div className="h-2" />}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {tab === "canvas" ? (
          canvasItems.length ? canvasItems.map((node) => (
            <ResourceRow
              key={node.id}
              mediaType={node.data!.type}
              label={node.data!.name}
              previewNode={node}
              onClick={() => onLocateNode(node.id)}
            />
          )) : <EmptyState label={t.pipeline.canvasElementsEmpty} />
        ) : loadingAssets ? (
          <EmptyState label={t.pipeline.canvasAssetsLoading} />
        ) : assetItems.length ? assetItems.map((asset) => {
          const canvasNode = canvasNodeByAssetId.get(asset.id);
          return (
            <ResourceRow
              key={asset.id}
              mediaType="image"
              label={asset.name}
              meta={canvasNode ? undefined : t.pipeline.canvasAssetNotOnCanvas}
              previewNode={canvasNode}
              disabled={!canvasNode}
              onClick={() => canvasNode && onLocateNode(canvasNode.id)}
            />
          );
        }) : <EmptyState label={t.pipeline.canvasAssetsEmpty} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${active ? "bg-[var(--pl-surface-hover)] text-[var(--pl-text)]" : "text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-subtle)] hover:text-[var(--pl-text)]"}`}
    >
      {children}
    </button>
  );
}

function ResourceRow({ mediaType, label, meta, previewNode, disabled = false, onClick }: {
  mediaType: CanvasMediaType;
  label: string;
  meta?: string;
  previewNode?: CanvasNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = mediaType === "text" ? FileText : mediaType === "image" ? FileImage : mediaType === "video" ? FileVideo : FileMusic;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex h-11 w-full items-center gap-2.5 rounded-md px-2 text-left transition-colors hover:bg-[var(--pl-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent-hover)] disabled:cursor-default disabled:opacity-45"
    >
      <ResourceThumbnail node={previewNode} mediaType={mediaType} label={label} fallback={<Icon className="size-3.5 text-[var(--pl-text-muted)]" />} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium leading-4 text-[var(--pl-text)]">{label}</span>
        {meta ? <span className="block truncate text-caption leading-3.5 text-[var(--pl-text-muted)]">{meta}</span> : null}
      </span>
    </button>
  );
}

function ResourceThumbnail({ node, mediaType, label, fallback }: {
  node?: CanvasNode;
  mediaType: CanvasMediaType;
  label: string;
  fallback: ReactNode;
}) {
  const source = resolveCanvasMediaSource(node?.id ?? "", node?.data);
  return (
    <ResourcePreviewThumbnail
      mediaType={mediaType}
      label={label}
      url={source?.url ?? null}
      poster={node?.data?.poster}
      size="browser"
      fallback={fallback}
    />
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-caption text-[var(--pl-text-muted)]">
      <Images className="size-5" />
      {label}
    </div>
  );
}

function mediaFilterLabel(value: MediaFilter, labels: Record<string, string>) {
  if (value === "all") return labels.canvasFilterAll;
  if (value === "text") return labels.canvasFilterText;
  if (value === "image") return labels.canvasFilterImage;
  if (value === "video") return labels.canvasFilterVideo;
  return labels.canvasFilterAudio;
}
