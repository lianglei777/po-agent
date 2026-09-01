import type {
  CanvasMutationBatch,
  CanvasEdge,
  CanvasNode,
  CanvasSnapshot,
  AssetListResponse,
  GenerateCanvasNodeRequest,
  GenerateCanvasNodeResponse,
  PipelineProject,
  GenerateTextNodeRequest,
  GenerateTextNodeResponse,
  CanvasWorkflowRunListResponse,
  CanvasWorkflowRunResponse,
  CreateLipSyncPreparationResponse,
} from "@/contracts/pipeline";
import type { ModelsResponse } from "@/contracts/models";
import type { GenerationComposerOptionsResponse, GenerationRunViewDto, ListGenerationRunsResponse } from "@/contracts/generation";

export class PipelineStudioApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PipelineStudioApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new PipelineStudioApiError(
      body.error?.message ?? `Request failed: ${response.status}`,
      response.status,
      body.error?.code,
    );
  }
  return response.json() as Promise<T>;
}

export function canvasSaveErrorIsRetryable(error: unknown): boolean {
  return !(error instanceof PipelineStudioApiError) || error.status >= 500;
}

export function canvasSaveRetryDelay(attempt: number): number {
  return Math.min(1_000 * (2 ** Math.max(0, attempt)), 30_000);
}

export const pipelineStudioApi = {
  getProject: (projectId: string) => request<PipelineProject>(`/api/pipeline/projects/${projectId}`),

  updateProject: (projectId: string, title: string) => request<PipelineProject>(`/api/pipeline/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  }),

  getSnapshot: (projectId: string, signal?: AbortSignal) => request<CanvasSnapshot>(`/api/pipeline/projects/${projectId}/canvas`, { signal }),

  getAssets: (projectId: string, signal?: AbortSignal) => request<AssetListResponse>(
    `/api/pipeline/projects/${encodeURIComponent(projectId)}/assets`,
    { signal },
  ),

  applyMutations: (projectId: string, batch: CanvasMutationBatch) => request<CanvasSnapshot>(
    `/api/pipeline/projects/${projectId}/canvas/mutations`,
    { method: "POST", body: JSON.stringify(batch) },
  ),

  connectCanvasNodes: (projectId: string, sourceNodeId: string, targetNodeId: string) => request<{ edge: CanvasEdge }>(
    `/api/pipeline/projects/${encodeURIComponent(projectId)}/canvas/edges`,
    { method: "POST", body: JSON.stringify({ sourceNodeId, targetNodeId }) },
  ),

  getTextModels: () => request<ModelsResponse>("/api/models"),

  getGenerationOptions: (signal?: AbortSignal) => request<GenerationComposerOptionsResponse>(
    "/api/generation/composer-options",
    { signal },
  ),

  generateCanvasNode: (nodeId: string, input: GenerateCanvasNodeRequest) => request<GenerateCanvasNodeResponse>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/generate`,
    { method: "POST", body: JSON.stringify(input) },
  ),

  createLipSyncPreparation: (nodeId: string) => request<CreateLipSyncPreparationResponse>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/lip-sync/preparations`,
    { method: "POST" },
  ),

  getLipSyncPreparation: (nodeId: string, preparationId: string, signal?: AbortSignal) => request<CreateLipSyncPreparationResponse>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/lip-sync/preparations/${encodeURIComponent(preparationId)}`,
    { signal },
  ),

  cancelCanvasNodeGeneration: (nodeId: string) => request<GenerateCanvasNodeResponse>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/cancel-generation`,
    { method: "POST" },
  ),

  getCanvasNodeGenerationRuns: (nodeId: string, signal?: AbortSignal) => request<ListGenerationRunsResponse>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/generation-runs`,
    { signal },
  ),

  selectCanvasNodeGenerationArtifact: (nodeId: string, runId: string, artifactId: string) => request<{ node: CanvasNode }>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/generation-runs/${encodeURIComponent(runId)}/select`,
    { method: "POST", body: JSON.stringify({ artifactId }) },
  ),

  selectCanvasNodeUploadSource: (nodeId: string) => request<{ node: CanvasNode }>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/generation-runs/upload-source/select`,
    { method: "POST" },
  ),

  retryCanvasNodeGeneration: (nodeId: string, runId: string, idempotencyKey: string) => request<{
    node: CanvasNode;
    generation: GenerationRunViewDto;
  }>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/generation-runs/${encodeURIComponent(runId)}/retry`,
    { method: "POST", body: JSON.stringify({ idempotencyKey }) },
  ),

  generateText: (nodeId: string, input: GenerateTextNodeRequest) => request<GenerateTextNodeResponse>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/generate-text`,
    { method: "POST", body: JSON.stringify(input) },
  ),

  listWorkflowRuns: (projectId: string, limit = 1, signal?: AbortSignal) => request<CanvasWorkflowRunListResponse>(
    `/api/pipeline/projects/${encodeURIComponent(projectId)}/canvas/workflow-runs?limit=${limit}`,
    { signal },
  ),

  createWorkflowRun: (projectId: string, nodeIds: string[]) => request<CanvasWorkflowRunResponse>(
    `/api/pipeline/projects/${encodeURIComponent(projectId)}/canvas/workflow-runs`,
    { method: "POST", body: JSON.stringify({ nodeIds }) },
  ),

  cancelWorkflowRun: (projectId: string, runId: string) => request<CanvasWorkflowRunResponse>(
    `/api/pipeline/projects/${encodeURIComponent(projectId)}/canvas/workflow-runs/${encodeURIComponent(runId)}/cancel`,
    { method: "POST" },
  ),

  retryWorkflowRun: (projectId: string, runId: string) => request<CanvasWorkflowRunResponse>(
    `/api/pipeline/projects/${encodeURIComponent(projectId)}/canvas/workflow-runs/${encodeURIComponent(runId)}/retry`,
    { method: "POST" },
  ),

  uploadFile: async (projectId: string, file: File, positionX: number, positionY: number, nodeId?: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("positionX", String(positionX));
    form.append("positionY", String(positionY));
    if (nodeId) form.append("nodeId", nodeId);
    const response = await fetch(`/api/pipeline/projects/${projectId}/canvas/upload`, { method: "POST", body: form });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(body.error?.message ?? `Request failed: ${response.status}`);
    }
    return response.json() as Promise<{ node: CanvasNode }>;
  },
};

export function canvasNodeGenerationArtifactUrl(nodeId: string, runId: string, artifactId: string) {
  return `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/generation-runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/media`;
}

export function canvasNodeUploadSourceUrl(nodeId: string) {
  return `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/generation-runs/upload-source/media`;
}
