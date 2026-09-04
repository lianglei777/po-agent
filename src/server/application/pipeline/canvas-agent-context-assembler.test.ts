import { describe, expect, it, vi } from "vitest";
import type { CanvasNode, PipelineProject } from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";
import { CanvasAgentContextAssembler } from "./canvas-agent-context-assembler";

describe("CanvasAgentContextAssembler", () => {
  it("uses the latest canvas revision and includes one-hop related nodes", async () => {
    const selected = node("selected", "剧本", "第一幕");
    const related = node("related", "分镜 1", "雨夜街道");
    const repository = repositoryStub([selected, related]);
    const context = await new CanvasAgentContextAssembler(repository).assemble("project-1", {
      canvasRevision: 3,
      selectedNodeIds: [selected.id],
      mentionedNodeIds: [],
    });

    expect(context).toContain('"currentRevision":4');
    expect(context).toContain('"clientWasStale":true');
    expect(context).toContain('"name":"剧本"');
    expect(context).toContain('"name":"分镜 1"');
    expect(context).toContain('"sourceNodeId":"selected"');
  });

  it("rejects deleted or cross-project node identifiers", async () => {
    const assembler = new CanvasAgentContextAssembler(repositoryStub([]));
    await expect(assembler.assemble("project-1", {
      canvasRevision: 4,
      selectedNodeIds: ["other-project-node"],
      mentionedNodeIds: [],
    })).rejects.toMatchObject({ code: "PIPELINE_CANVAS_NODE_NOT_FOUND", status: 404 });
  });

  it("includes confirmed continuity and marks stale asset analysis", async () => {
    const selected = { ...node("image-1", "产品图", ""), type: "image" as const,
      data: { type: "image" as const, name: "产品图", action: "image_generate" }, updatedAt: "node-v2" };
    const repository = repositoryStub([selected]);
    vi.mocked(repository.getCanvasContinuityBible).mockResolvedValue({
      projectId: "project-1", revision: 2, updatedAt: "now", entries: [{
        id: "entry-1", category: "product", label: "产品颜色", value: "保持红色",
        sourceAnalysisIds: ["analysis-1"], confirmationQuote: "保持红色", updatedAt: "now",
      }],
    });
    vi.mocked(repository.listCanvasAssetAnalyses).mockResolvedValue([{
      id: "analysis-1", projectId: "project-1", nodeId: selected.id, nodeVersion: "node-v1",
      sourceFingerprint: "hash", mediaType: "image", sourceName: "product.png", contentType: "image/png",
      modelProvider: "provider", modelId: "vision", createdAt: "now", content: {
        summary: "红色产品图", subjects: ["产品"], composition: "居中", materials: [], style: "商业",
        lighting: "柔光", visibleText: [], brandElements: [], suggestedRoles: ["subject"], technicalMetadata: {},
      },
    }]);

    const context = await new CanvasAgentContextAssembler(repository).assemble("project-1", {
      canvasRevision: 4, selectedNodeIds: [selected.id], mentionedNodeIds: [],
    });
    expect(context).toContain('"value":"保持红色"');
    expect(context).toContain('"stale":true');
    expect(context).toContain('"summary":"红色产品图"');
  });
});

function repositoryStub(nodes: CanvasNode[]) {
  return {
    getProject: vi.fn(async () => project()),
    getCanvasRevision: vi.fn(async () => 4),
    listCanvasNodes: vi.fn(async () => nodes),
    listCanvasEdges: vi.fn(async () => nodes.length < 2 ? [] : [{
      id: "edge-1",
      projectId: "project-1",
      sourceNodeId: nodes[0]!.id,
      targetNodeId: nodes[1]!.id,
      edgeType: "references" as const,
      role: "reference" as const,
      order: 0,
    }]),
    getStageStatuses: vi.fn(async () => []),
    getCanvasContinuityBible: vi.fn(async () => null),
    listCanvasAssetAnalyses: vi.fn(async () => []),
  } as unknown as PipelineRepository;
}

function project(): PipelineProject {
  return {
    id: "project-1",
    rootPath: "D:\\project",
    title: "Demo",
    originalText: "",
    artDirection: null,
    modelSettings: null,
    promptConfig: null,
    status: "draft",
    coverArtifactId: null,
    createdAt: "now",
    updatedAt: "now",
  };
}

function node(id: string, name: string, text: string): CanvasNode {
  return {
    id,
    projectId: "project-1",
    type: "text",
    entityId: id,
    positionX: 0,
    positionY: 0,
    width: 320,
    height: 200,
    data: { type: "text", name, action: "generate", content: [text] },
    createdAt: "now",
    updatedAt: "now",
  };
}
