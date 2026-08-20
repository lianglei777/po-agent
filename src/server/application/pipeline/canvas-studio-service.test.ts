import { describe, expect, it, vi } from "vitest";
import type { CanvasMutationBatch, CanvasNode, PipelineProject } from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import type { PipelineSsePort } from "@/server/ports/pipeline-sse-port";
import type { LlmPort } from "@/server/ports/llm-port";
import type { GenerationRunService } from "@/server/application/content-generation/generation-run-service";
import type { GenerationAssetService } from "@/server/application/content-generation/generation-asset-service";
import { CanvasStudioService } from "./canvas-studio-service";

const project: PipelineProject = {
  id: "project-1",
  workspaceId: "default",
  title: "Project",
  originalText: "",
  artDirection: null,
  modelSettings: null,
  promptConfig: null,
  status: "draft",
  coverArtifactId: null,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
};

const batch: CanvasMutationBatch = {
  baseRevision: 0,
  requestId: "request-1",
  mutations: [{ type: "viewport.update", viewport: { x: 10, y: 20, zoom: 0.8 } }],
};

describe("CanvasStudioService mutation batches", () => {
  it("returns the reconciled snapshot after applying a batch", async () => {
    const repository = repositoryStub({ applied: true, revision: 1 });
    const service = createService(repository);

    await expect(service.applyMutationBatch("project-1", batch)).resolves.toEqual({
      revision: 1,
      nodes: [],
      edges: [],
      viewport: { x: 10, y: 20, zoom: 0.8 },
    });
  });

  it("maps stale revisions to a conflict AppError", async () => {
    const repository = repositoryStub({ applied: false, revision: 4 });
    const service = createService(repository);

    await expect(service.applyMutationBatch("project-1", batch)).rejects.toMatchObject({
      code: "PIPELINE_CANVAS_REVISION_CONFLICT",
      status: 409,
    });
  });
});

describe("CanvasStudioService text AI", () => {
  it("revises current text with the selected model and stores the complete result", async () => {
    let currentNode = textNode("Existing draft");
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => currentNode),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        currentNode = { ...currentNode, ...patch, updatedAt: "2026-08-20T00:00:00.000Z" };
        return currentNode;
      }),
    } as unknown as PipelineRepository;
    const llm = {
      chat: vi.fn().mockResolvedValue("Revised final text"),
    } as unknown as LlmPort;
    const service = createService(repository, llm);

    const result = await service.generateText("node-1", {
      instruction: "Make it concise",
      mode: "revise",
      model: "provider:model-1",
    });

    expect(llm.chat).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ role: "user", content: expect.stringContaining("Existing draft") })]),
      { model: "provider:model-1", temperature: 0.6, maxTokens: 8_192 },
    );
    expect(result.data).toMatchObject({
      action: "text_revise",
      content: ["Revised final text"],
      textDocument: { plainText: "Revised final text" },
      taskInfo: { status: "completed", progressPercent: 100 },
    });
  });
});

function repositoryStub(result: { applied: boolean; revision: number }) {
  return {
    getProject: vi.fn().mockResolvedValue(project),
    applyCanvasMutationBatch: vi.fn().mockResolvedValue(result),
    listCanvasNodes: vi.fn().mockResolvedValue([]),
    listCanvasEdges: vi.fn().mockResolvedValue([]),
    getCanvasViewport: vi.fn().mockResolvedValue({ x: 10, y: 20, zoom: 0.8 }),
    getCanvasRevision: vi.fn().mockResolvedValue(result.revision),
  } as unknown as PipelineRepository;
}

function createService(repository: PipelineRepository, llm = {} as LlmPort) {
  return new CanvasStudioService(
    repository,
    {} as GenerationRunService,
    {} as GenerationAssetService,
    llm,
    "D:\\workspace",
    { emit: vi.fn() } as unknown as PipelineSsePort,
  );
}

function textNode(content: string): CanvasNode {
  return {
    id: "node-1",
    projectId: "project-1",
    type: "text",
    entityId: "entity-1",
    positionX: 0,
    positionY: 0,
    width: 320,
    height: 220,
    data: {
      type: "text",
      name: "Text",
      action: "text_generate",
      content: [content],
      params: { prompt: "" },
      taskInfo: { status: "idle" },
    },
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
  };
}
