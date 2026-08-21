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
  rootPath: ".",
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

describe("CanvasStudioService local image upload", () => {
  it("fills an existing empty image node instead of creating another node", async () => {
    let currentNode = imageNode();
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => currentNode),
      getProjectRoot: vi.fn().mockResolvedValue("D:\\projects\\film"),
      createCanvasNode: vi.fn(),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        currentNode = { ...currentNode, ...patch, updatedAt: "2026-08-21T00:00:00.000Z" };
        return currentNode;
      }),
    } as unknown as PipelineRepository;
    const runs = { ensureSession: vi.fn() } as unknown as GenerationRunService;
    const assets = {
      upload: vi.fn().mockResolvedValue({
        name: "reference.png",
        contentType: "image/png",
        ref: { type: "workspace-file", relativePath: "assets/imports/reference.png" },
      }),
    } as unknown as GenerationAssetService;
    const service = createService(repository, {} as LlmPort, runs, assets);

    const result = await service.upload({
      projectId: "project-1",
      nodeId: "image-node-1",
      name: "reference.png",
      contentType: "image/png",
      data: new Uint8Array([1, 2, 3]),
      positionX: 120,
      positionY: 180,
    });

    expect(repository.createCanvasNode).not.toHaveBeenCalled();
    expect(result.id).toBe("image-node-1");
    expect(result.data).toMatchObject({
      type: "image",
      name: "reference.png",
      generatorType: "resource",
      workspaceFile: {
        relativePath: "assets/imports/reference.png",
        contentType: "image/png",
        name: "reference.png",
      },
      url: ["/api/pipeline/canvas-nodes/image-node-1/media"],
    });
  });
});

describe("CanvasStudioService image AI", () => {
  it("stores the submitted image prompt and starts the selected text-to-image route", async () => {
    let currentNode = imageNode();
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => currentNode),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      getProjectRoot: vi.fn().mockResolvedValue("D:\\projects\\film"),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        currentNode = { ...currentNode, ...patch, updatedAt: "2026-08-21T00:00:00.000Z" };
        return currentNode;
      }),
    } as unknown as PipelineRepository;
    const route = {
      id: "route-image-1",
      enabled: true,
      isDefault: true,
      capability: "text-to-image",
      inputSchema: {
        prompt: { required: true },
        parameters: [
          { key: "resolution", label: "Resolution", type: "select", options: [{ label: "2k", value: "2k" }] },
          { key: "width", label: "Width", type: "number", min: 240, max: 8192 },
          { key: "height", label: "Height", type: "number", min: 240, max: 8192 },
        ],
      },
    };
    const runs = {
      ensureSession: vi.fn(),
      getRoute: vi.fn().mockResolvedValue(route),
      createRun: vi.fn().mockResolvedValue({ run: { id: "run-image-1" } }),
    } as unknown as GenerationRunService;
    const service = createService(repository, {} as LlmPort, runs);

    const result = await service.generate("image-node-1", {
      prompt: "A cinematic mountain landscape",
      routeId: "route-image-1",
      settings: { aspectRatio: "16:9", resolution: "2k" },
    });

    expect(runs.createRun).toHaveBeenCalledWith(expect.objectContaining({
      capability: "text-to-image",
      routeId: "route-image-1",
      prompt: "A cinematic mountain landscape",
      parameters: { resolution: "2k", width: 2048, height: 1152 },
      sourceRef: "pipeline:canvas:image-node-1",
    }));
    expect(result).toMatchObject({
      runId: "run-image-1",
      node: {
        data: {
          params: {
            prompt: "A cinematic mountain landscape",
            routeId: "route-image-1",
            settings: { aspectRatio: "16:9", resolution: "2k" },
          },
          taskInfo: { runId: "run-image-1", status: "processing", progressPercent: 0 },
        },
      },
    });
  });

  it("cancels the active run and returns the image node to an editable state", async () => {
    let currentNode: CanvasNode = {
      ...imageNode(),
      data: { ...imageNode().data!, taskInfo: { runId: "run-image-1", status: "processing" as const } },
    };
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => currentNode),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        currentNode = { ...currentNode, ...patch };
        return currentNode;
      }),
    } as unknown as PipelineRepository;
    const runs = { cancelRun: vi.fn().mockResolvedValue({ run: { id: "run-image-1", status: "cancelled" } }) } as unknown as GenerationRunService;
    const service = createService(repository, {} as LlmPort, runs);

    const result = await service.cancelGeneration("image-node-1");

    expect(runs.cancelRun).toHaveBeenCalledWith("run-image-1");
    expect(result.data?.taskInfo).toEqual({ status: "idle" });
  });

  it("rejects an unavailable route explicitly instead of silently using another model", async () => {
    let currentNode = imageNode();
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => currentNode),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      getProjectRoot: vi.fn().mockResolvedValue("D:\\projects\\film"),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        currentNode = { ...currentNode, ...patch };
        return currentNode;
      }),
    } as unknown as PipelineRepository;
    const runs = {
      ensureSession: vi.fn(),
      getRoute: vi.fn().mockResolvedValue({ id: "disabled-route", enabled: false, capability: "text-to-image" }),
      createRun: vi.fn(),
    } as unknown as GenerationRunService;
    const service = createService(repository, {} as LlmPort, runs);

    await expect(service.generate("image-node-1", {
      prompt: "A valid image prompt",
      routeId: "disabled-route",
    })).rejects.toMatchObject({ status: 400 });
    expect(runs.createRun).not.toHaveBeenCalled();
  });

  it("keeps the source image and starts image-to-image generation in a connected new node", async () => {
    const source: CanvasNode = {
      ...imageNode(),
      positionX: 100,
      positionY: 80,
      width: 480,
      data: {
        ...imageNode().data!,
        name: "Reference",
        generatorType: "resource",
        workspaceFile: { relativePath: "assets/imports/reference.png", contentType: "image/png", name: "reference.png" },
        url: ["/api/pipeline/canvas-nodes/image-node-1/media"],
      },
    };
    const nodes = new Map<string, CanvasNode>([[source.id, source]]);
    const edges: Array<{ id: string; projectId: string; sourceNodeId: string; targetNodeId: string; edgeType: "references" }> = [];
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async (id: string) => nodes.get(id) ?? null),
      listCanvasNodes: vi.fn().mockImplementation(async () => [...nodes.values()]),
      listCanvasEdges: vi.fn().mockImplementation(async () => edges),
      createCanvasNode: vi.fn().mockImplementation(async (input: Omit<CanvasNode, "createdAt" | "updatedAt">) => {
        const created = { ...input, createdAt: "2026-08-21T00:00:00.000Z", updatedAt: "2026-08-21T00:00:00.000Z" };
        nodes.set(created.id, created);
        return created;
      }),
      updateCanvasNode: vi.fn().mockImplementation(async (id: string, patch: Partial<CanvasNode>) => {
        const current = nodes.get(id)!;
        const updated = { ...current, ...patch, updatedAt: "2026-08-21T00:00:01.000Z" };
        nodes.set(id, updated);
        return updated;
      }),
      createCanvasEdge: vi.fn().mockImplementation(async (input: Omit<(typeof edges)[number], "id">) => {
        const edge = { ...input, id: "edge-derived-1" };
        edges.push(edge);
        return edge;
      }),
      getProjectRoot: vi.fn().mockResolvedValue("D:\\projects\\film"),
    } as unknown as PipelineRepository;
    const route = {
      id: "route-image-edit-1",
      enabled: true,
      isDefault: true,
      capability: "image-to-image",
      inputSchema: { prompt: { required: true }, parameters: [] },
    };
    const runs = {
      ensureSession: vi.fn(),
      getRoute: vi.fn().mockResolvedValue(route),
      createRun: vi.fn().mockResolvedValue({ run: { id: "run-image-edit-1" } }),
    } as unknown as GenerationRunService;
    const service = createService(repository, {} as LlmPort, runs);

    const result = await service.generate(source.id, {
      prompt: "Change daytime into a rainy night",
      routeId: route.id,
      settings: { aspectRatio: "4:3", resolution: "2k" },
      createNewNode: true,
    });

    expect(repository.createCanvasNode).toHaveBeenCalledWith(expect.objectContaining({
      projectId: source.projectId,
      type: "image",
      data: expect.objectContaining({ name: "Reference · AI" }),
      positionX: 700,
      positionY: 80,
    }));
    expect(runs.createRun).toHaveBeenCalledWith(expect.objectContaining({
      capability: "image-to-image",
      routeId: route.id,
      assets: [{ slot: "imageUrls", ref: { type: "workspace-file", relativePath: "assets/imports/reference.png" } }],
      sourceRef: expect.stringMatching(/^pipeline:canvas:/),
    }));
    expect(result).toMatchObject({
      runId: "run-image-edit-1",
      edge: { sourceNodeId: source.id, targetNodeId: result.node.id },
      node: { data: { taskInfo: { status: "processing" } } },
    });
    expect(nodes.get(source.id)).toEqual(source);
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

function createService(
  repository: PipelineRepository,
  llm = {} as LlmPort,
  runs = {} as GenerationRunService,
  assets = {} as GenerationAssetService,
) {
  return new CanvasStudioService(
    repository,
    runs,
    assets,
    llm,
    { emit: vi.fn() } as unknown as PipelineSsePort,
  );
}

function imageNode(): CanvasNode {
  return {
    id: "image-node-1",
    projectId: "project-1",
    type: "image",
    entityId: "image-entity-1",
    positionX: 0,
    positionY: 0,
    width: 360,
    height: 300,
    data: {
      type: "image",
      name: "Image",
      action: "image_generate",
      generatorType: "default",
      url: [],
      params: { prompt: "", count: 1 },
      taskInfo: { status: "idle" },
    },
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
  };
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
