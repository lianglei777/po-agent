import type { CanvasNodeData } from "@/contracts/pipeline";

export interface CanvasMediaSource {
  assetKey: string;
  kind: "local" | "external";
  url: string;
  fallbackUrl?: string;
}

export function resolveCanvasMediaSource(
  nodeId: string,
  data: CanvasNodeData | null | undefined,
): CanvasMediaSource | null {
  if (!data || data.type === "text") return null;

  const selectedVideoArtifactId = data.videoSelection?.artifactId;
  if (selectedVideoArtifactId) {
    const selectedUrl = data.url?.[0];
    const source = localMediaSource(nodeId, `artifact:${selectedVideoArtifactId}`);
    // 已选 Take 优先读取持久化的本地文件；远程地址只供旧数据或文件丢失时降级。
    return selectedUrl && !selectedUrl.startsWith("/api/pipeline/canvas-nodes/")
      ? { ...source, fallbackUrl: selectedUrl }
      : source;
  }

  const workspacePath = data.workspaceFile?.relativePath;
  if (workspacePath) return localMediaSource(nodeId, `workspace:${workspacePath}`);

  const artifactId = data.artifactIds?.[0];
  if (artifactId) return localMediaSource(nodeId, `artifact:${artifactId}`);

  // 生成任务执行期间媒体尚不可读；旧数据只有完成后的 runId 时才允许回退读取。
  const runId = data.taskInfo?.status === "completed" ? data.taskInfo.runId : undefined;
  if (runId) return localMediaSource(nodeId, `run:${runId}`);

  const externalUrl = data.url?.[0];
  return externalUrl ? { assetKey: `url:${externalUrl}`, kind: "external", url: externalUrl } : null;
}

export function shouldDeferCanvasMediaLoad(
  source: CanvasMediaSource | null,
  awaitingNodeCreation: boolean,
): boolean {
  return awaitingNodeCreation && source?.kind === "local";
}

function localMediaSource(nodeId: string, assetKey: string): CanvasMediaSource {
  return {
    assetKey,
    kind: "local",
    // 版本只绑定真实资源身份，移动、缩放和改标题不会使浏览器重新加载媒体。
    url: `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/media?v=${encodeURIComponent(assetKey)}`,
  };
}
