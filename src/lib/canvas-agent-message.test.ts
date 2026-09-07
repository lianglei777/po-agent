import { describe, expect, it } from "vitest";
import { canonicalizeCanvasAgentDocument, formatCanvasAgentMessage, parseCanvasAgentMessage } from "./canvas-agent-message";

describe("canvas agent message", () => {
  it("keeps canvas references in the persisted user message", () => {
    const value = formatCanvasAgentMessage("比较它们", [
      { nodeId: "image-1", name: "产品主视觉", type: "image" },
      { nodeId: "text-1", name: "分镜脚本", type: "text" },
    ]);

    expect(value).toContain("用户引用了以下画布节点作为本轮输入");
    expect(parseCanvasAgentMessage(value)).toEqual({
      message: "比较它们",
      references: [
        { nodeId: "image-1", name: "产品主视觉", type: "image" },
        { nodeId: "text-1", name: "分镜脚本", type: "text" },
      ],
    });
  });

  it("supports a reference-only turn and leaves ordinary messages untouched", () => {
    const referenced = formatCanvasAgentMessage("", [
      { nodeId: "video-1", name: "成片", type: "video" },
    ]);
    expect(parseCanvasAgentMessage(referenced).message).toBe("");
    expect(parseCanvasAgentMessage("普通消息")).toEqual({ message: "普通消息", references: [] });
  });

  it("does not hide malformed reference metadata", () => {
    const malformed = "[[po-agent-canvas-nodes:not-json]]\n内容";
    expect(parseCanvasAgentMessage(malformed)).toEqual({ message: malformed, references: [] });
  });

  it("preserves inline positions while replacing client reference metadata", () => {
    const document = canonicalizeCanvasAgentDocument({
      schemaVersion: 1,
      format: "tiptap-json",
      plainText: "stale",
      content: { type: "doc", content: [{ type: "paragraph", content: [
        { type: "text", text: "根据 " },
        { type: "resourceReference", attrs: { referenceId: "ref-1", sourceType: "canvas-node", sourceId: "image-1", mediaType: "text", label: "伪造名称", role: "first-frame" } },
        { type: "text", text: " 调整" },
      ] }] },
    }, [{ nodeId: "image-1", name: "权威名称", type: "image" }]);

    expect(document?.plainText).toBe("根据 @权威名称 调整");
    expect(document?.content.content?.[0]?.content?.[1]?.attrs).toMatchObject({
      sourceId: "image-1",
      label: "权威名称",
      mediaType: "image",
      role: "reference",
    });
  });

  it("restores persisted references at their natural-language positions", () => {
    const value = formatCanvasAgentMessage("请根据 @产品主视觉 调整 @分镜脚本 的节奏", [
      { nodeId: "image-1", name: "产品主视觉", type: "image" },
      { nodeId: "text-1", name: "分镜脚本", type: "text" },
    ]);

    const parsed = parseCanvasAgentMessage(value);
    expect(parsed.document?.content.content?.[0]?.content).toEqual([
      { type: "text", text: "请根据 " },
      { type: "resourceReference", attrs: expect.objectContaining({ sourceId: "image-1", label: "产品主视觉" }) },
      { type: "text", text: " 调整 " },
      { type: "resourceReference", attrs: expect.objectContaining({ sourceId: "text-1", label: "分镜脚本" }) },
      { type: "text", text: " 的节奏" },
    ]);
  });
});
