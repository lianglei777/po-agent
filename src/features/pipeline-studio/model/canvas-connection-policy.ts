import type {
  CanvasEdge,
  CanvasNode,
  CanvasResourceReferenceAttrs,
} from "@/contracts/pipeline";

export type CanvasConnectionProblem =
  | "self"
  | "missing-node"
  | "cross-project"
  | "duplicate"
  | "target-busy"
  | "target-has-content"
  | "cycle"
  | null;

export function canvasNodeHasContent(node: CanvasNode | undefined): boolean {
  const data = node?.data;
  if (!data) return false;
  if (data.type === "text") {
    return Boolean(data.textDocument?.plainText.trim() || data.content?.some((item) => item.trim()));
  }
  return Boolean(data.workspaceFile || data.artifactIds?.length || data.url?.length);
}

export function canvasConnectionProblem(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  sourceNodeId: string,
  targetNodeId: string,
): CanvasConnectionProblem {
  if (sourceNodeId === targetNodeId) return "self";
  const source = nodes.find((node) => node.id === sourceNodeId);
  const target = nodes.find((node) => node.id === targetNodeId);
  if (!source || !target) return "missing-node";
  if (source.projectId !== target.projectId) return "cross-project";
  if (edges.some((edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId)) {
    return "duplicate";
  }
  if (target.data?.taskInfo?.status === "queued" || target.data?.taskInfo?.status === "processing") {
    return "target-busy";
  }
  if (canvasNodeHasContent(target)) return "target-has-content";
  if (canReachNode(edges, targetNodeId, sourceNodeId)) return "cycle";
  return null;
}

export function connectedCanvasReferences(
  targetNodeId: string,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): CanvasResourceReferenceAttrs[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return edges.flatMap((edge) => {
    if (edge.targetNodeId !== targetNodeId) return [];
    const source = nodesById.get(edge.sourceNodeId);
    if (!source?.data) return [];
    return [{
      // 边 ID 使引用在上游改名或内容更新后仍保持稳定身份。
      referenceId: `edge:${edge.id}`,
      sourceType: "canvas-node" as const,
      sourceId: source.id,
      mediaType: source.data.type,
      label: source.data.name,
      role: "reference" as const,
    }];
  });
}

export function connectedCanvasEdgeIds(
  selectedNodeIds: string[],
  edges: CanvasEdge[],
): Set<string> {
  if (!selectedNodeIds.length) return new Set();
  const selected = new Set(selectedNodeIds);
  return new Set(edges.flatMap((edge) => (
    selected.has(edge.sourceNodeId) || selected.has(edge.targetNodeId) ? [edge.id] : []
  )));
}

function canReachNode(edges: CanvasEdge[], startNodeId: string, targetNodeId: string): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, targets);
  }
  const pending = [startNodeId];
  const visited = new Set<string>();
  while (pending.length) {
    const nodeId = pending.pop()!;
    if (nodeId === targetNodeId) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    pending.push(...(outgoing.get(nodeId) ?? []));
  }
  return false;
}
