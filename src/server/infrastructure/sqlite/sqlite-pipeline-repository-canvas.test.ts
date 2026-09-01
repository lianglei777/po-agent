import { afterEach, describe, expect, it } from "vitest";
import type { CanvasNode } from "@/server/domain/pipeline";
import { SqliteDatabase } from "./sqlite-database";
import { SqlitePipelineRepository } from "./sqlite-pipeline-repository";

describe("SqlitePipelineRepository canvas mutations", () => {
  let database: SqliteDatabase | undefined;

  afterEach(() => database?.close());

  it("applies a canvas batch atomically and increments revision", async () => {
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
    const node = makeNode();

    expect(await repository.applyCanvasMutationBatch("project-1", 0, [
      { type: "node.create", node },
      { type: "viewport.update", viewport: { x: 12, y: 18, zoom: 0.8 } },
    ])).toEqual({ applied: true, revision: 1 });
    expect((await repository.listCanvasNodes("project-1")).map((item) => item.id)).toEqual(["node-1"]);
    expect(await repository.getCanvasViewport("project-1")).toEqual({ x: 12, y: 18, zoom: 0.8 });
  });

  it("rejects stale revisions without applying mutations", async () => {
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
    expect(await repository.applyCanvasMutationBatch("project-1", 1, [{ type: "node.create", node: makeNode() }]))
      .toEqual({ applied: false, revision: 0 });
    expect(await repository.listCanvasNodes("project-1")).toEqual([]);
  });

  it("persists edge role and order updates", async () => {
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
    const source = makeNode("image-1", "image");
    const target = makeNode("video-1", "video");
    await repository.applyCanvasMutationBatch("project-1", 0, [
      { type: "node.create", node: source },
      { type: "node.create", node: target },
      {
        type: "edge.create",
        edge: {
          id: "edge-1",
          projectId: "project-1",
          sourceNodeId: source.id,
          targetNodeId: target.id,
          edgeType: "references",
          role: "reference",
          order: 0,
        },
      },
    ]);

    await repository.applyCanvasMutationBatch("project-1", 1, [
      { type: "edge.update", edgeId: "edge-1", patch: { role: "first-frame", order: 2 } },
    ]);

    expect(await repository.getCanvasEdge("edge-1")).toMatchObject({ role: "first-frame", order: 2 });
  });

  it("persists workflow runs and keeps failed runs active while a sibling step is still running", async () => {
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

    const run = await repository.createCanvasWorkflowRun({
      id: "workflow-run-1",
      projectId: "project-1",
      nodeIds: ["image-1", "video-1"],
      edges: [{ sourceNodeId: "image-1", targetNodeId: "video-1" }],
      steps: [
        { nodeId: "image-1", status: "pending" },
        { nodeId: "video-1", status: "pending" },
      ],
    });
    expect(run).toMatchObject({ status: "pending", steps: [{ nodeId: "image-1" }, { nodeId: "video-1" }] });
    await expect(repository.createCanvasWorkflowRun({
      id: "workflow-run-2",
      projectId: "project-1",
      nodeIds: ["image-1"],
      edges: [],
      steps: [{ nodeId: "image-1", status: "pending" }],
    })).rejects.toThrow();

    await repository.updateCanvasWorkflowRun("workflow-run-1", { status: "failed", errorMessage: "first branch failed" });
    await repository.updateCanvasWorkflowRunStep("workflow-run-1", "video-1", {
      status: "running",
      generationRunId: "generation-run-1",
    });

    expect(await repository.findCanvasWorkflowRunByGenerationRunId("project-1", "generation-run-1"))
      .toMatchObject({ id: "workflow-run-1" });
    expect(await repository.listActiveCanvasWorkflowRuns("project-1"))
      .toHaveLength(1);

    await repository.updateCanvasWorkflowRunStep("workflow-run-1", "video-1", { status: "completed" });
    expect(await repository.listActiveCanvasWorkflowRuns("project-1"))
      .toHaveLength(0);
  });

  it("persists reusable lip-sync preparations without exposing storage JSON details", async () => {
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
    await repository.applyCanvasMutationBatch("project-1", 0, [
      { type: "node.create", node: makeNode("video-1", "video") },
    ]);

    await repository.createLipSyncPreparation({
      id: "preparation-1",
      nodeId: "video-1",
      projectId: "project-1",
      videoFingerprint: "fingerprint-1",
      remoteTaskId: "task-1",
      status: "analyzing",
      faces: [],
    });
    await repository.updateLipSyncPreparation("preparation-1", {
      status: "ready",
      providerSessionId: "session-1",
      faces: [{ key: "face-1", providerFaceId: "0", availableStartMs: 0, availableEndMs: 4_000 }],
    });

    await expect(repository.findLipSyncPreparation("video-1", "fingerprint-1"))
      .resolves.toMatchObject({
        id: "preparation-1",
        providerSessionId: "session-1",
        status: "ready",
        faces: [{ key: "face-1", providerFaceId: "0" }],
      });
  });
});

function makeNode(id = "node-1", type: "text" | "image" | "video" = "text"): CanvasNode {
  return {
    id,
    projectId: "project-1",
    type,
    entityId: `${id}-entity`,
    positionX: 20,
    positionY: 30,
    width: 320,
    height: 220,
    data: { type, name: id, action: `${type}_generate`, content: type === "text" ? [""] : undefined },
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
  };
}
