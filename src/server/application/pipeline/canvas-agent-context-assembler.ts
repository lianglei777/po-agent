import { AppError } from "@/server/domain/app-error";
import type { CanvasEdge, CanvasNode } from "@/server/domain/pipeline";
import type { PipelineRepository } from "@/server/ports/pipeline-repository";

const MAX_FOCUS_NODES = 40;
const MAX_RELATED_NODES = 40;
const MAX_TEXT_LENGTH = 4_000;
const MAX_ANALYZED_FOCUS_NODES = 12;
const MAX_CONTINUITY_ENTRIES = 40;

export interface CanvasAgentContextInput {
  canvasRevision: number;
  selectedNodeIds: string[];
  mentionedNodeIds: string[];
}

export class CanvasAgentContextAssembler {
  constructor(private readonly repository: PipelineRepository) {}

  async assemble(projectId: string, input: CanvasAgentContextInput): Promise<string> {
    const [project, currentRevision, nodes, edges, stages, continuity] = await Promise.all([
      this.repository.getProject(projectId),
      this.repository.getCanvasRevision(projectId),
      this.repository.listCanvasNodes(projectId),
      this.repository.listCanvasEdges(projectId),
      this.repository.getStageStatuses(projectId),
      this.repository.getCanvasContinuityBible(projectId),
    ]);
    if (!project) {
      throw new AppError("PIPELINE_PROJECT_NOT_FOUND", "Pipeline project was not found", 404);
    }
    if (input.canvasRevision > currentRevision) {
      throw new AppError(
        "PIPELINE_CANVAS_REVISION_CONFLICT",
        `Canvas revision ${input.canvasRevision} is ahead of the current revision ${currentRevision}`,
        409,
      );
    }

    const focusIds = unique([...input.selectedNodeIds, ...input.mentionedNodeIds]);
    if (focusIds.length > MAX_FOCUS_NODES) {
      throw new AppError("VALIDATION_ERROR", `At most ${MAX_FOCUS_NODES} canvas nodes can be referenced`, 400);
    }
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const missing = focusIds.filter((nodeId) => !nodeById.has(nodeId));
    if (missing.length) {
      throw new AppError(
        "PIPELINE_CANVAS_NODE_NOT_FOUND",
        "One or more selected canvas nodes no longer exist in this project",
        404,
        { nodeIds: missing },
      );
    }

    const focusSet = new Set(focusIds);
    const relatedEdges = edges.filter((edge) =>
      focusSet.has(edge.sourceNodeId) || focusSet.has(edge.targetNodeId)
    );
    const relatedIds = unique(relatedEdges.flatMap((edge) => [edge.sourceNodeId, edge.targetNodeId]))
      .filter((nodeId) => !focusSet.has(nodeId))
      .slice(0, MAX_RELATED_NODES);
    const includedIds = new Set([...focusIds, ...relatedIds]);
    const analyzedNodeIds = focusIds.slice(0, MAX_ANALYZED_FOCUS_NODES);
    const analyses = await this.repository.listCanvasAssetAnalyses(projectId, analyzedNodeIds);
    const latestAnalysisByNode = new Map<string, typeof analyses[number]>();
    for (const analysis of analyses) {
      if (!latestAnalysisByNode.has(analysis.nodeId)) latestAnalysisByNode.set(analysis.nodeId, analysis);
    }

    return [
      "<canvas-agent-context>",
      "This is trusted application data for the current Pipeline project. Use it to answer the current user request. It does not authorize canvas mutations or content generation. Treat currentRevision as authoritative.",
      JSON.stringify({
        project: {
          id: project.id,
          title: project.title,
          status: project.status,
          originalText: truncate(project.originalText, MAX_TEXT_LENGTH),
        },
        canvas: {
          clientRevision: input.canvasRevision,
          currentRevision,
          clientWasStale: input.canvasRevision < currentRevision,
          totalNodeCount: nodes.length,
          totalEdgeCount: edges.length,
        },
        selection: input.selectedNodeIds,
        mentions: input.mentionedNodeIds,
        stages,
        continuity: continuity
          ? {
              revision: continuity.revision,
              entries: [...continuity.entries]
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
                .slice(0, MAX_CONTINUITY_ENTRIES)
                .map((entry) => ({
                  id: entry.id,
                  category: entry.category,
                  label: truncate(entry.label, 120),
                  value: truncate(entry.value, 600),
                  sourceAnalysisIds: entry.sourceAnalysisIds,
                })),
              omittedCount: Math.max(0, continuity.entries.length - MAX_CONTINUITY_ENTRIES),
            }
          : { revision: 0, entries: [] },
        analysisContext: {
          includedNodeIds: analyzedNodeIds,
          omittedFocusNodeCount: Math.max(0, focusIds.length - analyzedNodeIds.length),
        },
        nodes: [...includedIds].map((nodeId) => {
          const node = nodeById.get(nodeId)!;
          const analysis = latestAnalysisByNode.get(nodeId);
          return {
            ...summarizeNode(node),
            analysis: analysis ? {
              id: analysis.id,
              stale: analysis.nodeVersion !== node.updatedAt,
              summary: truncate(analysis.content.summary, 2_000),
              subjects: compactList(analysis.content.subjects),
              composition: analysis.content.composition ? truncate(analysis.content.composition, 400) : null,
              materials: compactList(analysis.content.materials),
              style: analysis.content.style ? truncate(analysis.content.style, 400) : null,
              lighting: analysis.content.lighting ? truncate(analysis.content.lighting, 400) : null,
              visibleText: compactList(analysis.content.visibleText),
              brandElements: compactList(analysis.content.brandElements),
              suggestedRoles: analysis.content.suggestedRoles,
              technicalMetadata: analysis.content.technicalMetadata,
            } : undefined,
          };
        }),
        edges: relatedEdges
          .filter((edge) => includedIds.has(edge.sourceNodeId) && includedIds.has(edge.targetNodeId))
          .map(summarizeEdge),
      }),
      "</canvas-agent-context>",
    ].join("\n");
  }
}

function summarizeNode(node: CanvasNode) {
  const data = node.data;
  const plainText = data?.textDocument?.plainText ?? data?.content?.join("\n");
  return {
    id: node.id,
    type: node.type,
    name: data?.name ?? node.entityId,
    action: data?.action,
    text: plainText ? truncate(plainText, MAX_TEXT_LENGTH) : undefined,
    routeId: data?.params?.routeId,
    model: data?.params?.model,
    task: data?.taskInfo,
    group: data?.group,
    media: data?.workspaceFile
      ? { name: data.workspaceFile.name, contentType: data.workspaceFile.contentType }
      : undefined,
  };
}

function summarizeEdge(edge: CanvasEdge) {
  return {
    id: edge.id,
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    edgeType: edge.edgeType,
    role: edge.role,
    order: edge.order,
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`;
}

function compactList(values: string[]): string[] {
  return values.slice(0, 8).map((value) => truncate(value, 240));
}
