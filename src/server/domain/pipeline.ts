// Pipeline 领域模型。遵循现有 domain 风格：纯数据，不依赖框架或 infrastructure。

// ── 项目 ──

export interface PipelineProject {
  id: string;
  workspaceId: string;
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

// ── 画布节点 ──

export interface CanvasNode {
  id: string;
  projectId: string;
  type: CanvasNodeType;
  entityId: string;
  positionX: number;
  positionY: number;
  createdAt: string;
}

export type CanvasNodeType =
  | "script"
  | "character"
  | "scene"
  | "prop"
  | "storyboard"
  | "video";

// ── 画布边 ──

export interface CanvasEdge {
  id: string;
  projectId: string;
  sourceNodeId: string;
  targetNodeId: string;
  edgeType: CanvasEdgeType;
}

export type CanvasEdgeType =
  | "references"
  | "source_of"
  | "generates"
  | "derives_from";

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
