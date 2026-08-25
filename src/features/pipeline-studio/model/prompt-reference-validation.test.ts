import { describe, expect, it } from "vitest";
import type { GenerationCapability, GenerationRouteDto } from "@/contracts/generation";
import type { CanvasPromptDocument, CanvasResourceRole } from "@/contracts/pipeline";
import { promptReferenceRouteProblem, videoCapabilityForPrompt } from "./prompt-reference-validation";

describe("prompt reference route validation", () => {
  it("maps explicit frame roles to image-to-video slots", () => {
    const document = promptWith([
      ["image", "first-frame"],
      ["image", "last-frame"],
    ]);
    expect(videoCapabilityForPrompt(document)).toBe("image-to-video");
    expect(promptReferenceRouteProblem(document, route("image-to-video", [
      { key: "firstFrameUrl", label: "首帧", mediaType: "image", required: true, maxFiles: 1 },
      { key: "lastFrameUrl", label: "尾帧", mediaType: "image", maxFiles: 1 },
    ]))).toBeNull();
  });

  it("uses multimodal capability for ordinary image, video, or audio references", () => {
    expect(videoCapabilityForPrompt(promptWith([["image", "reference"]]))).toBe("multimodal-to-video");
    expect(videoCapabilityForPrompt(promptWith([["video", "reference"]]))).toBe("multimodal-to-video");
    expect(videoCapabilityForPrompt(promptWith([["audio", "reference"]]))).toBe("multimodal-to-video");
  });

  it("includes connected upstream references and does not count the same prompt mention twice", () => {
    const document = promptWith([["image", "reference"]]);
    const connected = {
      referenceId: "edge-1",
      sourceType: "canvas-node" as const,
      sourceId: "node-0",
      mediaType: "image" as const,
      label: "上游图片",
      role: "reference" as const,
    };
    const multimodalRoute = route("multimodal-to-video", [
      { key: "imageUrls", label: "参考图", mediaType: "image", maxFiles: 1 },
    ]);
    expect(videoCapabilityForPrompt(promptWith([]), [connected])).toBe("multimodal-to-video");
    expect(promptReferenceRouteProblem(document, multimodalRoute, [connected])).toBeNull();
  });

  it("reports unsupported and missing required slots immediately", () => {
    const firstFrameRoute = route("image-to-video", [
      { key: "firstFrameUrl", label: "首帧", mediaType: "image", required: true, maxFiles: 1 },
    ]);
    expect(promptReferenceRouteProblem(promptWith([["image", "last-frame"]]), firstFrameRoute)).toMatchObject({
      kind: "unsupported",
    });
    expect(promptReferenceRouteProblem(promptWith([]), firstFrameRoute)).toMatchObject({
      kind: "missing-required",
    });
  });
});

function promptWith(entries: Array<["image" | "video" | "audio", CanvasResourceRole]>): CanvasPromptDocument {
  return {
    schemaVersion: 1,
    format: "tiptap-json",
    plainText: entries.map((_, index) => `@资源${index + 1}`).join(" "),
    content: {
      type: "doc",
      content: [{
        type: "paragraph",
        content: entries.map(([mediaType, role], index) => ({
          type: "resourceReference",
          attrs: {
            referenceId: `ref-${index}`,
            sourceType: "canvas-node",
            sourceId: `node-${index}`,
            mediaType,
            label: `资源${index + 1}`,
            role,
          },
        })),
      }],
    },
  };
}

function route(capability: GenerationCapability, assets: NonNullable<GenerationRouteDto["inputSchema"]["assets"]>): GenerationRouteDto {
  return {
    id: "route-1",
    name: "Route",
    capability,
    product: "Product",
    providerId: "provider",
    enabled: true,
    isDefault: true,
    revision: 1,
    defaults: {},
    inputSchema: { prompt: { required: true }, assets },
  };
}
