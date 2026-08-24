"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CanvasMediaType, CanvasNode, PipelineAsset } from "@/contracts/pipeline";
import { FileImage, FileMusic, FileText, FileVideo, Images, Search } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";

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
    ? [[node.data.legacyEntity.id, node.id] as const]
    : [])), [nodes]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-2 border-b border-[var(--pl-border)]">
        <TabButton active={tab === "canvas"} onClick={() => setTab("canvas")}>{t.pipeline.canvasElements}</TabButton>
        <TabButton active={tab === "assets"} onClick={() => setTab("assets")}>{t.pipeline.canvasProjectAssets}</TabButton>
      </div>
      <label className="mx-4 mt-4 flex h-9 items-center gap-2 rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 focus-within:border-[var(--pl-accent)]">
        <Search className="size-4 text-[var(--pl-text-muted)]" />
        <span className="sr-only">{t.pipeline.canvasAssetSearch}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.pipeline.canvasAssetSearch}
          className="min-w-0 flex-1 bg-transparent text-xs text-[var(--pl-text)] outline-none placeholder:text-[var(--pl-text-muted)]"
        />
      </label>
      {tab === "canvas" ? (
        <div className="flex gap-1 overflow-x-auto px-4 py-3">
          {(["all", "text", "image", "video", "audio"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] ${filter === value ? "bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]" : "text-[var(--pl-text-muted)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]"}`}
            >
              {mediaFilterLabel(value, t.pipeline)}
            </button>
          ))}
        </div>
      ) : <div className="h-3" />}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {tab === "canvas" ? (
          canvasItems.length ? canvasItems.map((node) => (
            <ResourceRow
              key={node.id}
              mediaType={node.data!.type}
              label={node.data!.name}
              meta={t.pipeline.canvasLocateHint}
              onClick={() => onLocateNode(node.id)}
            />
          )) : <EmptyState label={t.pipeline.canvasElementsEmpty} />
        ) : loadingAssets ? (
          <EmptyState label={t.pipeline.canvasAssetsLoading} />
        ) : assetItems.length ? assetItems.map((asset) => {
          const nodeId = canvasNodeByAssetId.get(asset.id);
          return (
            <ResourceRow
              key={asset.id}
              mediaType="image"
              label={asset.name}
              meta={nodeId ? t.pipeline.canvasLocateHint : t.pipeline.canvasAssetNotOnCanvas}
              disabled={!nodeId}
              onClick={() => nodeId && onLocateNode(nodeId)}
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
      className={`border-b-2 px-3 py-3 text-xs font-medium ${active ? "border-[var(--pl-accent)] text-[var(--pl-text)]" : "border-transparent text-[var(--pl-text-muted)] hover:text-[var(--pl-text)]"}`}
    >
      {children}
    </button>
  );
}

function ResourceRow({ mediaType, label, meta, disabled = false, onClick }: {
  mediaType: CanvasMediaType;
  label: string;
  meta: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const Icon = mediaType === "text" ? FileText : mediaType === "image" ? FileImage : mediaType === "video" ? FileVideo : FileMusic;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[var(--pl-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:cursor-default disabled:opacity-45"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)]">
        <Icon className="size-4 text-[var(--pl-text-secondary)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-[var(--pl-text)]">{label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-[var(--pl-text-muted)]">{meta}</span>
      </span>
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center text-xs text-[var(--pl-text-muted)]">
      <Images className="size-6" />
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
