import { describe, expect, it } from "vitest";
import { textDocumentFromData, textDocumentFromPlainText } from "./text-document";

describe("pipeline text document", () => {
  it("projects legacy plain text into a Tiptap-compatible document", () => {
    expect(textDocumentFromPlainText("第一段\n第二段")).toEqual({
      schemaVersion: 1,
      format: "tiptap-json",
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "第一段" }] },
          { type: "paragraph", content: [{ type: "text", text: "第二段" }] },
        ],
      },
      plainText: "第一段\n第二段",
    });
  });

  it("keeps an existing rich text document unchanged", () => {
    const document = textDocumentFromPlainText("现有内容");
    expect(textDocumentFromData({ type: "text", name: "文本", action: "text_generate", textDocument: document }))
      .toBe(document);
  });
});
