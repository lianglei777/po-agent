import { describe, expect, it, vi } from "vitest";
import type { CanvasMutationBatch, CanvasNode, CanvasPromptDocument, PipelineProject } from "@/server/domain/pipeline";
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
      listCanvasEdges: vi.fn().mockResolvedValue([]),
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

describe("CanvasStudioService asset media", () => {
  it("reads the selected artifact through the registered project workspace", async () => {
    const repository = {
      getAsset: vi.fn().mockResolvedValue({
        id: "asset-1",
        projectId: "project-1",
        selectedArtifactId: "artifact-1",
      }),
      getProjectRoot: vi.fn().mockResolvedValue("D:\\projects\\film"),
    } as unknown as PipelineRepository;
    const runs = {
      getArtifact: vi.fn().mockResolvedValue({ id: "artifact-1", localPath: "generated/reference.png" }),
      ensureSession: vi.fn(),
    } as unknown as GenerationRunService;
    const assets = {
      read: vi.fn().mockResolvedValue({ data: new Uint8Array([1, 2]), mimeType: "image/png" }),
    } as unknown as GenerationAssetService;
    const service = createService(repository, {} as LlmPort, runs, assets);

    await expect(service.readAssetMedia("asset-1")).resolves.toMatchObject({ mimeType: "image/png" });
    expect(assets.read).toHaveBeenCalledWith({
      sessionId: "pipeline:project-1",
      relativePath: "generated/reference.png",
    });
  });

  it("rejects assets without selected local media", async () => {
    const repository = {
      getAsset: vi.fn().mockResolvedValue({ id: "asset-1", projectId: "project-1", selectedArtifactId: null }),
    } as unknown as PipelineRepository;
    const service = createService(repository);

    await expect(service.readAssetMedia("asset-1")).rejects.toMatchObject({ code: "FILE_NOT_FOUND", status: 404 });
  });

  it("rejects local replacement while the target has an upstream connection", async () => {
    const currentNode = imageNode();
    const repository = {
      getCanvasNode: vi.fn().mockResolvedValue(currentNode),
      listCanvasEdges: vi.fn().mockResolvedValue([{
        id: "edge-1",
        projectId: "project-1",
        sourceNodeId: "source-1",
        targetNodeId: currentNode.id,
        edgeType: "references",
      }]),
    } as unknown as PipelineRepository;
    const assets = { upload: vi.fn() } as unknown as GenerationAssetService;
    const service = createService(repository, {} as LlmPort, {} as GenerationRunService, assets);

    await expect(service.upload({
      projectId: "project-1",
      nodeId: currentNode.id,
      name: "replacement.png",
      contentType: "image/png",
      data: new Uint8Array([1]),
      positionX: 0,
      positionY: 0,
    })).rejects.toMatchObject({ status: 409 });
    expect(assets.upload).not.toHaveBeenCalled();
  });

  it("clears cached target references after deleting an incoming edge", async () => {
    const source = {
      ...imageNode(),
      id: "source-1",
      data: {
        ...imageNode().data!,
        workspaceFile: { relativePath: "assets/source.png", contentType: "image/png", name: "source.png" },
      },
    };
    let target: CanvasNode = {
      ...imageNode(),
      id: "target-1",
      data: {
        ...imageNode().data!,
        params: {
          prompt: "",
          imageList: [{
            nodeId: source.id,
            mediaType: "image" as const,
            label: "Source",
            workspaceFile: source.data.workspaceFile,
          }],
        },
      },
    };
    let edges = [{
      id: "edge-1",
      projectId: "project-1",
      sourceNodeId: source.id,
      targetNodeId: target.id,
      edgeType: "references" as const,
    }];
    const repository = {
      getProject: vi.fn().mockResolvedValue(project),
      getCanvasNode: vi.fn().mockImplementation(async (id: string) => id === source.id ? source : id === target.id ? target : null),
      listCanvasNodes: vi.fn().mockImplementation(async () => [source, target]),
      listCanvasEdges: vi.fn().mockImplementation(async () => edges),
      applyCanvasMutationBatch: vi.fn().mockImplementation(async () => {
        edges = [];
        return { applied: true, revision: 1 };
      }),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        target = { ...target, ...patch };
        return target;
      }),
      getCanvasViewport: vi.fn().mockResolvedValue({ x: 0, y: 0, zoom: 1 }),
      getCanvasRevision: vi.fn().mockResolvedValue(1),
    } as unknown as PipelineRepository;
    const service = createService(repository);

    await service.applyMutationBatch("project-1", {
      baseRevision: 0,
      requestId: "delete-edge-1",
      mutations: [{ type: "edge.delete", edgeId: "edge-1" }],
    });

    expect(target.data?.params?.imageList).toEqual([]);
  });
});

describe("CanvasStudioService connection policy", () => {
  it("rejects a new connection into a node that already has content", async () => {
    const source = { ...imageNode(), id: "source-1" };
    const target = {
      ...imageNode(),
      id: "target-1",
      data: { ...imageNode().data!, url: ["/target.png"] },
    };
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async (id: string) => id === source.id ? source : target),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      createCanvasEdge: vi.fn(),
    } as unknown as PipelineRepository;
    const service = createService(repository);

    await expect(service.connect({
      projectId: "project-1",
      sourceNodeId: source.id,
      targetNodeId: target.id,
    })).rejects.toMatchObject({ status: 409 });
    expect(repository.createCanvasEdge).not.toHaveBeenCalled();
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

describe("CanvasStudioService video AI", () => {
  it("binds explicit first and last frame mentions to stable route slots in prompt order", async () => {
    const target = videoNode();
    const first = {
      ...imageNode(),
      id: "frame-first",
      data: {
        ...imageNode().data!,
        name: "Opening",
        workspaceFile: { relativePath: "assets/opening.png", contentType: "image/png", name: "opening.png" },
      },
    };
    const last = {
      ...imageNode(),
      id: "frame-last",
      data: {
        ...imageNode().data!,
        name: "Ending",
        workspaceFile: { relativePath: "assets/ending.png", contentType: "image/png", name: "ending.png" },
      },
    };
    const nodes = new Map([[target.id, target], [first.id, first], [last.id, last]]);
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async (id: string) => nodes.get(id) ?? null),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      getProjectRoot: vi.fn().mockResolvedValue("D:\\projects\\film"),
      updateCanvasNode: vi.fn().mockImplementation(async (id: string, patch: Partial<CanvasNode>) => {
        const updated = { ...nodes.get(id)!, ...patch, updatedAt: "2026-08-21T00:00:01.000Z" };
        nodes.set(id, updated);
        return updated;
      }),
    } as unknown as PipelineRepository;
    const route = {
      id: "route-video-1",
      enabled: true,
      isDefault: true,
      capability: "image-to-video",
      inputSchema: {
        prompt: { required: true },
        parameters: [
          { key: "durationSeconds", label: "Duration", type: "select", options: [{ label: "5", value: 5 }] },
          { key: "conversionSlots", label: "Slots", type: "multi-select", options: [{ label: "All", value: "all" }] },
        ],
      },
    };
    const runs = {
      ensureSession: vi.fn(),
      getRoute: vi.fn().mockResolvedValue(route),
      createRun: vi.fn().mockResolvedValue({ run: { id: "run-video-1" } }),
    } as unknown as GenerationRunService;
    const service = createService(repository, {} as LlmPort, runs);

    await service.generate(target.id, {
      prompt: "Move from day to night",
      promptDocument: videoPromptDocument(),
      routeId: route.id,
      settings: { durationSeconds: 5, conversionSlots: ["all"] },
    });

    expect(runs.createRun).toHaveBeenCalledWith(expect.objectContaining({
      capability: "image-to-video",
      routeId: route.id,
      prompt: "Move from day to night 图片1 图片2",
      assets: [
        { slot: "firstFrameUrl", bindingId: "mention-first", order: 0, ref: { type: "workspace-file", relativePath: "assets/opening.png" } },
        { slot: "lastFrameUrl", bindingId: "mention-last", order: 1, ref: { type: "workspace-file", relativePath: "assets/ending.png" } },
      ],
      parameters: { durationSeconds: 5, conversionSlots: ["all"] },
    }));
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

function videoNode(): CanvasNode {
  return {
    ...imageNode(),
    id: "video-node-1",
    type: "video",
    entityId: "video-entity-1",
    data: {
      type: "video",
      name: "Video",
      action: "video_generate",
      generatorType: "default",
      url: [],
      params: { prompt: "", settings: {} },
      taskInfo: { status: "idle" },
    },
  };
}

function videoPromptDocument(): CanvasPromptDocument {
  return {
    schemaVersion: 1 as const,
    format: "tiptap-json" as const,
    plainText: "Move from day to night @Opening @Ending",
    content: {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "Move from day to night " },
          { type: "resourceReference", attrs: { referenceId: "mention-first", sourceType: "canvas-node", sourceId: "frame-first", mediaType: "image", label: "Opening", role: "first-frame" } },
          { type: "text", text: " " },
          { type: "resourceReference", attrs: { referenceId: "mention-last", sourceType: "canvas-node", sourceId: "frame-last", mediaType: "image", label: "Ending", role: "last-frame" } },
        ],
      }],
    },
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
