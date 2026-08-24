import { describe, expect, it } from "vitest";
import { parseCanvasMutationBatch, parseGenerateCanvasNodeRequest, parseGenerateTextNodeRequest } from "./pipeline-canvas-validators";

const node = {
  id: "node-1",
  projectId: "project-1",
  type: "text" as const,
  entityId: "entity-1",
  positionX: 10,
  positionY: 20,
  width: 320,
  height: 220,
  data: { type: "text" as const, name: "文本", action: "text_generate", content: [""] },
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
};

describe("parseCanvasMutationBatch", () => {
  it("accepts a bounded node creation batch", () => {
    expect(parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "request-1",
      mutations: [{ type: "node.create", node }],
    }).mutations).toHaveLength(1);
  });

  it("rejects invalid viewport zoom", () => {
    expect(() => parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "request-1",
      mutations: [{ type: "viewport.update", viewport: { x: 0, y: 0, zoom: 20 } }],
    })).toThrow("viewport.zoom is out of range");
  });

  it("rejects empty mutation batches", () => {
    expect(() => parseCanvasMutationBatch({ baseRevision: 0, requestId: "request-1", mutations: [] }))
      .toThrow("mutations must contain between 1 and 500 operations");
  });

  it("accepts a bounded rich text document", () => {
    const richNode = {
      ...node,
      data: {
        ...node.data,
        content: ["标题\n正文"],
        textDocument: {
          schemaVersion: 1,
          format: "tiptap-json",
          plainText: "标题\n正文",
          content: {
            type: "doc",
            content: [
              { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "标题", marks: [{ type: "bold" }] }] },
              { type: "paragraph", content: [{ type: "text", text: "正文", marks: [{ type: "underline" }] }] },
            ],
          },
        },
      },
    };
    expect(parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "request-rich-text",
      mutations: [{ type: "node.create", node: richNode }],
    }).mutations).toHaveLength(1);
  });

  it("rejects unsupported rich text nodes", () => {
    const invalidNode = {
      ...node,
      data: {
        ...node.data,
        textDocument: {
          schemaVersion: 1,
          format: "tiptap-json",
          plainText: "unsafe",
          content: { type: "doc", content: [{ type: "image", attrs: { src: "https://example.test/a.png" } }] },
        },
      },
    };
    expect(() => parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "request-invalid-rich-text",
      mutations: [{ type: "node.create", node: invalidNode }],
    })).toThrow("contains an unsupported node");
  });
});

describe("parseGenerateTextNodeRequest", () => {
  it("normalizes a valid revision instruction", () => {
    expect(parseGenerateTextNodeRequest({
      instruction: "  改成更简洁的表达  ",
      mode: "revise",
      model: "openai:gpt-5",
    })).toEqual({
      instruction: "改成更简洁的表达",
      mode: "revise",
      model: "openai:gpt-5",
    });
  });

  it("rejects an empty instruction", () => {
    expect(() => parseGenerateTextNodeRequest({ instruction: "   ", mode: "generate" }))
      .toThrow("instruction is invalid");
  });

  it("accepts semantic resource atoms and rejects incomplete bindings", () => {
    const promptDocument = {
      schemaVersion: 1,
      format: "tiptap-json",
      plainText: "参考 @分镜一",
      content: {
        type: "doc",
        content: [{
          type: "paragraph",
          content: [
            { type: "text", text: "参考 " },
            { type: "resourceReference", attrs: { referenceId: "ref-1", sourceType: "canvas-node", sourceId: "node-image", mediaType: "image", label: "分镜一", role: "reference" } },
          ],
        }],
      },
    };
    expect(parseGenerateTextNodeRequest({ instruction: "参考 @分镜一", promptDocument, mode: "generate" }))
      .toMatchObject({ promptDocument });
    expect(() => parseGenerateTextNodeRequest({
      instruction: "参考资源",
      mode: "generate",
      promptDocument: {
        ...promptDocument,
        content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "resourceReference", attrs: { label: "缺少身份" } }] }] },
      },
    })).toThrow("attrs is invalid");
  });
});

describe("parseGenerateCanvasNodeRequest", () => {
  it("normalizes supported image generation settings", () => {
    expect(parseGenerateCanvasNodeRequest({
      prompt: "  cinematic mountain landscape  ",
      routeId: " route-image-1 ",
      settings: { aspectRatio: "16:9", resolution: "2k" },
    })).toEqual({
      prompt: "cinematic mountain landscape",
      routeId: "route-image-1",
      settings: { aspectRatio: "16:9", resolution: "2k" },
    });
  });

  it("rejects unsupported image generation settings", () => {
    expect(() => parseGenerateCanvasNodeRequest({
      prompt: "valid prompt",
      settings: { width: 99999 },
    })).toThrow("settings contains unsupported fields");
  });

  it("accepts an explicit request to create a derived image node", () => {
    expect(parseGenerateCanvasNodeRequest({ prompt: "change the lighting", createNewNode: true }))
      .toMatchObject({ prompt: "change the lighting", createNewNode: true });
    expect(() => parseGenerateCanvasNodeRequest({ createNewNode: "yes" }))
      .toThrow("createNewNode is invalid");
    expect(() => parseGenerateCanvasNodeRequest({ createNewNode: true }))
      .toThrow("prompt is required when createNewNode is true");
  });
});
