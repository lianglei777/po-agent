import { describe, expect, it, vi } from "vitest";
import { MAX_CANVAS_AUDIO_UPLOAD_BYTES } from "@/contracts/pipeline";
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

  it("preserves all server-owned node state against client-authored data", async () => {
    const current = {
      ...imageNode(),
      data: {
        ...imageNode().data!,
        url: ["/api/pipeline/artifacts/artifact-real/content"],
        artifactIds: ["artifact-real"],
        workspaceFile: { relativePath: "images/real.png", contentType: "image/png", name: "real.png" },
        taskInfo: { runId: "run-real", status: "processing" as const, progressPercent: 40 },
        generationProvenance: { runId: "run-real", inputFingerprint: "a".repeat(64), stale: false },
        params: {
          prompt: "Original",
          imageList: [{ nodeId: "source-1", mediaType: "image" as const, label: "Source" }],
        },
      },
    };
    const repository = {
      getProject: vi.fn().mockResolvedValue(project),
      listCanvasNodes: vi.fn().mockResolvedValue([current]),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      applyCanvasMutationBatch: vi.fn().mockResolvedValue({ applied: false, revision: 1 }),
    } as unknown as PipelineRepository;
    const service = createService(repository);

    await expect(service.applyMutationBatch(project.id, {
      baseRevision: 0,
      requestId: "forged-provenance",
      mutations: [{
        type: "node.update",
        nodeId: current.id,
        patch: {
          data: {
            ...current.data!,
            url: ["https://attacker.test/forged.png"],
            artifactIds: ["artifact-forged"],
            workspaceFile: { relativePath: "../forged", contentType: "text/html", name: "forged" },
            taskInfo: { runId: "run-forged", status: "completed" },
            generationProvenance: { runId: "run-forged", inputFingerprint: "b".repeat(64), stale: false },
            params: { ...current.data!.params!, prompt: "Updated", imageList: [] },
          },
        },
      }],
    })).rejects.toMatchObject({ code: "PIPELINE_CANVAS_REVISION_CONFLICT" });

    expect(repository.applyCanvasMutationBatch).toHaveBeenCalledWith(project.id, 0, [expect.objectContaining({
      patch: expect.objectContaining({
        data: expect.objectContaining({
          url: current.data!.url,
          artifactIds: current.data!.artifactIds,
          workspaceFile: current.data!.workspaceFile,
          taskInfo: current.data!.taskInfo,
          generationProvenance: current.data!.generationProvenance,
          params: expect.objectContaining({ prompt: "Updated", imageList: current.data!.params!.imageList }),
        }),
      }),
    })]);
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

  it("emits and propagates a text generation failure through the normal node update path", async () => {
    let currentNode = textNode("");
    currentNode = { ...currentNode, data: { ...currentNode.data!, params: { prompt: "Write a line" } } };
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => currentNode),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        currentNode = { ...currentNode, ...patch, updatedAt: "2026-08-20T00:00:00.000Z" };
        return currentNode;
      }),
    } as unknown as PipelineRepository;
    const llm = {
      isConfigured: vi.fn().mockReturnValue(true),
      chat: vi.fn().mockRejectedValue(new Error("text model unavailable")),
    } as unknown as LlmPort;
    const sse = { emit: vi.fn() } as unknown as PipelineSsePort;
    const service = createService(repository, llm, undefined, undefined, sse);

    await expect(service.generate(currentNode.id)).rejects.toThrow("text model unavailable");

    expect(currentNode.data?.taskInfo).toEqual({ status: "failed", errorMessage: "text model unavailable" });
    expect(sse.emit).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "node_updated",
      projectId: currentNode.projectId,
      payload: expect.objectContaining({ data: expect.objectContaining({ taskInfo: currentNode.data?.taskInfo }) }),
    }));
  });
});

describe("CanvasStudioService local media upload", () => {
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
          { key: "size", label: "Size", type: "select", options: [{ label: "1280*720", value: "1280*720" }] },
          { key: "promptExtend", label: "Prompt extend", type: "boolean" },
        ],
      },
    };
    let sourceFingerprint = "";
    const runs = {
      ensureSession: vi.fn(),
      getRoute: vi.fn().mockResolvedValue(route),
      createRun: vi.fn().mockImplementation(async (input: { sourceFingerprint?: string }) => {
        sourceFingerprint = input.sourceFingerprint ?? "";
        return { run: { id: "run-image-1" } };
      }),
      getRun: vi.fn().mockImplementation(async () => ({
        run: { id: "run-image-1", input: { sourceFingerprint } },
        jobs: [],
        artifacts: [],
      })),
    } as unknown as GenerationRunService;
    const service = createService(repository, {} as LlmPort, runs);

    const result = await service.generate("image-node-1", {
      prompt: "A cinematic mountain landscape",
      routeId: "route-image-1",
      settings: { size: "1280*720", promptExtend: false, aspectRatio: "16:9" },
    });

    expect(runs.createRun).toHaveBeenCalledWith(expect.objectContaining({
      capability: "text-to-image",
      routeId: "route-image-1",
      prompt: "A cinematic mountain landscape",
      parameters: { size: "1280*720", promptExtend: false },
      sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      sourceRef: "pipeline:canvas:image-node-1",
    }));
    expect(result).toMatchObject({
      runId: "run-image-1",
      node: {
        data: {
          params: {
            prompt: "A cinematic mountain landscape",
            routeId: "route-image-1",
            settings: { size: "1280*720", promptExtend: false, aspectRatio: "16:9" },
          },
          taskInfo: { runId: "run-image-1", status: "processing", progressPercent: 0 },
        },
      },
    });

    await service.completeGeneration("image-node-1", "run-image-1", [{
      id: "artifact-image-1",
      runId: "run-image-1",
      jobId: "job-image-1",
      kind: "image",
      remoteUrl: "https://media.example/image.png",
      createdAt: "2026-08-21T00:01:00.000Z",
    }]);
    expect(currentNode.data?.generationProvenance).toEqual({
      runId: "run-image-1",
      inputFingerprint: sourceFingerprint,
      stale: false,
    });

    currentNode = {
      ...currentNode,
      data: {
        ...currentNode.data!,
        params: { ...currentNode.data!.params!, prompt: "A different landscape" },
      },
    };
    await service.syncTargetReferences(currentNode.id);
    expect(currentNode.data?.generationProvenance?.stale).toBe(true);
  });

  it("cancels the active run and returns the image node to an editable state", async () => {
    let currentNode: CanvasNode = {
      ...imageNode(),
      data: { ...imageNode().data!, taskInfo: { runId: "run-image-1", status: "processing" as const } },
    };
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => currentNode),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
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
      inputSchema: {
        prompt: { required: true },
        parameters: [],
        assets: [{ key: "imageUrls", label: "Reference images", mediaType: "image", maxFiles: 1 }],
      },
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
      assets: [{
        slot: "imageUrls",
        bindingId: "edge:edge-derived-1",
        order: 0,
        ref: { type: "workspace-file", relativePath: "assets/imports/reference.png" },
      }],
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
        assets: [
          { key: "firstFrameUrl", label: "First frame", mediaType: "image", required: true, maxFiles: 1 },
          { key: "lastFrameUrl", label: "Last frame", mediaType: "image", maxFiles: 1 },
        ],
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

  it("does not duplicate an explicit last frame into the first-frame slot", async () => {
    const target = videoNode();
    const last = {
      ...imageNode(),
      id: "frame-last",
      data: {
        ...imageNode().data!,
        name: "Ending",
        workspaceFile: { relativePath: "assets/ending.png", contentType: "image/png", name: "ending.png" },
      },
    };
    const nodes = new Map([[target.id, target], [last.id, last]]);
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
      id: "route-video-last-frame",
      enabled: true,
      isDefault: false,
      capability: "image-to-video",
      inputSchema: {
        prompt: { required: true },
        assets: [{ key: "lastFrameUrl", label: "Last frame", mediaType: "image", maxFiles: 1 }],
      },
    };
    const runs = {
      ensureSession: vi.fn(),
      getRoute: vi.fn().mockResolvedValue(route),
      createRun: vi.fn().mockResolvedValue({ run: { id: "run-video-last-frame" } }),
    } as unknown as GenerationRunService;

    await createService(repository, {} as LlmPort, runs).generate(target.id, {
      prompt: "End on this frame",
      promptDocument: lastFramePromptDocument(),
      routeId: route.id,
    });

    expect(runs.createRun).toHaveBeenCalledWith(expect.objectContaining({
      assets: [
        { slot: "lastFrameUrl", bindingId: "mention-last", order: 0, ref: { type: "workspace-file", relativePath: "assets/ending.png" } },
      ],
    }));
  });

  it("lists only this node's runs newest first", async () => {
    const repository = {
      getCanvasNode: vi.fn().mockResolvedValue(videoNode()),
    } as unknown as PipelineRepository;
    const older = { run: { id: "older", sourceRef: "pipeline:canvas:video-node-1", createdAt: "2026-08-20T00:00:00.000Z" }, jobs: [], artifacts: [] };
    const newer = { run: { id: "newer", sourceRef: "pipeline:canvas:video-node-1", createdAt: "2026-08-21T00:00:00.000Z" }, jobs: [], artifacts: [] };
    const unrelated = { run: { id: "other", sourceRef: "pipeline:canvas:other-node", createdAt: "2026-08-22T00:00:00.000Z" }, jobs: [], artifacts: [] };
    const runs = {
      listRunsForContext: vi.fn().mockResolvedValue([older, unrelated, newer]),
    } as unknown as GenerationRunService;

    const result = await createService(repository, {} as LlmPort, runs).listNodeGenerationRuns("video-node-1");

    expect(result.map((view) => view.run.id)).toEqual(["newer", "older"]);
    expect(runs.listRunsForContext).toHaveBeenCalledWith("pipeline:project-1");
  });

  it("selects a video artifact from this node without mutating run history", async () => {
    let current = videoNode();
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => current),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        current = { ...current, ...patch, updatedAt: "2026-08-22T00:00:00.000Z" };
        return current;
      }),
    } as unknown as PipelineRepository;
    const runs = {
      listRunsForContext: vi.fn().mockResolvedValue([{
        run: {
          id: "run-video-1",
          sourceRef: "pipeline:canvas:video-node-1",
          status: "succeeded",
          createdAt: "2026-08-21T10:00:00.000Z",
        },
        jobs: [],
        artifacts: [{ id: "artifact-video-1", kind: "video" }],
      }]),
      getRun: vi.fn().mockResolvedValue({
        run: {
          id: "run-video-1",
          sourceRef: "pipeline:canvas:video-node-1",
          status: "succeeded",
          completedAt: "2026-08-21T12:00:00.000Z",
        },
        jobs: [],
        artifacts: [{
          id: "artifact-video-1",
          runId: "run-video-1",
          jobId: "job-1",
          kind: "video",
          remoteUrl: "https://media.example/video.mp4",
          createdAt: "2026-08-21T11:59:00.000Z",
        }],
      }),
    } as unknown as GenerationRunService;

    const result = await createService(repository, {} as LlmPort, runs)
      .selectNodeGenerationArtifact("video-node-1", "run-video-1", "artifact-video-1");

    expect(result.data).toMatchObject({
      url: ["https://media.example/video.mp4"],
      artifactIds: ["artifact-video-1"],
      taskInfo: { runId: "run-video-1", status: "completed" },
      videoSelection: {
        runId: "run-video-1",
        artifactId: "artifact-video-1",
        completedAt: "2026-08-21T12:00:00.000Z",
      },
    });
  });

  it("rejects selecting a partial artifact from a failed video run", async () => {
    const repository = {
      getCanvasNode: vi.fn().mockResolvedValue(videoNode()),
    } as unknown as PipelineRepository;
    const runs = {
      getRun: vi.fn().mockResolvedValue({
        run: {
          id: "run-video-failed",
          sourceRef: "pipeline:canvas:video-node-1",
          status: "failed",
        },
        jobs: [],
        artifacts: [{ id: "artifact-partial", kind: "video" }],
      }),
    } as unknown as GenerationRunService;

    await expect(createService(repository, {} as LlmPort, runs)
      .selectNodeGenerationArtifact("video-node-1", "run-video-failed", "artifact-partial"))
      .rejects.toMatchObject({ status: 409 });
  });

  it("keeps the upload source while making a completed Take current", async () => {
    let current: CanvasNode = {
      ...videoNode(),
      data: {
        ...videoNode().data!,
        workspaceFile: { relativePath: "assets/imports/original.mp4", contentType: "video/mp4", name: "original.mp4" },
      },
    };
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => current),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        current = { ...current, ...patch };
        return current;
      }),
    } as unknown as PipelineRepository;
    const runs = {
      getRun: vi.fn().mockResolvedValue({ run: { completedAt: "2026-08-25T01:00:00.000Z" } }),
    } as unknown as GenerationRunService;

    await createService(repository, {} as LlmPort, runs).completeGeneration("video-node-1", "run-video-2", [{
      id: "artifact-video-2",
      runId: "run-video-2",
      jobId: "job-2",
      kind: "video",
      localPath: "generated/take-2.mp4",
      createdAt: "2026-08-25T00:59:00.000Z",
    }]);

    expect(current.data).toMatchObject({
      workspaceFile: { relativePath: "assets/imports/original.mp4" },
      artifactIds: ["artifact-video-2"],
      videoSelection: {
        runId: "run-video-2",
        artifactId: "artifact-video-2",
        completedAt: "2026-08-25T01:00:00.000Z",
        historical: false,
      },
    });
  });

  it("preserves every artifact for non-video generation completions", async () => {
    let current = imageNode();
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => current),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        current = { ...current, ...patch };
        return current;
      }),
    } as unknown as PipelineRepository;

    const runs = {
      getRun: vi.fn().mockResolvedValue({ run: { id: "run-image-multi", input: {} }, jobs: [], artifacts: [] }),
    } as unknown as GenerationRunService;
    await createService(repository, {} as LlmPort, runs).completeGeneration("image-node-1", "run-image-multi", [
      {
        id: "artifact-image-1",
        runId: "run-image-multi",
        jobId: "job-image",
        kind: "image",
        remoteUrl: "https://media.example/one.png",
        createdAt: "2026-08-25T01:00:00.000Z",
      },
      {
        id: "artifact-image-2",
        runId: "run-image-multi",
        jobId: "job-image",
        kind: "image",
        remoteUrl: "https://media.example/two.png",
        createdAt: "2026-08-25T01:00:01.000Z",
      },
    ]);

    expect(current.data).toMatchObject({
      url: ["https://media.example/one.png", "https://media.example/two.png"],
      artifactIds: ["artifact-image-1", "artifact-image-2"],
    });
  });

  it("marks a video node failed when a completed run has no video artifact", async () => {
    let current = videoNode();
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => current),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        current = { ...current, ...patch };
        return current;
      }),
    } as unknown as PipelineRepository;

    await createService(repository).completeGeneration("video-node-1", "run-without-video", [{
      id: "artifact-last-frame",
      runId: "run-without-video",
      jobId: "job-video",
      kind: "image",
      createdAt: "2026-08-25T01:00:00.000Z",
    }]);

    expect(current.data?.taskInfo).toMatchObject({
      runId: "run-without-video",
      status: "failed",
      errorMessage: "The generation completed without a video artifact",
    });
    expect(current.data?.videoSelection).toBeUndefined();
  });

  it("switches back to the retained upload source without deleting history", async () => {
    let current: CanvasNode = {
      ...videoNode(),
      data: {
        ...videoNode().data!,
        workspaceFile: { relativePath: "assets/imports/original.mp4", contentType: "video/mp4", name: "original.mp4" },
        artifactIds: ["artifact-video-2"],
        videoSelection: {
          runId: "run-video-2",
          artifactId: "artifact-video-2",
          completedAt: "2026-08-25T01:00:00.000Z",
        },
      },
    };
    const repository = {
      getCanvasNode: vi.fn().mockImplementation(async () => current),
      listCanvasEdges: vi.fn().mockResolvedValue([]),
      updateCanvasNode: vi.fn().mockImplementation(async (_id: string, patch: Partial<CanvasNode>) => {
        current = { ...current, ...patch };
        return current;
      }),
    } as unknown as PipelineRepository;

    const result = await createService(repository).selectNodeUploadSource("video-node-1");

    expect(result.data).toMatchObject({
      workspaceFile: { relativePath: "assets/imports/original.mp4" },
      url: ["/api/pipeline/canvas-nodes/video-node-1/media"],
      taskInfo: { status: "idle" },
    });
    expect(result.data?.artifactIds).toBeUndefined();
    expect(result.data?.videoSelection).toBeUndefined();
  });

  it("rejects a last-frame edge role without a first frame", async () => {
    const source = imageNode();
    const target = videoNode();
    const repository = {
      getProject: vi.fn().mockResolvedValue(project),
      listCanvasNodes: vi.fn().mockResolvedValue([source, target]),
      listCanvasEdges: vi.fn().mockResolvedValue([{
        id: "edge-1",
        projectId: project.id,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        edgeType: "references",
        role: "reference",
        order: 0,
      }]),
      applyCanvasMutationBatch: vi.fn(),
    } as unknown as PipelineRepository;

    await expect(createService(repository).applyMutationBatch(project.id, {
      baseRevision: 0,
      requestId: "edge-role-1",
      mutations: [{ type: "edge.update", edgeId: "edge-1", patch: { role: "last-frame" } }],
    })).rejects.toMatchObject({ status: 409 });
    expect(repository.applyCanvasMutationBatch).not.toHaveBeenCalled();
  });

  it("blocks node cancellation and destructive edits owned by an active workflow", async () => {
    const node = imageNode();
    node.data = { ...node.data!, taskInfo: { runId: "generation-1", status: "processing" } };
    const repository = {
      ...repositoryStub({ applied: true, revision: 1 }),
      getCanvasNode: vi.fn().mockResolvedValue(node),
      listCanvasNodes: vi.fn().mockResolvedValue([node]),
      listActiveCanvasWorkflowRuns: vi.fn().mockResolvedValue([{
        id: "workflow-1",
        projectId: project.id,
        status: "running",
        nodeIds: [node.id],
        edges: [],
        steps: [{ nodeId: node.id, status: "running", generationRunId: "generation-1" }],
      }]),
    } as unknown as PipelineRepository;
    const runs = { cancelRun: vi.fn() } as unknown as GenerationRunService;
    const service = createService(repository, {} as LlmPort, runs);

    await expect(service.cancelGeneration(node.id)).rejects.toMatchObject({
      code: "PIPELINE_WORKFLOW_RUN_ACTIVE",
      status: 409,
    });
    await expect(service.applyMutationBatch(project.id, {
      baseRevision: 0,
      requestId: "delete-active-workflow-node",
      mutations: [{ type: "node.delete", nodeId: node.id }],
    })).rejects.toMatchObject({ code: "PIPELINE_WORKFLOW_RUN_ACTIVE" });

    expect(runs.cancelRun).not.toHaveBeenCalled();
    expect(repository.applyCanvasMutationBatch).not.toHaveBeenCalled();
  });

  it("preflights a workflow media node without creating a generation run", async () => {
    const node = imageNode();
    node.data = { ...node.data!, params: { prompt: "A quiet product image", routeId: "image-route" } };
    const repository = {
      getCanvasNode: vi.fn().mockResolvedValue(node),
    } as unknown as PipelineRepository;
    const route = {
      id: "image-route",
      enabled: true,
      isDefault: true,
      capability: "text-to-image",
      inputSchema: { prompt: { required: true }, assets: [], parameters: [] },
    };
    const runs = {
      getRoute: vi.fn().mockResolvedValue(route),
      listRoutes: vi.fn().mockResolvedValue([route]),
      validateRunInput: vi.fn().mockResolvedValue(undefined),
      createRun: vi.fn(),
    } as unknown as GenerationRunService;

    await createService(repository, {} as LlmPort, runs)
      .preflightWorkflowNode(node.id, new Set([node.id]));

    expect(runs.validateRunInput).toHaveBeenCalledWith(expect.objectContaining({
      capability: "text-to-image",
      routeId: "image-route",
      prompt: "A quiet product image",
    }));
    expect(runs.createRun).not.toHaveBeenCalled();
  });

  it("rejects an audio file larger than 10 MiB before writing an asset", async () => {
    const assets = { upload: vi.fn() } as unknown as GenerationAssetService;
    const service = createService({} as PipelineRepository, {} as LlmPort, {} as GenerationRunService, assets);

    await expect(service.upload({
      projectId: "project-1",
      name: "narration.mp3",
      contentType: "audio/mpeg",
      data: new Uint8Array(MAX_CANVAS_AUDIO_UPLOAD_BYTES + 1),
      positionX: 0,
      positionY: 0,
    })).rejects.toMatchObject({ code: "FILE_TOO_LARGE", status: 413 });
    expect(assets.upload).not.toHaveBeenCalled();
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
  sse = { emit: vi.fn() } as unknown as PipelineSsePort,
) {
  if (!("listActiveCanvasWorkflowRuns" in repository)) {
    Object.assign(repository, { listActiveCanvasWorkflowRuns: vi.fn().mockResolvedValue([]) });
  }
  return new CanvasStudioService(
    repository,
    runs,
    assets,
    llm,
    sse,
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

function lastFramePromptDocument(): CanvasPromptDocument {
  return {
    schemaVersion: 1,
    format: "tiptap-json",
    plainText: "End on this frame @Ending",
    content: {
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "End on this frame " },
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
