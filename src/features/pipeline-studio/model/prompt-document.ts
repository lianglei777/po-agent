import type { CanvasPromptDocument, CanvasResourceReferenceAttrs, CanvasRichTextNode } from "@/contracts/pipeline";

export function promptDocumentFromPlainText(plainText: string): CanvasPromptDocument {
  return {
    schemaVersion: 1,
    format: "tiptap-json",
    plainText,
    content: {
      type: "doc",
      content: plainText.split("\n").map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : undefined,
      })),
    },
  };
}

export function promptDocumentFromJson(content: CanvasRichTextNode): CanvasPromptDocument {
  return {
    schemaVersion: 1,
    format: "tiptap-json",
    content,
    plainText: promptNodeText(content).trimEnd(),
  };
}

export function promptDocumentResourceAttrs(document: CanvasPromptDocument): CanvasResourceReferenceAttrs[] {
  const references: CanvasResourceReferenceAttrs[] = [];
  visit(document.content, (node) => {
    if (node.type !== "resourceReference" || !node.attrs) return;
    const attrs = node.attrs as Partial<CanvasResourceReferenceAttrs>;
    if (attrs.referenceId && attrs.sourceType && attrs.sourceId && attrs.mediaType && attrs.label && attrs.role) {
      references.push(attrs as CanvasResourceReferenceAttrs);
    }
  });
  return references;
}

export function removePromptResourceReferences(
  document: CanvasPromptDocument,
  sourceType: CanvasResourceReferenceAttrs["sourceType"],
  sourceId: string,
): CanvasPromptDocument {
  const content = removeMatchingReferences(document.content, sourceType, sourceId);
  return promptDocumentFromJson(content ?? { type: "doc" });
}

function promptNodeText(node: CanvasRichTextNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "resourceReference") {
    const attrs = node.attrs as Partial<CanvasResourceReferenceAttrs> | undefined;
    return attrs?.label ? `@${attrs.label}` : "@资源";
  }
  const text = node.content?.map(promptNodeText).join("") ?? "";
  return ["paragraph", "heading", "listItem"].includes(node.type) ? `${text}\n` : text;
}

function visit(node: CanvasRichTextNode, callback: (node: CanvasRichTextNode) => void) {
  callback(node);
  node.content?.forEach((child) => visit(child, callback));
}

function removeMatchingReferences(
  node: CanvasRichTextNode,
  sourceType: CanvasResourceReferenceAttrs["sourceType"],
  sourceId: string,
): CanvasRichTextNode | null {
  if (node.type === "resourceReference") {
    const attrs = node.attrs as Partial<CanvasResourceReferenceAttrs> | undefined;
    if (attrs?.sourceType === sourceType && attrs.sourceId === sourceId) return null;
  }
  if (!node.content) return node;
  return {
    ...node,
    content: node.content.flatMap((child) => {
      const next = removeMatchingReferences(child, sourceType, sourceId);
      return next ? [next] : [];
    }),
  };
}
