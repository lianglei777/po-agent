import { describe, expect, it } from "vitest";
import type { CanvasMediaReference, CanvasPromptDocument, CanvasRichTextNode } from "@/server/domain/pipeline";
import { collectPromptResourceReferences, compileCanvasPrompt } from "./prompt-compiler";

function resource(referenceId: string, sourceId: string, mediaType: "text" | "image", role = "reference") {
  return {
    type: "resourceReference" as const,
    attrs: { referenceId, sourceType: "canvas-node", sourceId, mediaType, label: sourceId, role },
  };
}

function document(...content: CanvasRichTextNode[]): CanvasPromptDocument {
  return {
    schemaVersion: 1,
    format: "tiptap-json",
    plainText: "",
    content: { type: "doc", content: [{ type: "paragraph", content }] },
  };
}

describe("prompt compiler", () => {
  it("numbers media by first occurrence and keeps upload bindings in the same order", () => {
    const input = document(
      { type: "text", text: "让" },
      resource("ref-b", "node-b", "image"),
      { type: "text", text: "模仿" },
      resource("ref-a", "node-a", "image"),
    );
    const resolved = new Map<string, CanvasMediaReference>([
      ["ref-a", { nodeId: "node-a", mediaType: "image", label: "A", artifactId: "artifact-a" }],
      ["ref-b", { nodeId: "node-b", mediaType: "image", label: "B", artifactId: "artifact-b" }],
    ]);

    const result = compileCanvasPrompt(input, resolved);

    expect(result.prompt).toBe("让图片1模仿图片2");
    expect(result.references.map((item) => [item.artifactId, item.order])).toEqual([
      ["artifact-b", 0],
      ["artifact-a", 1],
    ]);
  });

  it("reuses duplicate resources and appends referenced text once", () => {
    const input = document(resource("text-1", "node-text", "text"), { type: "text", text: "改写" }, resource("text-2", "node-text", "text"));
    const textReference = { nodeId: "node-text", mediaType: "text", label: "脚本", content: ["原始内容"] } satisfies CanvasMediaReference;
    const result = compileCanvasPrompt(input, new Map([["text-1", textReference], ["text-2", textReference]]));

    expect(result.prompt).toBe("文本1改写文本1\n\n参考文本：\n文本1：\n原始内容");
    expect(result.references).toHaveLength(1);
  });

  it("numbers @ references after connected bindings and reuses an identical connected resource", () => {
    const connected = {
      nodeId: "node-connected",
      sourceType: "canvas-node" as const,
      sourceId: "node-connected",
      referenceId: "edge:edge-1",
      mediaType: "image" as const,
      label: "Connected",
      role: "reference" as const,
      artifactId: "artifact-connected",
    } satisfies CanvasMediaReference;
    const input = document(
      resource("mention-connected", "node-connected", "image"),
      { type: "text", text: "和" },
      resource("mention-new", "node-new", "image"),
    );
    const resolved = new Map<string, CanvasMediaReference>([
      ["mention-connected", connected],
      ["mention-new", {
        nodeId: "node-new",
        sourceType: "canvas-node",
        sourceId: "node-new",
        mediaType: "image",
        label: "New",
        artifactId: "artifact-new",
      }],
    ]);

    const result = compileCanvasPrompt(input, resolved, [connected]);

    expect(result.prompt).toBe("图片1和图片2");
    expect(result.references.map((reference) => [reference.referenceId, reference.order])).toEqual([
      ["edge:edge-1", 0],
      ["mention-new", 1],
    ]);
  });

  it("reports broken references without silently changing their meaning", () => {
    const input = document(resource("missing", "node-missing", "image"));
    expect(collectPromptResourceReferences(input)).toHaveLength(1);
    expect(compileCanvasPrompt(input, new Map())).toMatchObject({
      prompt: "[已失效资源：node-missing]",
      references: [],
      issues: [{ referenceId: "missing", reason: "missing-resource" }],
    });
  });
});
