import type {
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
