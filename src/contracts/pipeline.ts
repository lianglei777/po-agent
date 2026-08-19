// Pipeline 前后端共享合同。不依赖 server 模块。
// 类型定义与 server/domain/pipeline.ts 保持一致，但独立声明以遵守架构边界。

export interface PipelineProject {
  id: string;
  workspaceId: string;
  title: string;
  originalText: string;
  artDirection: unknown;
  modelSettings: unknown;
  promptConfig: unknown;
  status: string;
  coverArtifactId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetVariant {
  id: string;
  assetId: string;
  artifactId: string | null;
  runId: string | null;
  prompt: string;
  isFavorited: boolean;
  isUploadedSource: boolean;
  uploadType: string | null;
  createdAt: string;
}

export interface PipelineAsset {
  id: string;
  projectId: string;
  type: string;
  name: string;
  description: string;
  attributes: unknown;
  selectedArtifactId: string | null;
  locked: boolean;
  starred: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoryboardFrame {
  id: string;
  projectId: string;
  sceneId: string | null;
  characterIds: string[];
  propIds: string[];
  index: number;
  visualDescription: string | null;
  dialogueStructured: unknown;
  cameraMovement: unknown;
  blocking: unknown;
  lighting: unknown;
  audioNote: unknown;
  shotSize: string | null;
  transitionHint: string | null;
  imagePrompt: string | null;
  videoPrompt: string | null;
  selectedImageArtifactId: string | null;
  finalTakeRunId: string | null;
  locked: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasNode {
  id: string;
  projectId: string;
  type: string;
  entityId: string;
  positionX: number;
  positionY: number;
  createdAt: string;
}

export interface CanvasEdge {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: string;
}

export interface PipelineStageStatus {
  stage: string;
  status: "ready" | "warn" | "idle" | "gated";
  statusLabel: string;
}

// ── 项目 ──

export interface CreateProjectRequest {
  title: string;
  originalText: string;
  workspaceId: string;
  artDirection?: string;
}

export interface UpdateProjectRequest {
  title?: string;
  originalText?: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  status: string;
  stageStatuses: PipelineStageStatus[];
  frameCount: number;
  updatedAt: string;
}

// ── 资产 ──

export interface CreateAssetRequest {
  type: "character" | "scene" | "prop";
  name: string;
  description: string;
  positionX?: number;
  positionY?: number;
}

export interface UpdateAssetRequest {
  name?: string;
  description?: string;
}

// ── 分镜 ──

export interface CreateFrameRequest {
  sceneId?: string;
  characterIds?: string[];
  propIds?: string[];
  visualDescription?: string;
  shotSize?: string;
  positionX?: number;
  positionY?: number;
}

// ── 画布 ──

export interface CanvasStateResponse {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface UpdateNodePositionRequest {
  x: number;
  y: number;
}

// ── 响应包装 ──

export type ProjectResponse = PipelineProject;
export type AssetResponse = PipelineAsset;
export type FrameResponse = StoryboardFrame;
export type StageStatusesResponse = { stages: PipelineStageStatus[] };
export type ProjectListResponse = { projects: ProjectSummary[] };
export type AssetListResponse = { assets: PipelineAsset[] };
export type FrameListResponse = { frames: StoryboardFrame[] };
