import { afterEach, describe, expect, it } from "vitest";
import { SqliteDatabase } from "./sqlite-database";
import { SqlitePipelineRepository } from "./sqlite-pipeline-repository";

describe("SqlitePipelineRepository canvas asset understanding", () => {
  let database: SqliteDatabase | undefined;
  afterEach(() => database?.close());

  it("persists reusable analyses and project continuity independently", async () => {
    database = new SqliteDatabase(":memory:");
    const repository = new SqlitePipelineRepository(database);
    await repository.createProject({ id: "project-1", rootPath: ".", title: "Project", originalText: "",
      artDirection: null, modelSettings: null, promptConfig: null, status: "draft", coverArtifactId: null });
    const node = await repository.createCanvasNode({
      id: "image-1", projectId: "project-1", type: "image", entityId: "entity-1",
      positionX: 0, positionY: 0, data: { type: "image", name: "Product", action: "image_generate" },
    });
    const analysis = await repository.createCanvasAssetAnalysis({
      id: "analysis-1", projectId: "project-1", nodeId: node.id, nodeVersion: node.updatedAt,
      sourceFingerprint: "sha256", mediaType: "image", sourceName: "product.png", contentType: "image/png",
      modelProvider: "provider", modelId: "vision", content: {
        summary: "Red shoe", subjects: ["shoe"], composition: "centered", materials: ["mesh"],
        style: "commercial", lighting: "soft", visibleText: [], brandElements: [],
        suggestedRoles: ["subject"], technicalMetadata: {},
      },
    });
    await repository.saveCanvasContinuityBible({
      projectId: "project-1", revision: 1, updatedAt: "now", entries: [{
        id: "entry-1", category: "product", label: "shoe", value: "keep red mesh upper",
        sourceAnalysisIds: [analysis.id], confirmationQuote: "keep it red", updatedAt: "now",
      }],
    });

    await expect(repository.findCanvasAssetAnalysis({
      nodeId: node.id, sourceFingerprint: "sha256", modelProvider: "provider", modelId: "vision",
    })).resolves.toMatchObject({ id: analysis.id, content: { subjects: ["shoe"] } });
    await expect(repository.getCanvasAssetAnalysis(analysis.id)).resolves.toMatchObject({ nodeId: node.id });
    await expect(repository.listCanvasAssetAnalyses("project-1", [node.id]))
      .resolves.toMatchObject([{ id: analysis.id }]);
    await expect(repository.getCanvasContinuityBible("project-1"))
      .resolves.toMatchObject({ revision: 1, entries: [{ value: "keep red mesh upper" }] });
  });
});
