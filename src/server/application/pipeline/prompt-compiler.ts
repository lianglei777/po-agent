import type {
  CanvasMediaReference,
  CanvasMediaType,
  CanvasPromptDocument,
  CanvasResourceReferenceAttrs,
  CanvasRichTextNode,
} from "@/server/domain/pipeline";

export interface PromptCompileIssue {
  referenceId: string;
  reason: "missing-resource";
  label: string;
}

export interface CompiledCanvasPrompt {
  prompt: string;
  references: CanvasMediaReference[];
  issues: PromptCompileIssue[];
}

const MEDIA_LABELS: Record<CanvasMediaType, string> = {
  text: "文本",
  image: "图片",
  video: "视频",
  audio: "音频",
};
const MAX_REFERENCE_TEXT_LENGTH = 120_000;

export function collectPromptResourceReferences(document: CanvasPromptDocument): CanvasResourceReferenceAttrs[] {
  const references: CanvasResourceReferenceAttrs[] = [];
  visit(document.content, (node) => {
    const attrs = resourceAttrs(node);
    if (attrs) references.push(attrs);
  });
  return references;
}

export function compileCanvasPrompt(
  document: CanvasPromptDocument,
  resolvedByReferenceId: ReadonlyMap<string, CanvasMediaReference>,
  leadingReferences: CanvasMediaReference[] = [],
): CompiledCanvasPrompt {
  const counters: Record<CanvasMediaType, number> = { text: 0, image: 0, video: 0, audio: 0 };
  const bindingByResource = new Map<string, { token: string; reference: CanvasMediaReference }>();
  // 连线资源先占据最终绑定序号，随后出现的 @ token 才能与实际上传数组使用同一编号。
  const references: CanvasMediaReference[] = leadingReferences.map((reference, order) => ({ ...reference, order }));
  const issues: PromptCompileIssue[] = [];

  for (const reference of references) {
    counters[reference.mediaType] += 1;
    const token = `${MEDIA_LABELS[reference.mediaType]}${counters[reference.mediaType]}`;
    bindingByResource.set(referenceBindingKey(reference), { token, reference });
  }

  const body = renderNode(document.content, (attrs) => {
    const resolved = resolvedByReferenceId.get(attrs.referenceId);
    if (!resolved) {
      issues.push({ referenceId: attrs.referenceId, reason: "missing-resource", label: attrs.label });
      return `[已失效资源：${attrs.label}]`;
    }

    // 同一资源重复出现时复用编号；不同首尾帧角色仍保留独立绑定。
    const bindingKey = referenceBindingKey(attrs);
    const existing = bindingByResource.get(bindingKey);
    if (existing) return existing.token;

    counters[attrs.mediaType] += 1;
    const token = `${MEDIA_LABELS[attrs.mediaType]}${counters[attrs.mediaType]}`;
    const reference: CanvasMediaReference = {
      ...resolved,
      sourceType: attrs.sourceType,
      sourceId: attrs.sourceId,
      referenceId: attrs.referenceId,
      role: attrs.role,
      order: references.length,
    };
    bindingByResource.set(bindingKey, { token, reference });
    references.push(reference);
    return token;
  }).trim();

  const textAppendix = [...bindingByResource.values()]
    .filter(({ reference }) => reference.mediaType === "text")
    .map(({ token, reference }) => `${token}：\n${reference.content?.join("\n") ?? ""}`)
    .filter((value) => value.trim())
    .join("\n\n")
    .slice(0, MAX_REFERENCE_TEXT_LENGTH);

  return {
    prompt: [body, textAppendix].filter(Boolean).join("\n\n参考文本：\n"),
    references,
    issues,
  };
}

function referenceBindingKey(reference: {
  sourceType?: CanvasResourceReferenceAttrs["sourceType"];
  sourceId?: string;
  nodeId?: string;
  role?: CanvasResourceReferenceAttrs["role"];
}) {
  return `${reference.sourceType ?? "canvas-node"}:${reference.sourceId ?? reference.nodeId}:${reference.role ?? "reference"}`;
}

function renderNode(node: CanvasRichTextNode, renderReference: (attrs: CanvasResourceReferenceAttrs) => string): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  const attrs = resourceAttrs(node);
  if (attrs) return renderReference(attrs);

  const content = node.content?.map((child) => renderNode(child, renderReference)).join("") ?? "";
  if (["paragraph", "heading", "listItem"].includes(node.type)) return `${content}\n`;
  return content;
}

function visit(node: CanvasRichTextNode, callback: (node: CanvasRichTextNode) => void) {
  callback(node);
  node.content?.forEach((child) => visit(child, callback));
}

function resourceAttrs(node: CanvasRichTextNode): CanvasResourceReferenceAttrs | null {
  if (node.type !== "resourceReference" || !node.attrs) return null;
  const { referenceId, sourceType, sourceId, mediaType, label, role } = node.attrs;
  if (typeof referenceId !== "string"
    || (sourceType !== "canvas-node" && sourceType !== "asset")
    || typeof sourceId !== "string"
    || !isMediaType(mediaType)
    || typeof label !== "string"
    || (role !== "reference" && role !== "first-frame" && role !== "last-frame")) return null;
  return { referenceId, sourceType, sourceId, mediaType, label, role };
}

function isMediaType(value: unknown): value is CanvasMediaType {
  return value === "text" || value === "image" || value === "video" || value === "audio";
}
