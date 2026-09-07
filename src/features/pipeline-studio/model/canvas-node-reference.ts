import type {
  CanvasMediaType,
  CanvasNode,
  CanvasResourceReferenceAttrs,
} from "@/contracts/pipeline";
import { resolveCanvasMediaSource } from "./canvas-media-source";

export type CanvasReferenceMode = "content-ready" | "all-nodes";

export interface CanvasNodeReferenceDescriptor {
  sourceType: "canvas-node";
  sourceId: string;
  mediaType: CanvasMediaType;
  label: string;
  nodeType: CanvasNode["type"];
  available: boolean;
}

export function describeCanvasNodeReference(
  node: CanvasNode,
  mode: CanvasReferenceMode = "content-ready",
): CanvasNodeReferenceDescriptor {
  const mediaType = node.data?.type ?? canvasNodeTypeMediaType(node.type);
  return {
    sourceType: "canvas-node",
    sourceId: node.id,
    mediaType,
    label: node.data?.name.trim() || node.entityId || node.type,
    nodeType: node.type,
    // Agent 能分析节点结构和元数据，因此 all-nodes 模式不要求节点先产出内容。
    available: mode === "all-nodes" || canvasNodeHasReferenceContent(node),
  };
}

export function canvasNodeReferenceAttrs(
  node: CanvasNode,
  referenceId: string,
  pending = false,
): CanvasResourceReferenceAttrs {
  const descriptor = describeCanvasNodeReference(node, "all-nodes");
  return {
    referenceId,
    sourceType: descriptor.sourceType,
    sourceId: descriptor.sourceId,
    mediaType: descriptor.mediaType,
    label: descriptor.label,
    role: "reference",
    pending,
  };
}

export function canvasNodeReferenceIsAvailable(
  node: CanvasNode | undefined,
  mode: CanvasReferenceMode,
): boolean {
  return Boolean(node && (mode === "all-nodes" || canvasNodeHasReferenceContent(node)));
}

function canvasNodeHasReferenceContent(node: CanvasNode): boolean {
  if (!node.data) return false;
  if (node.data.type === "text") {
    return Boolean(node.data.textDocument?.plainText.trim() || node.data.content?.some((item) => item.trim()));
  }
  return Boolean(resolveCanvasMediaSource(node.id, node.data));
}

function canvasNodeTypeMediaType(type: CanvasNode["type"]): CanvasMediaType {
  return type === "image" || type === "video" || type === "audio" ? type : "text";
}
