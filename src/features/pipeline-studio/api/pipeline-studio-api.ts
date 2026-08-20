import type {
  CanvasMutationBatch,
  CanvasNode,
  CanvasSnapshot,
  PipelineProject,
  GenerateTextNodeRequest,
  GenerateTextNodeResponse,
} from "@/contracts/pipeline";
import type { ModelsResponse } from "@/contracts/models";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(body.error?.message ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const pipelineStudioApi = {
  getProject: (projectId: string) => request<PipelineProject>(`/api/pipeline/projects/${projectId}`),

  updateProject: (projectId: string, title: string) => request<PipelineProject>(`/api/pipeline/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  }),

  getSnapshot: (projectId: string, signal?: AbortSignal) => request<CanvasSnapshot>(`/api/pipeline/projects/${projectId}/canvas`, { signal }),

  applyMutations: (projectId: string, batch: CanvasMutationBatch) => request<CanvasSnapshot>(
    `/api/pipeline/projects/${projectId}/canvas/mutations`,
    { method: "POST", body: JSON.stringify(batch) },
  ),

  getTextModels: () => request<ModelsResponse>("/api/models"),

  generateText: (nodeId: string, input: GenerateTextNodeRequest) => request<GenerateTextNodeResponse>(
    `/api/pipeline/canvas-nodes/${encodeURIComponent(nodeId)}/generate-text`,
    { method: "POST", body: JSON.stringify(input) },
  ),

  uploadFile: async (projectId: string, file: File, positionX: number, positionY: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("positionX", String(positionX));
    form.append("positionY", String(positionY));
    const response = await fetch(`/api/pipeline/projects/${projectId}/canvas/upload`, { method: "POST", body: form });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(body.error?.message ?? `Request failed: ${response.status}`);
    }
    return response.json() as Promise<{ node: CanvasNode }>;
  },
};
