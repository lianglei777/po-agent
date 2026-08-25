// Pipeline 领域模型。遵循现有 domain 风格：纯数据，不依赖框架或 infrastructure。

// ── 项目 ──

export interface PipelineProject {
  id: string;
  rootPath: string;
  title: string;
  originalText: string;
  artDirection: ArtDirection | null;
  modelSettings: PipelineModelSettings | null;
  promptConfig: PipelinePromptConfig | null;
  status: PipelineProjectStatus;
  coverArtifactId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PipelineProjectStatus =
  | "draft"
  | "analyzing"
  | "assets_ready"
  | "storyboard_ready"
  | "video_ready"
  | "assembled"
  | "exported";

export interface ArtDirection {
  selectedStyleId: string;
  styleConfig: Record<string, unknown>;
  customStyles: CustomStyle[];
  aiRecommendations: AiStyleRecommendation[];
}

export interface CustomStyle {
  id: string;
  name: string;
  promptSuffix: string;
}

export interface AiStyleRecommendation {
  styleId: string;
  styleName: string;
  reason: string;
}

export interface PipelineModelSettings {
  t2iModel: string;
  i2iModel: string;
  i2vModel: string;
  r2vModel: string;
  characterAspectRatio: string;
  sceneAspectRatio: string;
  storyboardAspectRatio: string;
}

export interface PipelinePromptConfig {
  entityExtraction: string;
  storyboardExtraction: string;
  storyboardPolish: string;
  videoPolish: string;
  r2vPolish: string;
  polishModel: string;
}

// ── 资产 (角色/场景/道具) ──

export interface PipelineAsset {
  id: string;
  projectId: string;
  type: PipelineAssetType;
  name: string;
  description: string;
  attributes: PipelineAssetAttributes | null;
  selectedArtifactId: string | null;
  locked: boolean;
  starred: boolean;
  status: PipelineAssetStatus;
  createdAt: string;
  updatedAt: string;
}

export type PipelineAssetType = "character" | "scene" | "prop";
export type PipelineAssetStatus = "pending" | "processing" | "completed" | "failed";

export interface PipelineAssetAttributes {
  age?: string;
  gender?: string;
  clothing?: string;
  visualWeight?: number;
  timeOfDay?: string;
  lightingMood?: string;
  persona?: string;
  voiceId?: string;
  voiceName?: string;
}

// ── 资产变体 ──

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

// ── 分镜帧 ──

export interface StoryboardFrame {
  id: string;
  projectId: string;
  sceneId: string | null;
  characterIds: string[];
  propIds: string[];
  index: number;
  visualDescription: string | null;
  dialogueStructured: DialogueStructured | null;
  cameraMovement: CameraMovementData | null;
  blocking: Blocking | null;
  lighting: LightingData | null;
  audioNote: AudioNote | null;
  shotSize: string | null;
  transitionHint: string | null;
  imagePrompt: string | null;
  videoPrompt: string | null;
  selectedImageArtifactId: string | null;
  finalTakeRunId: string | null;
  locked: boolean;
  status: FrameStatus;
  createdAt: string;
  updatedAt: string;
}

export type FrameStatus = "pending" | "processing" | "completed" | "failed";

export interface DialogueStructured {
  speaker: string;
  line: string;
  emotion: string | null;
  delivery: string | null;
}

export interface CameraMovementData {
  primary: string;
  secondary: string | null;
  speed: string;
  description: string | null;
}

export interface Blocking {
  description: string;
  stage: StageSubject[] | null;
  cameraRelation: string | null;
}

export interface StageSubject {
  ref: string;
  zone: string;
  depth: string;
  height: string | null;
  facing: string | null;
  posture: string | null;
}

export interface LightingData {
  direction: string | null;
  quality: string | null;
  colorTemp: string | null;
  description: string | null;
}

export interface AudioNote {
  sfx: string | null;
  ambience: string | null;
  bgmNote: string | null;
}

// ── 无限画布 ──

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

export interface GenerateTextNodeInput {
  instruction: string;
  promptDocument?: CanvasPromptDocument;
  mode: "generate" | "revise";
  model?: string;
}

export interface GenerateCanvasNodeInput {
  prompt?: string;
  promptDocument?: CanvasPromptDocument;
  routeId?: string;
  settings?: Record<string, CanvasGenerationSettingValue>;
  createNewNode?: boolean;
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

// 保留旧 Pipeline 节点类型用于无损迁移；新 Studio 只创建四种媒体节点。
export type CanvasNodeType =
  | CanvasMediaType
  | "script"
  | "character"
  | "scene"
  | "prop"
  | "storyboard";

export interface CanvasEdge {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: CanvasEdgeType;
  createdAt?: string;
  updatedAt?: string;
}

export type CanvasEdgeType =
  | "references"
  | "source_of"
  | "generates"
  | "derives_from";

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
  edgeType: CanvasEdgeType;
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

// ── 阶段进度 ──

export interface PipelineStageStatus {
  stage: PipelineStage;
  status: "ready" | "warn" | "idle" | "gated";
  statusLabel: string;
}

export type PipelineStage =
  | "script"
  | "assets"
  | "storyboard"
  | "video"
  | "assembly";
