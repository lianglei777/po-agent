import type { CanvasEdge, CanvasNode, CanvasShotSpec } from "@/contracts/pipeline";
import { nodeDataWithCreativeSpec } from "./creative-spec";

export type ShotListStatus = "missing" | "stale" | "running" | "failed" | "completed" | "configured" | "unconfigured";

export interface ShotListRow {
  node: CanvasNode;
  spec: CanvasShotSpec;
  episodeKey: string;
  status: ShotListStatus;
}

export function buildShotListRows(nodes: CanvasNode[], edges: CanvasEdge[]): ShotListRow[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  return nodes.flatMap((node) => {
    const spec = node.data?.creativeSpec;
    if (!spec || spec.kind !== "shot") return [];
    const outputs = edges
      .filter((edge) => edge.sourceNodeId === node.id && edge.edgeType === "derives_from")
      .map((edge) => nodesById.get(edge.targetNodeId))
      .filter((candidate): candidate is CanvasNode => Boolean(candidate?.data && candidate.data.type !== "text"));
    return [{
      node,
      spec,
      episodeKey: spec.episodeKey ?? node.data?.group?.id ?? "ungrouped",
      status: shotOutputStatus(outputs),
    }];
  }).sort((left, right) => left.episodeKey.localeCompare(right.episodeKey)
    || left.spec.order - right.spec.order
    || left.node.id.localeCompare(right.node.id));
}

export function updateShotDurations(rows: ShotListRow[], nodeIds: string[], durationSeconds: number): Array<{ nodeId: string; data: NonNullable<CanvasNode["data"]> }> {
  const selected = new Set(nodeIds);
  return rows.flatMap((row) => {
    if (!selected.has(row.node.id) || !row.node.data) return [];
    return [{
      nodeId: row.node.id,
      data: nodeDataWithCreativeSpec(row.node.data, { ...row.spec, durationSeconds }),
    }];
  });
}

function shotOutputStatus(outputs: CanvasNode[]): ShotListStatus {
  if (!outputs.length) return "missing";
  if (outputs.some((node) => node.data?.generationProvenance?.stale)) return "stale";
  if (outputs.some((node) => node.data?.taskInfo?.status === "processing" || node.data?.taskInfo?.status === "queued")) return "running";
  if (outputs.some((node) => node.data?.taskInfo?.status === "failed")) return "failed";
  if (outputs.some((node) => node.data?.taskInfo?.status === "completed")) return "completed";
  if (outputs.every((node) => Boolean(node.data?.params?.routeId))) return "configured";
  return "unconfigured";
}
