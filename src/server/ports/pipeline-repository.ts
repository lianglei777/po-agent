import type {
  AssetVariant,
  CanvasEdge,
  CanvasMutation,
  CanvasNode,
  CanvasNodeType,
  CanvasNodeData,
  CanvasViewport,
  CanvasWorkflow,
  PipelineAsset,
  PipelineAssetType,
  PipelineProject,
  PipelineStageStatus,
  StoryboardFrame,
} from "@/server/domain/pipeline";

export interface PipelineRepository {
  createProject(input: Omit<PipelineProject, "createdAt" | "updatedAt">): Promise<PipelineProject>;
  openProject(rootPath: string): Promise<PipelineProject>;
  getProjectRoot(projectId: string): Promise<string | null>;
  getProject(id: string): Promise<PipelineProject | null>;
  listProjects(): Promise<PipelineProject[]>;
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

  createCanvasNode(input: Omit<CanvasNode, "createdAt" | "updatedAt" | "width" | "height" | "data"> & { width?: number | null; height?: number | null; data?: CanvasNodeData | null }): Promise<CanvasNode>;
  getCanvasNode(id: string): Promise<CanvasNode | null>;
  listCanvasNodes(projectId: string): Promise<CanvasNode[]>;
  updateCanvasNodePosition(id: string, x: number, y: number): Promise<void>;
  updateCanvasNode(id: string, patch: {
    positionX?: number;
    positionY?: number;
    width?: number | null;
    height?: number | null;
    data?: CanvasNodeData | null;
  }): Promise<CanvasNode | null>;
  deleteCanvasNode(id: string): Promise<boolean>;
  findCanvasNodeByEntity(projectId: string, entityType: CanvasNodeType, entityId: string): Promise<CanvasNode | null>;

  createCanvasEdge(input: Omit<CanvasEdge, "id" | "createdAt" | "updatedAt">): Promise<CanvasEdge>;
  getCanvasEdge(id: string): Promise<CanvasEdge | null>;
  listCanvasEdges(projectId: string): Promise<CanvasEdge[]>;
  updateCanvasEdge(id: string, patch: { role?: CanvasEdge["role"]; order?: number }): Promise<CanvasEdge | null>;
  deleteCanvasEdge(id: string): Promise<boolean>;
  deleteCanvasEdgesByNode(nodeId: string): Promise<void>;

  getCanvasViewport(projectId: string): Promise<CanvasViewport>;
  getCanvasRevision(projectId: string): Promise<number>;
  updateCanvasViewport(projectId: string, viewport: CanvasViewport): Promise<void>;
  applyCanvasMutationBatch(projectId: string, baseRevision: number, mutations: CanvasMutation[]): Promise<{ applied: boolean; revision: number }>;

  createCanvasWorkflow(input: Omit<CanvasWorkflow, "createdAt" | "updatedAt">): Promise<CanvasWorkflow>;
  listCanvasWorkflows(projectId: string): Promise<CanvasWorkflow[]>;
  getCanvasWorkflow(id: string): Promise<CanvasWorkflow | null>;
  deleteCanvasWorkflow(id: string): Promise<boolean>;

  getStageStatuses(projectId: string): Promise<PipelineStageStatus[]>;
}
