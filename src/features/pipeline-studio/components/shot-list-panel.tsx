"use client";

import { useMemo, useState } from "react";
import { App, Button, Empty, Input, InputNumber, Select, Table, Tag, type TableProps } from "antd";
import type { CanvasEdge, CanvasNode, CanvasNodeData } from "@/contracts/pipeline";
import { useI18n } from "@/i18n/use-i18n";
import { buildShotListRows, updateShotDurations, type ShotListRow, type ShotListStatus } from "../model/shot-list";

const ALL_EPISODES = "__all__";

export function ShotListPanel({
  nodes,
  edges,
  lockedNodeIds,
  onLocateNode,
  onUpdateNodeData,
}: {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  lockedNodeIds: string[];
  onLocateNode: (nodeId: string) => void;
  onUpdateNodeData: (updates: Array<{ nodeId: string; data: CanvasNodeData }>) => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [episodeKey, setEpisodeKey] = useState(ALL_EPISODES);
  const [query, setQuery] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [batchDuration, setBatchDuration] = useState<number>(4);
  const rows = useMemo(() => buildShotListRows(nodes, edges), [edges, nodes]);
  const locked = useMemo(() => new Set(lockedNodeIds), [lockedNodeIds]);
  const episodeKeys = useMemo(() => [...new Set(rows.map((row) => row.episodeKey))], [rows]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(() => rows.filter((row) => (
    (episodeKey === ALL_EPISODES || row.episodeKey === episodeKey)
    && (!normalizedQuery || [row.spec.shotKey, row.spec.purpose, row.spec.visual, row.spec.shotSize]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
  )), [episodeKey, normalizedQuery, rows]);
  const filteredIds = useMemo(() => new Set(filtered.map((row) => row.node.id)), [filtered]);
  const activeSelection = selectedNodeIds.filter((nodeId) => filteredIds.has(nodeId) && !locked.has(nodeId));
  const totalDuration = filtered.reduce((total, row) => total + row.spec.durationSeconds, 0);

  const columns: TableProps<ShotListRow>["columns"] = [
    {
      title: t.pipeline.shotListOrder,
      key: "order",
      width: 64,
      render: (_, row) => <span className="font-mono text-caption tabular-nums text-[var(--pl-text-secondary)]">{String(row.spec.order + 1).padStart(2, "0")}</span>,
    },
    {
      title: t.pipeline.shotListEpisode,
      dataIndex: "episodeKey",
      width: 104,
      ellipsis: true,
    },
    {
      title: t.pipeline.shotListPurpose,
      key: "purpose",
      width: 250,
      ellipsis: true,
      render: (_, row) => <span title={row.spec.purpose}>{row.spec.purpose}</span>,
    },
    {
      title: t.pipeline.shotListDuration,
      key: "duration",
      width: 84,
      align: "right",
      render: (_, row) => <span className="font-mono text-caption tabular-nums">{formatDuration(row.spec.durationSeconds)}s</span>,
    },
    {
      title: t.pipeline.shotListShotSize,
      key: "shotSize",
      width: 96,
      ellipsis: true,
      render: (_, row) => row.spec.shotSize,
    },
    {
      title: t.pipeline.shotListStatus,
      key: "status",
      width: 104,
      render: (_, row) => <ShotStatus status={row.status} />,
    },
    {
      title: "",
      key: "locate",
      width: 72,
      fixed: "right",
      render: (_, row) => <Button type="link" size="small" onClick={() => onLocateNode(row.node.id)}>{t.pipeline.shotListLocate}</Button>,
    },
  ];

  const applyDuration = () => {
    const updates = updateShotDurations(rows, activeSelection, batchDuration);
    if (!updates.length) return;
    onUpdateNodeData(updates);
    void message.success(t.pipeline.shotListBatchApplied.replace("{count}", String(updates.length)));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-[var(--pl-border)] p-3">
        <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-2">
          <Select
            value={episodeKey}
            onChange={setEpisodeKey}
            aria-label={t.pipeline.shotListEpisodeFilter}
            options={[
              { value: ALL_EPISODES, label: t.pipeline.shotListAllEpisodes },
              ...episodeKeys.map((key) => ({ value: key, label: key })),
            ]}
          />
          <Input.Search value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.pipeline.shotListSearch} allowClear />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3 text-caption text-[var(--pl-text-muted)]">
            <span>{t.pipeline.shotListCount.replace("{count}", String(filtered.length))}</span>
            <span>{t.pipeline.shotListTotalDuration.replace("{duration}", formatDuration(totalDuration))}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption text-[var(--pl-text-muted)]">{t.pipeline.shotListSelected.replace("{count}", String(activeSelection.length))}</span>
            <div className="flex items-center overflow-hidden rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface)] focus-within:border-[var(--pl-accent)]">
              <InputNumber
                min={0.5}
                max={300}
                step={0.5}
                value={batchDuration}
                onChange={(value) => setBatchDuration(value ?? 4)}
                aria-label={t.pipeline.shotListBatchDuration}
                variant="borderless"
                className="w-20"
              />
              <span className="px-2 text-caption text-[var(--pl-text-muted)]" aria-hidden="true">s</span>
            </div>
            <Button type="primary" disabled={!activeSelection.length} onClick={applyDuration}>{t.pipeline.shotListApplyDuration}</Button>
          </div>
        </div>
        {!activeSelection.length && filtered.length ? <p className="text-caption text-[var(--pl-text-dim)]">{t.pipeline.shotListBatchHint}</p> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {rows.length ? (
          <Table<ShotListRow>
            rowKey={(row) => row.node.id}
            size="small"
            tableLayout="fixed"
            pagination={false}
            dataSource={filtered}
            columns={columns}
            scroll={{ x: 774, y: "calc(100vh - 230px)" }}
            rowSelection={{
              selectedRowKeys: activeSelection,
              getCheckboxProps: (row) => ({ disabled: locked.has(row.node.id), name: row.spec.purpose }),
              onChange: (keys) => setSelectedNodeIds(keys.map(String)),
            }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t.pipeline.shotListNoMatches} /> }}
            onRow={(row) => ({ onDoubleClick: () => onLocateNode(row.node.id) })}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t.pipeline.shotListEmpty} />
          </div>
        )}
      </div>
    </div>
  );
}

function ShotStatus({ status }: { status: ShotListStatus }) {
  const { t } = useI18n();
  const labels: Record<ShotListStatus, string> = {
    missing: t.pipeline.shotListStatusMissing,
    stale: t.pipeline.shotListStatusStale,
    running: t.pipeline.shotListStatusRunning,
    failed: t.pipeline.shotListStatusFailed,
    completed: t.pipeline.shotListStatusCompleted,
    configured: t.pipeline.shotListStatusConfigured,
    unconfigured: t.pipeline.shotListStatusUnconfigured,
  };
  const colors: Partial<Record<ShotListStatus, string>> = {
    stale: "warning", running: "processing", failed: "error", completed: "success", configured: "blue",
  };
  return <Tag color={colors[status]}>{labels[status]}</Tag>;
}

function formatDuration(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
