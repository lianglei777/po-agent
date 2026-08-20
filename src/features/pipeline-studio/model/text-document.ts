import type { CanvasNodeData, CanvasRichTextNode, CanvasTextDocument } from "@/contracts/pipeline";

export function textDocumentFromData(data: CanvasNodeData): CanvasTextDocument {
  if (data.textDocument?.format === "tiptap-json" && data.textDocument.schemaVersion === 1) {
    return data.textDocument;
  }
  return textDocumentFromPlainText(data.content?.join("\n") ?? "");
}

export function textDocumentFromPlainText(plainText: string): CanvasTextDocument {
  const paragraphs = plainText.split("\n").map((line): CanvasRichTextNode => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : undefined,
  }));
  return {
    schemaVersion: 1,
    format: "tiptap-json",
    content: { type: "doc", content: paragraphs.length ? paragraphs : [{ type: "paragraph" }] },
    plainText,
  };
}

export function createTextDocument(content: CanvasRichTextNode, plainText: string): CanvasTextDocument {
  return { schemaVersion: 1, format: "tiptap-json", content, plainText };
}
