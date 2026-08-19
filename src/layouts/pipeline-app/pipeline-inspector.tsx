"use client";

import { useEffect, useState } from "react";
import { Button, Empty, Input, Tag, message } from "antd";
import type { Node } from "@xyflow/react";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineApi } from "./pipeline-api";
import type { AssetVariant } from "@/contracts/pipeline";

interface NodeData {
  entityId: string;
  __type: string;
  label: string;
  description: string;
  status: string;
  [key: string]: unknown;
}

export type PipelineInspectorProps = {
  selectedNode: Node | null;
  projectId: string;
  onRefresh: () => void;
  onClose: () => void;
};

export function PipelineInspector({ selectedNode, projectId, onRefresh, onClose }: PipelineInspectorProps) {
  const { t } = useI18n();
  const data = selectedNode?.data as NodeData | undefined;
  const nodeType = data?.__type ?? "";
  const [variants, setVariants] = useState<AssetVariant[]>([]);

  useEffect(() => {
    if (data?.entityId && (nodeType === "character" || nodeType === "scene" || nodeType === "prop")) {
      pipelineApi.listVariants(data.entityId).then((res) => setVariants(res.variants as AssetVariant[])).catch(() => setVariants([]));
    }
  }, [data?.entityId, nodeType]);

  const handleGenerateAsset = () => {
    if (!data?.entityId) return;
    pipelineApi.generateAssetImage(data.entityId, projectId).then(() => { message.success("Generating..."); onRefresh(); }).catch((e: Error) => message.error(e.message));
  };

  const handleGenerateFrameImage = () => {
    if (!data?.entityId) return;
    pipelineApi.generateFrameImage(data.entityId, projectId).then(() => { message.success("Generating..."); onRefresh(); }).catch((e: Error) => message.error(e.message));
  };

  const handleGenerateVideo = (mode: "i2v" | "r2v") => {
    if (!data?.entityId) return;
    pipelineApi.generateVideo(data.entityId, projectId, mode).then(() => { message.success("Generating..."); onRefresh(); }).catch((e: Error) => message.error(e.message));
  };

  const handleUpdateAsset = (patch: { name?: string; description?: string }) => {
    if (!data?.entityId) return;
    pipelineApi.updateAsset(data.entityId, patch).then(() => onRefresh()).catch((e: Error) => message.error(e.message));
  };

  const handleUpdateFrame = (patch: { visualDescription?: string; imagePrompt?: string; videoPrompt?: string }) => {
    if (!data?.entityId) return;
    pipelineApi.updateFrame(data.entityId, patch).then(() => onRefresh()).catch((e: Error) => message.error(e.message));
  };

  const handleAnalyzeScript = () => {
    pipelineApi.analyzeScript(projectId).then(() => { message.success("Analyzing..."); onRefresh(); }).catch((e: Error) => message.error(e.message));
  };

  const handleExtractStoryboard = () => {
    pipelineApi.extractStoryboard(projectId).then(() => { message.success("Extracting..."); onRefresh(); }).catch((e: Error) => message.error(e.message));
  };

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-[var(--pl-border-glass)] bg-[var(--pl-surface)]" data-testid="pipeline-inspector">
      <div className="flex items-center justify-between border-b border-[var(--pl-border)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--pl-text)]">{selectedNode ? data?.label : "Inspector"}</span>
        <Button type="text" size="small" onClick={onClose}>{t.common.close}</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!selectedNode ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--pl-text-secondary)]">Select a node to edit, or use these quick actions:</p>
            <Button block onClick={handleAnalyzeScript}>Analyze Script</Button>
            <Button block onClick={handleExtractStoryboard}>Extract Storyboard</Button>
          </div>
        ) : (nodeType === "character" || nodeType === "scene" || nodeType === "prop") ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Tag color="blue" className="!m-0">{nodeType}</Tag>
              <span className="text-xs text-[var(--pl-text-muted)]">{data?.status}</span>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--pl-text-muted)]">Name</label>
              <Input defaultValue={data?.label} onBlur={(e) => handleUpdateAsset({ name: e.target.value })} size="small" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--pl-text-muted)]">Description</label>
              <Input.TextArea defaultValue={data?.description} onBlur={(e) => handleUpdateAsset({ description: e.target.value })} rows={3} size="small" />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-[var(--pl-text-muted)]">Variants ({variants.length})</span>
              </div>
              {variants.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No variants" />
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {variants.map((v) => (
                    <div key={v.id} className="flex aspect-square items-center justify-center rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface-subtle)] text-[10px] text-[var(--pl-text-muted)]">
                      {v.artifactId ? "IMG" : "..."}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button type="primary" block onClick={handleGenerateAsset}>Generate Image</Button>
          </div>
        ) : nodeType === "storyboard" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Tag color="purple" className="!m-0">Storyboard</Tag>
              <span className="text-xs text-[var(--pl-text-muted)]">{data?.status}</span>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--pl-text-muted)]">Visual Description</label>
              <Input.TextArea defaultValue={data?.description} onBlur={(e) => handleUpdateFrame({ visualDescription: e.target.value })} rows={3} size="small" />
            </div>
            <Button block onClick={handleGenerateFrameImage}>Generate Frame Image</Button>
            <div className="flex gap-2">
              <Button block onClick={() => handleGenerateVideo("i2v")}>I2V</Button>
              <Button block onClick={() => handleGenerateVideo("r2v")}>R2V</Button>
            </div>
          </div>
        ) : nodeType === "video" ? (
          <div className="flex flex-col gap-3">
            <Tag color="green" className="!m-0">Video</Tag>
            <span className="text-xs text-[var(--pl-text-muted)]">{data?.status}</span>
            <Button block onClick={() => { if (data?.entityId) { pipelineApi.selectFinalTake(data.entityId.split(":")[0], data.entityId).then(() => onRefresh()); } }}>Select as Final Take</Button>
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Unknown node type" />
        )}
      </div>
    </aside>
  );
}

