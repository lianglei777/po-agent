// Pipeline 前后端共享合同。不依赖 server 模块。
// 类型定义与 server/domain/pipeline.ts 保持一致，但独立声明以遵守架构边界。

export interface PipelineProject {
  id: string;
  rootPath: string;
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

export type CanvasMediaType = "text" | "image" | "video" | "audio";
export type CanvasResourceSourceType = "canvas-node" | "asset";
export type CanvasResourceRole = "reference" | "first-frame" | "last-frame";

export interface CanvasWorkspaceFileRef {
  relativePath: string;
  contentType: string;
  name: string;
}

export interface CanvasMediaReference {
  nodeId: string;
  sourceType?: CanvasResourceSourceType;
  sourceId?: string;
  referenceId?: string;
  role?: CanvasResourceRole;
  order?: number;
  mediaType: CanvasMediaType;
  label: string;
  artifactId?: string;
  url?: string;
  workspaceFile?: CanvasWorkspaceFileRef;
  content?: string[];
}

export type CanvasGenerationSettingValue = string | number | boolean | Array<string | number | boolean>;

export interface CanvasGenerationParams {
  prompt: string;
  promptDocument?: CanvasPromptDocument;
  routeId?: string;
  model?: string;
  count?: number;
  modeType?: string;
  settings?: Record<string, CanvasGenerationSettingValue>;
  advancedSettings?: Record<string, CanvasGenerationSettingValue>;
  textList?: CanvasMediaReference[];
  imageList?: CanvasMediaReference[];
  videoList?: CanvasMediaReference[];
  audioList?: CanvasMediaReference[];
  mixedListOrder?: string[];
}

export interface CanvasNodeTaskInfo {
  runId?: string;
  status: "idle" | "queued" | "processing" | "completed" | "failed";
  progressPercent?: number;
  errorMessage?: string;
}

export interface CanvasGroupRunInfo {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
}

export type CanvasRichTextAttributeValue = string | number | boolean | null;

export interface CanvasRichTextMark {
  type: "bold" | "italic" | "underline";
  attrs?: Record<string, CanvasRichTextAttributeValue>;
}

export interface CanvasRichTextNode {
  type: "doc" | "paragraph" | "heading" | "bulletList" | "orderedList" | "listItem" | "hardBreak" | "text" | "resourceReference";
  attrs?: Record<string, CanvasRichTextAttributeValue>;
  content?: CanvasRichTextNode[];
  marks?: CanvasRichTextMark[];
  text?: string;
}

export interface CanvasTextDocument {
  schemaVersion: 1;
  format: "tiptap-json";
  content: CanvasRichTextNode;
  plainText: string;
}

export interface CanvasResourceReferenceAttrs {
  referenceId: string;
  sourceType: CanvasResourceSourceType;
  sourceId: string;
  mediaType: CanvasMediaType;
  label: string;
  role: CanvasResourceRole;
}

export interface CanvasPromptDocument {
  schemaVersion: 1;
  format: "tiptap-json";
  content: CanvasRichTextNode;
  plainText: string;
}

export interface CanvasNodeData {
  type: CanvasMediaType;
  name: string;
  action: string;
  generatorType?: "default" | "enhance" | "resource";
  content?: string[];
  textDocument?: CanvasTextDocument;
  url?: string[];
  poster?: string;
  artifactIds?: string[];
  workspaceFile?: CanvasWorkspaceFileRef;
  params?: CanvasGenerationParams;
  taskInfo?: CanvasNodeTaskInfo;
  group?: {
    id: string;
    name: string;
  };
  groupRun?: CanvasGroupRunInfo;
  legacyEntity?: {
    type: "asset" | "frame" | "run" | "script";
    id: string;
  };
}

export type CanvasNodeType =
  | CanvasMediaType
  | "script"
  | "character"
  | "scene"
  | "prop"
  | "storyboard";

export interface CanvasNode {
  id: string;
  projectId: string;
  type: CanvasNodeType;
  entityId: string;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  data: CanvasNodeData | null;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasEdge {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: "references" | "source_of" | "generates" | "derives_from";
  createdAt?: string;
  updatedAt?: string;
}

export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

export type CanvasMutation =
  | { type: "node.create"; node: CanvasNode }
  | { type: "node.update"; nodeId: string; patch: { positionX?: number; positionY?: number; width?: number | null; height?: number | null; data?: CanvasNodeData | null } }
  | { type: "node.delete"; nodeId: string }
  | { type: "edge.create"; edge: CanvasEdge; intent?: "connect" | "restore" }
  | { type: "edge.delete"; edgeId: string }
  | { type: "viewport.update"; viewport: CanvasViewport };

export interface CanvasMutationBatch {
  baseRevision: number;
  requestId: string;
  mutations: CanvasMutation[];
}

export interface CanvasSnapshot {
  revision: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  viewport: CanvasViewport;
}

export interface CanvasWorkflowNodeTemplate {
  type: CanvasNodeType;
  data: CanvasNodeData | null;
  offsetX: number;
  offsetY: number;
  width: number | null;
  height: number | null;
}

export interface CanvasWorkflowEdgeTemplate {
  sourceIndex: number;
  targetIndex: number;
  edgeType: CanvasEdge["edgeType"];
}

export interface CanvasWorkflow {
  id: string;
  projectId: string;
  name: string;
  description: string;
  nodes: CanvasWorkflowNodeTemplate[];
  edges: CanvasWorkflowEdgeTemplate[];
  createdAt: string;
  updatedAt: string;
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
  rootPath: string;
  artDirection?: string;
}

export interface OpenPipelineProjectRequest {
  rootPath: string;
}

export interface UpdateProjectRequest {
  title?: string;
  originalText?: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  rootPath: string;
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

export type CanvasStateResponse = CanvasSnapshot;

export interface UpdateNodePositionRequest {
  x: number;
  y: number;
}

export interface CreateCanvasNodeRequest {
  type: CanvasMediaType;
  name?: string;
  positionX: number;
  positionY: number;
}

export interface UpdateCanvasNodeRequest {
  positionX?: number;
  positionY?: number;
  width?: number | null;
  height?: number | null;
  data?: CanvasNodeData;
}

export interface UpdateCanvasViewportRequest {
  x: number;
  y: number;
  zoom: number;
}

export interface GenerateCanvasNodeResponse {
  node: CanvasNode;
  runId?: string;
  edge?: CanvasEdge;
}

export interface GenerateCanvasNodeRequest {
  prompt?: string;
  promptDocument?: CanvasPromptDocument;
  routeId?: string;
  settings?: Record<string, CanvasGenerationSettingValue>;
  createNewNode?: boolean;
}

export interface GenerateTextNodeRequest {
  instruction: string;
  promptDocument?: CanvasPromptDocument;
  mode: "generate" | "revise";
  model?: string;
}

export interface GenerateTextNodeResponse {
  node: CanvasNode;
}

export interface CanvasWorkflowListResponse {
  workflows: CanvasWorkflow[];
}


// ── 响应包装 ──

export type ProjectResponse = PipelineProject;
export type AssetResponse = PipelineAsset;
export type FrameResponse = StoryboardFrame;
export type StageStatusesResponse = { stages: PipelineStageStatus[] };
export type ProjectListResponse = { projects: ProjectSummary[] };
export type AssetListResponse = { assets: PipelineAsset[] };
export type FrameListResponse = { frames: StoryboardFrame[] };
