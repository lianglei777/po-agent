import type { CanvasNodeType, CanvasPromptDocument, CanvasResourceReferenceAttrs, CanvasRichTextNode } from "@/contracts/pipeline";

const REFERENCE_PREFIX = "[[po-agent-canvas-nodes:";
const REFERENCE_SUFFIX = "]]";

export interface CanvasAgentMessageReference {
  nodeId: string;
  name: string;
  type: CanvasNodeType;
}

export interface ParsedCanvasAgentMessage {
  message: string;
  references: CanvasAgentMessageReference[];
  document?: CanvasPromptDocument;
}

export function formatCanvasAgentMessage(
  message: string,
  references: CanvasAgentMessageReference[],
): string {
  const normalizedMessage = message.trim();
  if (!references.length) return normalizedMessage;
  const normalizedReferences = references.map((reference) => ({
    nodeId: reference.nodeId,
    name: reference.name,
    type: reference.type,
  }));
  const marker = `${REFERENCE_PREFIX}${encodeURIComponent(JSON.stringify(normalizedReferences))}${REFERENCE_SUFFIX}`;
  const description = normalizedReferences
    .map((reference) => `${reference.name}（${reference.type}）`)
    .join("、");
  return `${marker}\n用户引用了以下画布节点作为本轮输入：${description}。${normalizedMessage ? `\n\n${normalizedMessage}` : ""}`;
}

export function parseCanvasAgentMessage(value: string): ParsedCanvasAgentMessage {
  if (!value.startsWith(REFERENCE_PREFIX)) return { message: value, references: [] };
  const markerEnd = value.indexOf(REFERENCE_SUFFIX, REFERENCE_PREFIX.length);
  if (markerEnd < 0) return { message: value, references: [] };
  const encoded = value.slice(REFERENCE_PREFIX.length, markerEnd);
  let references: CanvasAgentMessageReference[];
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
    const parsedReferences = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.references) ? parsed.references : null;
    if (!parsedReferences || !parsedReferences.every(isMessageReference)) {
      return { message: value, references: [] };
    }
    references = parsedReferences;
  } catch {
    return { message: value, references: [] };
  }
  const remainder = value.slice(markerEnd + REFERENCE_SUFFIX.length).replace(/^\n/, "");
  const separator = remainder.indexOf("\n\n");
  const message = separator >= 0 ? remainder.slice(separator + 2) : "";
  return {
    references,
    message,
    document: references.length ? documentFromReferencedText(message, references) : undefined,
  };
}

function documentFromReferencedText(
  message: string,
  references: CanvasAgentMessageReference[],
): CanvasPromptDocument | undefined {
  const remaining = new Map(references.map((reference) => [reference.nodeId, reference]));
  const paragraphs = message.split("\n").map((line) => {
    const content: CanvasRichTextNode[] = [];
    let cursor = 0;
    while (cursor < line.length) {
      const match = [...remaining.values()]
        .map((reference) => ({ reference, index: line.indexOf(`@${reference.name}`, cursor) }))
        .filter((candidate) => candidate.index >= 0)
        .sort((left, right) => left.index - right.index)[0];
      if (!match) {
        if (cursor < line.length) content.push({ type: "text", text: line.slice(cursor) });
        break;
      }
      if (match.index > cursor) content.push({ type: "text", text: line.slice(cursor, match.index) });
      content.push({
        type: "resourceReference",
        attrs: {
          referenceId: `persisted:${match.reference.nodeId}`,
          sourceType: "canvas-node",
          sourceId: match.reference.nodeId,
          mediaType: nodeMediaType(match.reference.type),
          label: match.reference.name,
          role: "reference",
        },
      });
      remaining.delete(match.reference.nodeId);
      cursor = match.index + match.reference.name.length + 1;
    }
    return { type: "paragraph", content: content.length ? content : undefined } satisfies CanvasRichTextNode;
  });
  if (remaining.size) return undefined;
  return {
    schemaVersion: 1,
    format: "tiptap-json",
    plainText: message,
    content: { type: "doc", content: paragraphs },
  };
}

export function canonicalizeCanvasAgentDocument(
  document: CanvasPromptDocument | undefined,
  references: CanvasAgentMessageReference[],
): CanvasPromptDocument | undefined {
  if (!document) return undefined;
  const referenceById = new Map(references.map((reference) => [reference.nodeId, reference]));
  const content = canonicalizeRichNode(document.content, referenceById) ?? { type: "doc" };
  return {
    schemaVersion: 1,
    format: "tiptap-json",
    content,
    plainText: richNodeText(content).trimEnd(),
  };
}

function canonicalizeRichNode(
  node: CanvasRichTextNode,
  referenceById: Map<string, CanvasAgentMessageReference>,
): CanvasRichTextNode | null {
  if (node.type === "resourceReference") {
    const attrs = node.attrs as Partial<CanvasResourceReferenceAttrs> | undefined;
    const reference = attrs?.sourceType === "canvas-node" && attrs.sourceId
      ? referenceById.get(attrs.sourceId)
      : undefined;
    if (!reference || attrs?.pending) return null;
    return {
      type: "resourceReference",
      attrs: {
        referenceId: attrs?.referenceId ?? `reference:${reference.nodeId}`,
        sourceType: "canvas-node",
        sourceId: reference.nodeId,
        mediaType: nodeMediaType(reference.type),
        label: reference.name,
        role: "reference",
      },
    };
  }
  return {
    ...node,
    content: node.content?.flatMap((child) => {
      const canonical = canonicalizeRichNode(child, referenceById);
      return canonical ? [canonical] : [];
    }),
  };
}

function richNodeText(node: CanvasRichTextNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "resourceReference") {
    const attrs = node.attrs as Partial<CanvasResourceReferenceAttrs> | undefined;
    return attrs?.label ? `@${attrs.label}` : "";
  }
  const textValue = node.content?.map(richNodeText).join("") ?? "";
  return node.type === "paragraph" ? `${textValue}\n` : textValue;
}

function nodeMediaType(type: CanvasNodeType): CanvasResourceReferenceAttrs["mediaType"] {
  return type === "image" || type === "video" || type === "audio" ? type : "text";
}


function isMessageReference(value: unknown): value is CanvasAgentMessageReference {
  if (!isRecord(value)) return false;
  return typeof value.nodeId === "string"
    && typeof value.name === "string"
    && isCanvasNodeType(value.type);
}

function isCanvasNodeType(value: unknown): value is CanvasNodeType {
  return value === "text" || value === "image" || value === "video" || value === "audio"
    || value === "script" || value === "character" || value === "scene"
    || value === "prop" || value === "storyboard";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
