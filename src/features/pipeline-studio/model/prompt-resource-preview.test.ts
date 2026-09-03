import { describe, expect, it } from "vitest";
import type { CanvasNode, CanvasPromptDocument, CanvasResourceReferenceAttrs } from "@/contracts/pipeline";
import { promptDocumentPreviewReferences, promptResourceBindings, resolvePromptResourcePreview } from "./prompt-resource-preview";

const document: CanvasPromptDocument = {
  schemaVersion: 1,
  format: "tiptap-json",
  plainText: "@图一 @图一 @片段",
  content: {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [
        reference("ref-1", "canvas-node", "node-1", "image", "图一"),
        reference("ref-2", "canvas-node", "node-1", "image", "图一"),
        reference("ref-3", "canvas-node", "node-2", "video", "片段"),
      ],
    }],
  },
};

describe("prompt resource previews", () => {
  it("groups an upstream edge and all matching @ occurrences into one resource binding", () => {
    const source = canvasNode("node-1", "image", "图一");
    const target = canvasNode("target", "image", "目标");
    const promptReferences: CanvasResourceReferenceAttrs[] = [
      { referenceId: "ref-1", sourceType: "canvas-node", sourceId: source.id, mediaType: "image", label: "图一", role: "reference" },
      { referenceId: "ref-2", sourceType: "canvas-node", sourceId: source.id, mediaType: "image", label: "图一", role: "first-frame" },
    ];

    expect(promptResourceBindings(target.id, [source, target], [{
      id: "edge-1",
      projectId: "project-1",
      sourceNodeId: source.id,
      targetNodeId: target.id,
      edgeType: "references",
    }], promptReferences)).toEqual([expect.objectContaining({
      key: "canvas-node:node-1",
      edgeIds: ["edge-1"],
      promptReferenceIds: ["ref-1", "ref-2"],
    })]);
  });

  it("keeps first-use order and reuses the compiler binding identity", () => {
    expect(promptDocumentPreviewReferences(document).map((item) => item.referenceId)).toEqual(["ref-1", "ref-3"]);
  });

  it("renders a connection draft without treating the old node edge as mutable", () => {
    const source = canvasNode("node-1", "image", "图一");
    const target = canvasNode("target", "video", "目标");
    const bindings = promptResourceBindings(target.id, [source, target], [], [], [{
      referenceId: "draft:node-1",
      sourceType: "canvas-node",
      sourceId: source.id,
      mediaType: "image",
      label: "图一",
      role: "first-frame",
    }]);

    expect(bindings).toEqual([expect.objectContaining({
      key: "canvas-node:node-1",
      edgeIds: [],
      promptReferenceIds: [],
      reference: expect.objectContaining({ role: "first-frame" }),
    })]);
  });

  it("resolves canvas and project asset media without persisting preview URLs", () => {
    const canvasReference = promptDocumentPreviewReferences(document)[0]!;
    expect(resolvePromptResourcePreview(canvasReference, [{
      id: "node-1",
      projectId: "project-1",
      type: "image",
      entityId: "entity-1",
      positionX: 0,
      positionY: 0,
      width: 100,
      height: 100,
      data: { type: "image", name: "图一", action: "resource", artifactIds: ["artifact-1"] },
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
    }], [])).toMatchObject({ url: "/api/pipeline/canvas-nodes/node-1/media?v=artifact%3Aartifact-1" });

    const assetReference = {
      referenceId: "ref-asset",
      sourceType: "asset" as const,
      sourceId: "asset-1",
      mediaType: "image" as const,
      label: "角色",
      role: "reference" as const,
    };
    expect(resolvePromptResourcePreview(assetReference, [], [{
      id: "asset-1",
      projectId: "project-1",
      type: "character",
      name: "角色",
      description: "",
      attributes: null,
      selectedArtifactId: "artifact-2",
      locked: false,
      starred: false,
      status: "completed",
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
    }])).toMatchObject({ url: "/api/pipeline/assets/asset-1/media?v=artifact%3Aartifact-2" });
  });
});

function canvasNode(id: string, type: "text" | "image" | "video", name: string): CanvasNode {
  return {
    id,
    projectId: "project-1",
    type,
    entityId: id,
    positionX: 0,
    positionY: 0,
    width: 100,
    height: 100,
    data: { type, name, action: `${type}_generate` },
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}

function reference(
  referenceId: string,
  sourceType: "canvas-node" | "asset",
  sourceId: string,
  mediaType: "image" | "video",
  label: string,
) {
  return {
    type: "resourceReference" as const,
    attrs: { referenceId, sourceType, sourceId, mediaType, label, role: "reference" },
  };
}
