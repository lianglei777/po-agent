import { describe, expect, it } from "vitest";
import { promptDocumentFromJson, promptDocumentFromPlainText, promptDocumentResourceAttrs } from "./prompt-document";

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
});
