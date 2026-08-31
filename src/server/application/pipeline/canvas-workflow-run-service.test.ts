import { afterEach, describe, expect, it, vi } from "vitest";
import type { CanvasNode } from "@/server/domain/pipeline";
import type { GenerationRunService } from "@/server/application/content-generation/generation-run-service";
import type { PipelineSsePort } from "@/server/ports/pipeline-sse-port";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqlitePipelineRepository } from "@/server/infrastructure/sqlite/sqlite-pipeline-repository";
import type { CanvasStudioService } from "./canvas-studio-service";
import { CanvasWorkflowRunService } from "./canvas-workflow-run-service";

describe("CanvasWorkflowRunService", () => {
  let database: SqliteDatabase | undefined;

  afterEach(() => database?.close());

  it("runs dependent generation nodes in topological order and persists their generation runs", async () => {
    const repository = await createRepository();
    const canvas = {
      preflightWorkflowNode: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn()
        .mockResolvedValueOnce({ node: imageNode(), runId: "generation-image" })
        .mockResolvedValueOnce({ node: videoNode(), runId: "generation-video" }),
    } as unknown as CanvasStudioService;
    const sse = { emit: vi.fn() } as unknown as PipelineSsePort;
    const service = new CanvasWorkflowRunService(
      repository,
      {} as GenerationRunService,
      canvas,
      sse,
      { createId: () => "workflow-run-1", now: () => new Date("2026-08-29T00:00:00.000Z") },
    );

    await service.create({ projectId: "project-1", nodeIds: ["image-1", "video-1"] });
    await vi.waitFor(() => expect(canvas.generate).toHaveBeenCalledTimes(1));
    const started = (await repository.getCanvasWorkflowRun("workflow-run-1"))!;
    expect(started.steps).toEqual([
      expect.objectContaining({ nodeId: "image-1", status: "running", generationRunId: "generation-image" }),
      expect.objectContaining({ nodeId: "video-1", status: "pending" }),
    ]);

    await service.handleGenerationCompleted("project-1", "image-1", "generation-image");
    await vi.waitFor(() => expect(canvas.generate).toHaveBeenCalledTimes(2));
    expect(await repository.getCanvasWorkflowRun("workflow-run-1")).toMatchObject({
      status: "running",
      steps: [
        { nodeId: "image-1", status: "completed" },
        { nodeId: "video-1", status: "running", generationRunId: "generation-video" },
      ],
    });

    await service.handleGenerationCompleted("project-1", "video-1", "generation-video");
    await vi.waitFor(async () => expect(await repository.getCanvasWorkflowRun("workflow-run-1"))
      .toMatchObject({ status: "completed", completedAt: "2026-08-29T00:00:00.000Z" }));
    expect(sse.emit).toHaveBeenCalledWith(expect.objectContaining({ type: "workflow_run_updated" }));
  });

  it("keeps completed work and retries a failed synchronous step", async () => {
    const repository = await createRepository(false);
    const canvas = {
      preflightWorkflowNode: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn()
        .mockRejectedValueOnce(new Error("text model unavailable"))
        .mockResolvedValueOnce({ node: imageNode(), runId: "generation-image" }),
    } as unknown as CanvasStudioService;
    const service = new CanvasWorkflowRunService(
      repository,
      {} as GenerationRunService,
      canvas,
      { emit: vi.fn() } as unknown as PipelineSsePort,
      { createId: () => "workflow-run-1", now: () => new Date("2026-08-29T00:00:00.000Z") },
    );

    await service.create({ projectId: "project-1", nodeIds: ["image-1"] });
    await vi.waitFor(async () => expect(await repository.getCanvasWorkflowRun("workflow-run-1"))
      .toMatchObject({ status: "failed" }));
    const failed = (await repository.getCanvasWorkflowRun("workflow-run-1"))!;
    expect(failed).toMatchObject({ status: "failed", steps: [{ nodeId: "image-1", status: "failed" }] });

    await service.retry("project-1", "workflow-run-1");
    await vi.waitFor(() => expect(canvas.generate).toHaveBeenCalledTimes(2));
    const retried = (await repository.getCanvasWorkflowRun("workflow-run-1"))!;
    expect(retried).toMatchObject({
      status: "running",
      steps: [{ nodeId: "image-1", status: "running", generationRunId: "generation-image" }],
    });
    expect(canvas.generate).toHaveBeenCalledTimes(2);
  });

  it("recovers a succeeded generation run and continues the frozen workflow", async () => {
    const repository = await createRepository();
    await repository.createCanvasWorkflowRun({
      id: "workflow-run-1",
      projectId: "project-1",
      nodeIds: ["image-1", "video-1"],
      edges: [{ sourceNodeId: "image-1", targetNodeId: "video-1" }],
      steps: [
        { nodeId: "image-1", status: "pending" },
        { nodeId: "video-1", status: "pending" },
      ],
    });
    await repository.updateCanvasWorkflowRun("workflow-run-1", { status: "running" });
    await repository.updateCanvasWorkflowRunStep("workflow-run-1", "image-1", {
      status: "running",
      generationRunId: "generation-image",
    });
    const canvas = {
      completeGeneration: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({ node: videoNode(), runId: "generation-video" }),
    } as unknown as CanvasStudioService;
    const generations = {
      getRun: vi.fn().mockResolvedValue({
        run: { id: "generation-image", status: "succeeded", completedAt: "2026-08-29T00:00:00.000Z" },
        artifacts: [{ id: "artifact-image", kind: "image" }],
      }),
    } as unknown as GenerationRunService;
    const service = new CanvasWorkflowRunService(
      repository,
      generations,
      canvas,
      { emit: vi.fn() } as unknown as PipelineSsePort,
      { now: () => new Date("2026-08-29T00:00:00.000Z") },
    );

    await service.list("project-1", 1);
    await vi.waitFor(() => expect(canvas.generate).toHaveBeenCalledTimes(1));
    const recovered = (await repository.getCanvasWorkflowRun("workflow-run-1"))!;

    expect(canvas.completeGeneration).toHaveBeenCalledWith("image-1", "generation-image", [expect.objectContaining({ id: "artifact-image" })]);
    expect(canvas.generate).toHaveBeenCalledWith(
      "video-1",
      undefined,
      { idempotencyKey: "pipeline:workflow:workflow-run-1:video-1" },
    );
    expect(recovered).toMatchObject({
      status: "running",
      steps: [
        { nodeId: "image-1", status: "completed" },
        { nodeId: "video-1", status: "running", generationRunId: "generation-video" },
      ],
    });
  });

  it("cancels the active generation step and prevents pending steps from starting", async () => {
    const repository = await createRepository();
    const canvas = {
      preflightWorkflowNode: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({ node: imageNode(), runId: "generation-image" }),
      cancelGeneration: vi.fn().mockResolvedValue(imageNode()),
    } as unknown as CanvasStudioService;
    const service = new CanvasWorkflowRunService(
      repository,
      {} as GenerationRunService,
      canvas,
      { emit: vi.fn() } as unknown as PipelineSsePort,
      { createId: () => "workflow-run-1", now: () => new Date("2026-08-29T00:00:00.000Z") },
    );
    await service.create({ projectId: "project-1", nodeIds: ["image-1", "video-1"] });
    await vi.waitFor(() => expect(canvas.generate).toHaveBeenCalledTimes(1));

    const cancelled = await service.cancel("project-1", "workflow-run-1");

    expect(canvas.cancelGeneration).toHaveBeenCalledWith("image-1", { workflowRunId: "workflow-run-1" });
    expect(cancelled).toMatchObject({
      status: "cancelled",
      steps: [
        { nodeId: "image-1", status: "cancelled" },
        { nodeId: "video-1", status: "cancelled" },
      ],
    });
    expect(canvas.generate).toHaveBeenCalledTimes(1);
  });

  it("rejects the whole workflow before starting any paid generation when preflight fails", async () => {
    const repository = await createRepository();
    const canvas = {
      preflightWorkflowNode: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("video route is unavailable")),
      generate: vi.fn(),
    } as unknown as CanvasStudioService;
    const service = new CanvasWorkflowRunService(
      repository,
      {} as GenerationRunService,
      canvas,
      { emit: vi.fn() } as unknown as PipelineSsePort,
    );

    await expect(service.create({ projectId: "project-1", nodeIds: ["image-1", "video-1"] }))
      .rejects.toThrow("video route is unavailable");

    expect(canvas.generate).not.toHaveBeenCalled();
    expect(await repository.listCanvasWorkflowRuns("project-1", 10)).toEqual([]);
  });

  it("turns an externally cancelled generation into a retryable failed step", async () => {
    const repository = await createRepository(false);
    await repository.createCanvasWorkflowRun({
      id: "workflow-run-cancelled",
      projectId: "project-1",
      nodeIds: ["image-1"],
      edges: [],
      steps: [{ nodeId: "image-1", status: "pending" }],
    });
    await repository.updateCanvasWorkflowRun("workflow-run-cancelled", { status: "running" });
    await repository.updateCanvasWorkflowRunStep("workflow-run-cancelled", "image-1", {
      status: "running",
      generationRunId: "generation-image",
    });
    const canvas = {
      retryNodeGeneration: vi.fn().mockResolvedValue({
        node: imageNode(),
        view: { run: { id: "generation-image" } },
      }),
    } as unknown as CanvasStudioService;
    const generations = {
      getRun: vi.fn().mockResolvedValue({
        run: { id: "generation-image", status: "cancelled", completedAt: "2026-08-29T00:00:00.000Z" },
        artifacts: [],
      }),
    } as unknown as GenerationRunService;
    const service = new CanvasWorkflowRunService(
      repository,
      generations,
      canvas,
      { emit: vi.fn() } as unknown as PipelineSsePort,
      { now: () => new Date("2026-08-29T00:00:00.000Z") },
    );

    await service.list("project-1", 1);
    expect(await repository.getCanvasWorkflowRun("workflow-run-cancelled")).toMatchObject({
      status: "failed",
      steps: [{ nodeId: "image-1", status: "failed", errorMessage: expect.stringContaining("cancelled") }],
    });

    await service.retry("project-1", "workflow-run-cancelled");
    expect(canvas.retryNodeGeneration).toHaveBeenCalledWith(
      "image-1",
      "generation-image",
      expect.stringContaining("pipeline:workflow:workflow-run-cancelled:image-1:retry:"),
    );
  });

  async function createRepository(withEdge = true) {
    database = new SqliteDatabase(":memory:");
    const repository = new SqlitePipelineRepository(database);
    await repository.createProject({
      id: "project-1",
      rootPath: ".",
      title: "Project",
      originalText: "",
      artDirection: null,
      modelSettings: null,
      promptConfig: null,
      status: "draft",
      coverArtifactId: null,
    });
    const mutations: Parameters<typeof repository.applyCanvasMutationBatch>[2] = [
      { type: "node.create", node: imageNode() },
      { type: "node.create", node: videoNode() },
    ];
    if (withEdge) {
      mutations.push({
        type: "edge.create",
        edge: {
          id: "edge-1",
          projectId: "project-1",
          sourceNodeId: "image-1",
          targetNodeId: "video-1",
          edgeType: "references",
        },
      });
    }
    await repository.applyCanvasMutationBatch("project-1", 0, mutations);
    return repository;
  }
});

function imageNode(): CanvasNode {
  return {
    id: "image-1",
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
      params: { prompt: "Create a keyframe" },
      taskInfo: { status: "idle" },
    },
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
  };
}

function videoNode(): CanvasNode {
  return {
    ...imageNode(),
    id: "video-1",
    type: "video",
    entityId: "video-entity-1",
    positionX: 440,
    data: {
      type: "video",
      name: "Video",
      action: "video_generate",
      generatorType: "default",
      params: { prompt: "Animate the keyframe" },
      taskInfo: { status: "idle" },
    },
  };
}
