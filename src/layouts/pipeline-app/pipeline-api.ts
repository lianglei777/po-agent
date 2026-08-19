"use client";

import type {
  CanvasStateResponse,
  ProjectListResponse,
  ProjectResponse,
  StageStatusesResponse,
} from "@/contracts/pipeline";

const BASE = "/api/pipeline";

async function request<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(body.error?.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const pipelineApi = {
  listProjects: () =>
    request<ProjectListResponse>(`${BASE}/projects`),

  getProject: (id: string) =>
    request<ProjectResponse>(`${BASE}/projects/${id}`),

  createProject: (body: { title: string; originalText: string; workspaceId: string; artDirection?: string }) =>
    request<ProjectResponse>(`${BASE}/projects`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  deleteProject: (id: string) =>
    request<{ success: true }>(`${BASE}/projects/${id}`, { method: "DELETE" }),

  getStageStatuses: (projectId: string) =>
    request<StageStatusesResponse>(`${BASE}/projects/${projectId}/stage-statuses`),

  getCanvasState: (projectId: string) =>
    request<CanvasStateResponse>(`${BASE}/projects/${projectId}/canvas`),

  updateNodePosition: (projectId: string, nodeId: string, x: number, y: number) =>
    request<{ success: true }>(
      `${BASE}/projects/${projectId}/canvas?nodeId=${nodeId}`,
      { method: "PATCH", body: JSON.stringify({ x, y }) },
    ),

  analyzeScript: (projectId: string) =>
    request<{ assets: unknown[] }>(`${BASE}/projects/${projectId}/analyze`, { method: "POST" }),

  extractStoryboard: (projectId: string) =>
    request<{ frames: unknown[] }>(`${BASE}/projects/${projectId}/extract-storyboard`, { method: "POST" }),

  generateAssetImage: (assetId: string, projectId: string) =>
    request<{ variantId: string; runId: string }>(`${BASE}/assets/${assetId}/generate`, {
      method: "POST",
      body: JSON.stringify({ projectId }),
    }),

  generateFrameImage: (frameId: string, projectId: string) =>
    request<{ runId: string }>(`${BASE}/frames/${frameId}/generate-image`, {
      method: "POST",
      body: JSON.stringify({ projectId }),
    }),

  generateVideo: (frameId: string, projectId: string, mode: "i2v" | "r2v") =>
    request<{ runId: string }>(`${BASE}/frames/${frameId}/generate-video`, {
      method: "POST",
      body: JSON.stringify({ mode, projectId }),
    }),

  selectFinalTake: (frameId: string, runId: string) =>
    request<{ success: true }>(`${BASE}/frames/${frameId}/select-take`, {
      method: "POST",
      body: JSON.stringify({ runId }),
    }),

  listAssets: (projectId: string) =>
    request<{ assets: unknown[] }>("/api/pipeline/projects/" + projectId + "/assets"),

  listFrames: (projectId: string) =>
    request<{ frames: unknown[] }>("/api/pipeline/projects/" + projectId + "/frames"),

  createCanvasEdge: (projectId: string, sourceNodeId: string, targetNodeId: string, edgeType: string) =>
    request<{ success: true }>("/api/pipeline/projects/" + projectId + "/canvas/edges", {
      method: "POST",
      body: JSON.stringify({ sourceNodeId, targetNodeId, edgeType }),
    }),

  deleteCanvasNode: (projectId: string, nodeId: string) =>
    request<{ success: true }>("/api/pipeline/projects/" + projectId + "/canvas?nodeId=" + nodeId, { method: "DELETE" }),

  createAsset: (projectId: string, body: { type: string; name: string; description: string; positionX?: number; positionY?: number }) =>
    request<unknown>(BASE + "/projects/" + projectId + "/assets", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createFrame: (projectId: string, body: { visualDescription?: string; positionX?: number; positionY?: number }) =>
    request<unknown>(BASE + "/projects/" + projectId + "/frames", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  createPipelineAgentSession: (projectId: string) =>
    request<{ sessionId: string }>(BASE + "/projects/" + projectId + "/agent-session", { method: "POST" }),

  listVariants: (assetId: string) =>
    request<{ variants: unknown[] }>("/api/pipeline/assets/" + assetId + "/variants"),

  updateAsset: (assetId: string, body: { name?: string; description?: string }) =>
    request<unknown>("/api/pipeline/assets/" + assetId, { method: "PATCH", body: JSON.stringify(body) }),

  updateFrame: (frameId: string, body: { visualDescription?: string; imagePrompt?: string; videoPrompt?: string }) =>
    request<unknown>("/api/pipeline/frames/" + frameId, { method: "PATCH", body: JSON.stringify(body) }),

  // Agent 驱动 — 创建 Agent 会话
  createAgentSession: (cwd: string) =>
    request<{ sessionId: string }>(`/api/agent/new`, {
      method: "POST",
      body: JSON.stringify({ cwd }),
    }),

  // Agent 驱动 — 发送消息
  sendAgentTurn: (sessionId: string, turnId: string, message: string) =>
    request<unknown>(`/api/agent/${sessionId}/turns`, {
      method: "POST",
      body: JSON.stringify({ turnId, message }),
    }),
};
