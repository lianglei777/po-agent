import { describe, expect, it } from "vitest";
import { promptDocumentFromJson, promptDocumentFromPlainText, promptDocumentResourceAttrs, removePromptResourceReferences } from "./prompt-document";

describe("prompt document", () => {
  it("keeps resource atoms visible in the plain-text compatibility projection", () => {
    const document = promptDocumentFromJson({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "text", text: "参考 " },
          { type: "resourceReference", attrs: { referenceId: "ref-1", sourceType: "canvas-node", sourceId: "node-1", mediaType: "image", label: "封面", role: "reference" } },
        ],
      }],
    });
    expect(document.plainText).toBe("参考 @封面");
    expect(promptDocumentResourceAttrs(document)).toMatchObject([{ sourceId: "node-1", mediaType: "image" }]);
  });

  it("creates one paragraph per plain-text line", () => {
    expect(promptDocumentFromPlainText("第一行\n第二行").content.content).toHaveLength(2);
  });

  it("removes every @ occurrence for one resource without touching other resources", () => {
    const document = promptDocumentFromJson({
      type: "doc",
      content: [{
        type: "paragraph",
        content: [
          { type: "resourceReference", attrs: { referenceId: "ref-1", sourceType: "canvas-node", sourceId: "node-1", mediaType: "image", label: "图片 1", role: "reference" } },
          { type: "text", text: " and " },
          { type: "resourceReference", attrs: { referenceId: "ref-2", sourceType: "canvas-node", sourceId: "node-1", mediaType: "image", label: "图片 1", role: "first-frame" } },
          { type: "resourceReference", attrs: { referenceId: "ref-3", sourceType: "canvas-node", sourceId: "node-2", mediaType: "image", label: "图片 2", role: "reference" } },
        ],
      }],
    });

    const next = removePromptResourceReferences(document, "canvas-node", "node-1");
    expect(promptDocumentResourceAttrs(next).map((reference) => reference.sourceId)).toEqual(["node-2"]);
  });
});
