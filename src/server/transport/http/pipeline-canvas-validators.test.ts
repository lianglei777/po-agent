import { describe, expect, it } from "vitest";
import {
  parseCanvasMutationBatch,
  parseCreateCanvasWorkflowRunRequest,
  parseGenerateCanvasNodeRequest,
  parseGenerateTextNodeRequest,
  parseRetryCanvasGenerationRequest,
  parseSelectCanvasArtifactRequest,
} from "./pipeline-canvas-validators";

describe("canvas workflow run validators", () => {
  it("deduplicates bounded canvas node identifiers", () => {
    expect(parseCreateCanvasWorkflowRunRequest({ nodeIds: ["node-1", "node-1", "node-2"] }))
      .toEqual({ nodeIds: ["node-1", "node-2"] });
  });

  it("rejects empty and invalid workflow selections", () => {
    expect(() => parseCreateCanvasWorkflowRunRequest({ nodeIds: [] }))
      .toThrow("nodeIds must contain between 1 and 100 entries");
    expect(() => parseCreateCanvasWorkflowRunRequest({ nodeIds: [""] }))
      .toThrow("nodeIds contains an invalid canvas node identifier");
  });
});

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

describe("canvas generation history validators", () => {
  it("accepts stable artifact and retry identifiers", () => {
    expect(parseSelectCanvasArtifactRequest({ artifactId: "artifact-1" })).toEqual({ artifactId: "artifact-1" });
    expect(parseRetryCanvasGenerationRequest({ idempotencyKey: " retry-1 " })).toEqual({ idempotencyKey: "retry-1" });
  });

  it("rejects missing identifiers", () => {
    expect(() => parseSelectCanvasArtifactRequest({ artifactId: "" })).toThrow("artifactId is invalid");
    expect(() => parseRetryCanvasGenerationRequest({ idempotencyKey: " " })).toThrow("idempotencyKey is invalid");
  });
});

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

  it("accepts a prompt reference edge creation intent", () => {
    const edge = {
      id: "edge-1",
      projectId: "project-1",
      sourceNodeId: "source-1",
      targetNodeId: "target-1",
      edgeType: "references",
      role: "reference",
      order: 0,
    };
    expect(parseCanvasMutationBatch({
      baseRevision: 1,
      requestId: "request-prompt-reference",
      mutations: [{ type: "edge.create", intent: "prompt-reference", edge }],
    }).mutations[0]).toEqual({
      type: "edge.create",
      intent: "prompt-reference",
      edge: { ...edge, createdAt: undefined, updatedAt: undefined },
    });
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

  it("accepts a persisted edge role update", () => {
    expect(parseCanvasMutationBatch({
      baseRevision: 3,
      requestId: "request-edge-role",
      mutations: [{ type: "edge.update", edgeId: "edge-1", patch: { role: "first-frame", order: 1 } }],
    }).mutations[0]).toEqual({
      type: "edge.update",
      edgeId: "edge-1",
      patch: { role: "first-frame", order: 1 },
    });
  });

  it("validates persisted video metadata", () => {
    const videoNode = {
      ...node,
      type: "video" as const,
      data: {
        type: "video" as const,
        name: "Video",
        action: "video_generate",
        videoMetadata: { durationSeconds: 5.2, width: 1920, height: 1080 },
      },
    };
    expect(parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "video-metadata",
      mutations: [{ type: "node.create", node: videoNode }],
    }).mutations).toHaveLength(1);
    expect(() => parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "invalid-video-metadata",
      mutations: [{
        type: "node.create",
        node: { ...videoNode, data: { ...videoNode.data, videoMetadata: { durationSeconds: -1, width: 0, height: 1080 } } },
      }],
    })).toThrow("videoMetadata is invalid");
  });

  it("validates persisted audio metadata", () => {
    const audioNode = {
      ...node,
      type: "audio" as const,
      data: {
        type: "audio" as const,
        name: "Narration",
        action: "audio_generate",
        audioMetadata: {
          durationSeconds: 18.4,
          format: "MP3",
          sampleRateHz: 48_000,
          channelCount: 2,
        },
      },
    };
    expect(parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "audio-metadata",
      mutations: [{ type: "node.create", node: audioNode }],
    }).mutations).toHaveLength(1);
    expect(() => parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "invalid-audio-metadata",
      mutations: [{
        type: "node.create",
        node: { ...audioNode, data: { ...audioNode.data, audioMetadata: { durationSeconds: 2, sampleRateHz: 0 } } },
      }],
    })).toThrow("audioMetadata is invalid");
  });

  it("strips server-owned node state from client mutations", () => {
    const imageNode = {
      ...node,
      type: "image" as const,
      data: {
        type: "image" as const,
        name: "Image",
        action: "image_generate",
        url: ["https://attacker.test/image.png"],
        artifactIds: ["artifact-forged"],
        taskInfo: { runId: "run-forged", status: "completed" },
        generationProvenance: {
          runId: "run-image-1",
          inputFingerprint: "a".repeat(64),
          stale: false,
        },
      },
    };
    const parsed = parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "image-provenance",
      mutations: [{ type: "node.create", node: imageNode }],
    });
    expect(parsed.mutations[0]).toMatchObject({
      type: "node.create",
      node: { data: { type: "image", name: "Image", action: "image_generate" } },
    });
    const mutation = parsed.mutations[0];
    if (mutation.type !== "node.create") throw new Error("Expected a node creation mutation");
    expect(mutation.node.data).not.toHaveProperty("url");
    expect(mutation.node.data).not.toHaveProperty("artifactIds");
    expect(mutation.node.data).not.toHaveProperty("taskInfo");
    expect(mutation.node.data).not.toHaveProperty("generationProvenance");
  });

  it("accepts restore intent and rejects unknown edge creation intents", () => {
    const edge = {
      id: "edge-1",
      projectId: "project-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      edgeType: "references",
    };
    expect(parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "request-edge-restore",
      mutations: [{ type: "edge.create", edge, intent: "restore" }],
    }).mutations[0]).toMatchObject({ intent: "restore" });
    expect(() => parseCanvasMutationBatch({
      baseRevision: 0,
      requestId: "request-edge-invalid",
      mutations: [{ type: "edge.create", edge, intent: "bypass" }],
    })).toThrow("intent is invalid");
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

  it("accepts bounded schema-driven video settings and rejects nested values", () => {
    expect(parseGenerateCanvasNodeRequest({
      prompt: "valid prompt",
      settings: { durationSeconds: 5, generateAudio: true, conversionSlots: ["all"] },
    })).toMatchObject({
      settings: { durationSeconds: 5, generateAudio: true, conversionSlots: ["all"] },
    });
    expect(() => parseGenerateCanvasNodeRequest({
      prompt: "valid prompt",
      settings: { unsafe: { nested: true } },
    })).toThrow("settings.unsafe is invalid");
  });

  it("accepts a bounded lip-sync preparation selection", () => {
    expect(parseGenerateCanvasNodeRequest({
      routeId: "runninghub-kling-lip-sync-video",
      lipSync: { preparationId: "preparation-1", faceKey: "face-2" },
    })).toMatchObject({
      lipSync: { preparationId: "preparation-1", faceKey: "face-2" },
    });
    expect(() => parseGenerateCanvasNodeRequest({
      lipSync: { preparationId: "preparation-1", faceKey: "x".repeat(201) },
    })).toThrow("lipSync is invalid");
  });

  it("accepts a distinct ordered generation reference plan", () => {
    expect(parseGenerateCanvasNodeRequest({
      prompt: "valid prompt",
      references: [
        { sourceId: "image-1", role: "first-frame" },
        { sourceId: "image-2", role: "last-frame" },
      ],
    })).toMatchObject({
      references: [
        { sourceId: "image-1", role: "first-frame" },
        { sourceId: "image-2", role: "last-frame" },
      ],
    });
    expect(() => parseGenerateCanvasNodeRequest({
      prompt: "valid prompt",
      references: [{ sourceId: "image-1", role: "reference" }, { sourceId: "image-1", role: "reference" }],
    })).toThrow("references contains duplicate sources");
  });

});
