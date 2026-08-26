import type {
  CanvasEdge,
  CanvasNode,
  CanvasPromptDocument,
  CanvasResourceReferenceAttrs,
  PipelineAsset,
} from "@/contracts/pipeline";
import { promptDocumentResourceAttrs } from "./prompt-document";
import { resolveCanvasMediaSource } from "./canvas-media-source";

export interface PromptResourcePreview {
  key: string;
  reference: CanvasResourceReferenceAttrs;
  url: string | null;
  poster?: string;
  available: boolean;
}

export interface PromptResourceBinding {
  key: string;
  reference: CanvasResourceReferenceAttrs;
  edgeIds: string[];
  promptReferenceIds: string[];
}

export function promptResourceBindings(
  targetNodeId: string | undefined,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  promptReferences: CanvasResourceReferenceAttrs[],
): PromptResourceBinding[] {
  const bindings = new Map<string, PromptResourceBinding>();
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  if (targetNodeId) {
    for (const edge of [...edges].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))) {
      if (edge.targetNodeId !== targetNodeId) continue;
      const source = nodesById.get(edge.sourceNodeId);
      if (!source?.data) continue;
      const reference: CanvasResourceReferenceAttrs = {
        referenceId: `edge:${edge.id}`,
        sourceType: "canvas-node",
        sourceId: source.id,
        mediaType: source.data.type,
        label: source.data.name,
        role: edge.role ?? "reference",
      };
      const key = promptResourceSourceKey(reference);
      const current = bindings.get(key);
      if (current) current.edgeIds.push(edge.id);
      else bindings.set(key, { key, reference, edgeIds: [edge.id], promptReferenceIds: [] });
    }
  }

  for (const reference of promptReferences) {
    const key = promptResourceSourceKey(reference);
    const current = bindings.get(key);
    if (current) current.promptReferenceIds.push(reference.referenceId);
    else bindings.set(key, { key, reference, edgeIds: [], promptReferenceIds: [reference.referenceId] });
  }

  return [...bindings.values()];
}

export function promptDocumentPreviewReferences(
  document: CanvasPromptDocument,
): CanvasResourceReferenceAttrs[] {
  const seen = new Set<string>();
  return promptDocumentResourceAttrs(document).filter((reference) => {
    if (reference.mediaType !== "image" && reference.mediaType !== "video") return false;
    const key = promptResourceBindingKey(reference);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolvePromptResourcePreview(
  reference: CanvasResourceReferenceAttrs,
  nodes: CanvasNode[],
  assets: PipelineAsset[],
): PromptResourcePreview {
  const key = promptResourceBindingKey(reference);
  if (reference.sourceType === "canvas-node") {
    const node = nodes.find((candidate) => candidate.id === reference.sourceId);
    const source = resolveCanvasMediaSource(node?.id ?? "", node?.data);
    const textAvailable = node?.data?.type === "text"
      && Boolean(node.data.textDocument?.plainText.trim() || node.data.content?.some((item) => item.trim()));
    return {
      key,
      reference,
      url: source?.url ?? null,
      poster: node?.data?.poster,
      available: reference.mediaType === "text" ? textAvailable : Boolean(source),
    };
  }

  const asset = assets.find((candidate) => candidate.id === reference.sourceId);
  const artifactId = asset?.selectedArtifactId;
  return {
    key,
    reference,
    url: artifactId
      ? `/api/pipeline/assets/${encodeURIComponent(reference.sourceId)}/media?v=${encodeURIComponent(`artifact:${artifactId}`)}`
      : null,
    available: Boolean(artifactId),
  };
}

function promptResourceBindingKey(reference: CanvasResourceReferenceAttrs): string {
  // 与服务端编译器保持一致：相同资源的普通引用和首尾帧引用属于不同绑定。
  return `${reference.sourceType}:${reference.sourceId}:${reference.role}`;
}

export function promptResourceSourceKey(reference: Pick<CanvasResourceReferenceAttrs, "sourceType" | "sourceId">): string {
  return `${reference.sourceType}:${reference.sourceId}`;
}
