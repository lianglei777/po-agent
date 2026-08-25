import { describe, expect, it } from "vitest";
import type { CanvasPromptDocument } from "@/contracts/pipeline";
import { promptDocumentPreviewReferences, resolvePromptResourcePreview } from "./prompt-resource-preview";

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
  it("keeps first-use order and reuses the compiler binding identity", () => {
    expect(promptDocumentPreviewReferences(document).map((item) => item.referenceId)).toEqual(["ref-1", "ref-3"]);
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
