import type {
  AssetVariant,
  CanvasEdge,
  CanvasNode,
  CanvasNodeType,
  PipelineAsset,
  PipelineAssetType,
  PipelineProject,
  PipelineStageStatus,
  StoryboardFrame,
} from "@/server/domain/pipeline";

export interface PipelineRepository {
  createProject(input: Omit<PipelineProject, "createdAt" | "updatedAt">): Promise<PipelineProject>;
  getProject(id: string): Promise<PipelineProject | null>;
  listProjects(workspaceId: string): Promise<PipelineProject[]>;
  updateProject(id: string, patch: Partial<PipelineProject>): Promise<PipelineProject | null>;
  deleteProject(id: string): Promise<boolean>;

  createAsset(input: Omit<PipelineAsset, "createdAt" | "updatedAt">): Promise<PipelineAsset>;
  getAsset(id: string): Promise<PipelineAsset | null>;
  listAssets(projectId: string, type?: PipelineAssetType): Promise<PipelineAsset[]>;
  updateAsset(id: string, patch: Partial<PipelineAsset>): Promise<PipelineAsset | null>;
  deleteAsset(id: string): Promise<boolean>;

  addVariant(input: Omit<AssetVariant, "createdAt">): Promise<AssetVariant>;
  listVariants(assetId: string): Promise<AssetVariant[]>;
  updateVariant(id: string, patch: Partial<AssetVariant>): Promise<AssetVariant | null>;
  updateVariantByRunId(runId: string, patch: Partial<AssetVariant>): Promise<AssetVariant | null>;
  deleteVariant(id: string): Promise<boolean>;

  createFrame(input: Omit<StoryboardFrame, "createdAt" | "updatedAt">): Promise<StoryboardFrame>;
  getFrame(id: string): Promise<StoryboardFrame | null>;
  listFrames(projectId: string): Promise<StoryboardFrame[]>;
  updateFrame(id: string, patch: Partial<StoryboardFrame>): Promise<StoryboardFrame | null>;
  deleteFrame(id: string): Promise<boolean>;
  reorderFrames(projectId: string, frameIds: string[]): Promise<void>;

  createCanvasNode(input: Omit<CanvasNode, "createdAt">): Promise<CanvasNode>;
  getCanvasNode(id: string): Promise<CanvasNode | null>;
  listCanvasNodes(projectId: string): Promise<CanvasNode[]>;
  updateCanvasNodePosition(id: string, x: number, y: number): Promise<void>;
  deleteCanvasNode(id: string): Promise<boolean>;
  findCanvasNodeByEntity(projectId: string, entityType: CanvasNodeType, entityId: string): Promise<CanvasNode | null>;

  createCanvasEdge(input: Omit<CanvasEdge, "id">): Promise<CanvasEdge>;
  listCanvasEdges(projectId: string): Promise<CanvasEdge[]>;
  deleteCanvasEdge(id: string): Promise<boolean>;
  deleteCanvasEdgesByNode(nodeId: string): Promise<void>;

  getStageStatuses(projectId: string): Promise<PipelineStageStatus[]>;
}
