 # Pipeline 工作台 — 技术架构设计

 > 分支: `feature/pipeline-workbench`
 > 依赖文档: pipeline-workbench-design.md (产品设计), pipeline-implementation-analysis.md (初始分析)
 > 架构原则: 遵循 po-agent 现有 domain ← ports ← application ← infrastructure ← transport 分层

 ---

 ## 1. 架构总览

 Pipeline 工作台在 po-agent 现有分层架构内新增一个 pipeline 业务域，
 复用现有 Generation Run/Job/Artifact 基础设施，新增独立的 domain、ports、
 application services 和 API 端点。

 ```text
 src/app/api/pipeline/          ← Route Handlers (薄层)
     ↑
 src/server/transport/http/      ← pipeline-validators.ts (输入验证)
     ↑
 src/server/application/pipeline/ ← Application Services (业务编排)
     ├── script-analysis-service.ts
     ├── asset-generation-service.ts
     ├── storyboard-service.ts
     ├── video-generation-service.ts
     ├── assembly-service.ts
     ├── canvas-service.ts
     └── pipeline-agent-tool-provider.ts
     ↑                           ↑
 src/server/ports/              src/server/application/content-generation/
 ├── pipeline-repository.ts      ← generation-run-service.ts (复用)
 ├── llm-port.ts                 ← generation-execution-service.ts (复用)
 └── pipeline-sse-port.ts        ← generation-worker.ts (复用)
     ↑
 src/server/domain/pipeline.ts   ← 领域模型
     ↑
 src/server/infrastructure/
 ├── sqlite/sqlite-pipeline-repository.ts
 ├── pi/pi-llm-adapter.ts
 └── sqlite/sqlite-migrations.ts (新增 migration)
 ```

 ---

 ## 2. Domain 层

 位置: `src/server/domain/pipeline.ts`

 ### 2.1 核心实体

 ```typescript
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
   | 'draft'
   | 'analyzing'
   | 'assets_ready'
   | 'storyboard_ready'
   | 'video_ready'
   | 'assembled'
   | 'exported';

 export interface ArtDirection {
   selectedStyleId: string;
   styleConfig: Record<string, unknown>;
   customStyles: CustomStyle[];
   aiRecommendations: AiStyleRecommendation[];
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
   entityExtraction: string;      // 空 = 用系统默认
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

 export type PipelineAssetType = 'character' | 'scene' | 'prop';
 export type PipelineAssetStatus = 'pending' | 'processing' | 'completed' | 'failed';

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
   artifactId: string | null;     // 关联 GenerationArtifact
   runId: string | null;          // 关联 GenerationRun
   prompt: string;
   isFavorited: boolean;
   isUploadedSource: boolean;
   uploadType: string | null;     // full_body/head_shot/three_views/image
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

 export type FrameStatus = 'pending' | 'processing' | 'completed' | 'failed';

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
   entityId: string;             // 关联 PipelineAsset/StoryboardFrame/GenerationRun
   positionX: number;
   positionY: number;
   createdAt: string;
 }

 export type CanvasNodeType =
   | 'script'
   | 'character'
   | 'scene'
   | 'prop'
   | 'storyboard'
   | 'video';

 // ── 画布边 ──
 export interface CanvasEdge {
   id: string;
   projectId: string;
   sourceNodeId: string;
   targetNodeId: string;
   edgeType: CanvasEdgeType;
 }

 export type CanvasEdgeType =
   | 'references'      // 分镜引用角色/场景/道具
   | 'source_of'       // 视频来源分镜
   | 'generates'       // 资产生成视频
   | 'derives_from';   // 衍生资产来源

 // ── 阶段进度 ──
 export interface PipelineStageStatus {
   stage: PipelineStage;
   status: 'ready' | 'warn' | 'idle' | 'gated';
   statusLabel: string;
 }

 export type PipelineStage =
   | 'script'
   | 'assets'
   | 'storyboard'
   | 'video'
   | 'assembly';
 ```

 ### 2.2 领域错误

 ```typescript
 // 复用现有 AppError
 // 新增错误码:
 // - PIPELINE_PROJECT_NOT_FOUND
 // - PIPELINE_ASSET_NOT_FOUND
 // - PIPELINE_FRAME_NOT_FOUND
 // - PIPELINE_STAGE_GATED        (上游阶段未完成)
 // - PIPELINE_ASSET_LOCKED       (资产被锁定，不可重新生成)
 // - PIPELINE_LLM_FAILED         (LLM 调用失败)
 // - PIPELINE_CANVAS_NODE_NOT_FOUND
 ```

 ---

 ## 3. Ports 层

 ### 3.1 PipelineRepository

 位置: `src/server/ports/pipeline-repository.ts`

 ```typescript
 export interface PipelineRepository {
   // ── 项目 ──
   createProject(input: Omit<PipelineProject, 'createdAt' | 'updatedAt'>): Promise<PipelineProject>;
   getProject(id: string): Promise<PipelineProject | null>;
   listProjects(workspaceId: string): Promise<PipelineProject[]>;
   updateProject(id: string, patch: Partial<PipelineProject>): Promise<PipelineProject | null>;
   deleteProject(id: string): Promise<boolean>;

   // ── 资产 ──
   createAsset(input: Omit<PipelineAsset, 'createdAt' | 'updatedAt'>): Promise<PipelineAsset>;
   getAsset(id: string): Promise<PipelineAsset | null>;
   listAssets(projectId: string, type?: PipelineAssetType): Promise<PipelineAsset[]>;
   updateAsset(id: string, patch: Partial<PipelineAsset>): Promise<PipelineAsset | null>;
   deleteAsset(id: string): Promise<boolean>;

   // ── 资产变体 ──
   addVariant(input: Omit<AssetVariant, 'createdAt'>): Promise<AssetVariant>;
   listVariants(assetId: string): Promise<AssetVariant[]>;
   updateVariant(id: string, patch: Partial<AssetVariant>): Promise<AssetVariant | null>;
   deleteVariant(id: string): Promise<boolean>;

   // ── 分镜帧 ──
   createFrame(input: Omit<StoryboardFrame, 'createdAt' | 'updatedAt'>): Promise<StoryboardFrame>;
   getFrame(id: string): Promise<StoryboardFrame | null>;
   listFrames(projectId: string): Promise<StoryboardFrame[]>;
   updateFrame(id: string, patch: Partial<StoryboardFrame>): Promise<StoryboardFrame | null>;
   deleteFrame(id: string): Promise<boolean>;
   reorderFrames(projectId: string, frameIds: string[]): Promise<void>;

   // ── 画布节点 ──
   createCanvasNode(input: Omit<CanvasNode, 'createdAt'>): Promise<CanvasNode>;
   getCanvasNode(id: string): Promise<CanvasNode | null>;
   listCanvasNodes(projectId: string): Promise<CanvasNode[]>;
   updateCanvasNodePosition(id: string, x: number, y: number): Promise<void>;
   deleteCanvasNode(id: string): Promise<boolean>;
   findCanvasNodeByEntity(projectId: string, entityType: CanvasNodeType, entityId: string): Promise<CanvasNode | null>;

   // ── 画布边 ──
   createCanvasEdge(input: Omit<CanvasEdge, 'id'>): Promise<CanvasEdge>;
   listCanvasEdges(projectId: string): Promise<CanvasEdge[]>;
   deleteCanvasEdge(id: string): Promise<boolean>;
   deleteCanvasEdgesByNode(nodeId: string): Promise<void>;

   // ── 阶段状态 ──
   getStageStatuses(projectId: string): Promise<PipelineStageStatus[]>;
 }
 ```

 **设计要点**:
 - 不管理 GenerationRun/Job/Artifact，那些由现有 `GenerationRepository` 管理
 - 资产变体的 `artifactId` 和 `runId` 是外键引用，不级联删除
 - 删除资产时级联删除变体和关联的画布节点/边
 - `findCanvasNodeByEntity` 用于 AI 工具创建实体后查找/创建对应画布节点

 ### 3.2 LlmPort

 位置: `src/server/ports/llm-port.ts`

 ```typescript
 export interface LlmMessage {
   role: 'system' | 'user' | 'assistant';
   content: string;
 }

 export interface LlmOptions {
   model?: string;               // 覆盖默认模型
   responseFormat?: 'text' | 'json';
   temperature?: number;
   maxTokens?: number;
 }

 export interface LlmChunk {
   type: 'text-delta' | 'tool-call' | 'finish' | 'error';
   text?: string;
   error?: string;
 }

 export interface LlmPort {
   /** 同步调用，返回完整响应 */
   chat(messages: LlmMessage[], options?: LlmOptions): Promise<string>;

   /** 流式调用，返回 async iterable */
   stream(messages: LlmMessage[], options?: LlmOptions): AsyncIterable<LlmChunk>;

   /** 当前是否已配置 */
   isConfigured(): boolean;
 }
 ```

 **实现**: `PiLlmAdapter` (infrastructure 层)
 - 复用 `ModelRuntime` 和 `PiModelProvider` 获取可用模型
 - 通过 Pi SDK 的 LLM 能力发起调用
 - 如果 Pi SDK 不直接暴露 LLM chat 接口，则通过 `AgentRuntime.execute()`
   发送一个特殊的内部命令来获取 LLM 响应
 - 支持 JSON response format（用于实体提取的结构化输出）

 ### 3.3 PipelineSsePort (可选)

 位置: `src/server/ports/pipeline-sse-port.ts`

 ```typescript
 export interface PipelineSseEvent {
   type: 'node_created' | 'node_updated' | 'node_deleted'
       | 'edge_created' | 'edge_deleted'
       | 'asset_updated' | 'frame_updated'
       | 'generation_progress' | 'generation_completed' | 'generation_failed'
       | 'agent_message' | 'agent_thinking' | 'agent_tool_call';
   projectId: string;
   payload: unknown;
 }

 export interface PipelineSsePort {
   emit(event: PipelineSseEvent): void;
   subscribe(projectId: string, listener: (event: PipelineSseEvent) => void): () => void;
 }
 ```

 **实现**: 进程内 `EventEmitter`，SSE Route Handler 订阅后推送到浏览器。
 与现有 Chat SSE 独立，有自己的端点和事件类型。

 ---

 ## 4. Application 层

 位置: `src/server/application/pipeline/`

 ### 4.1 ScriptAnalysisService

 ```typescript
 export class ScriptAnalysisService {
   constructor(
     private readonly llm: LlmPort,
     private readonly repo: PipelineRepository,
     private readonly sse?: PipelineSsePort,
   ) {}

   /** LLM 提取角色/场景/道具，创建资产 + 画布节点 */
   async extractEntities(
     projectId: string,
     options?: { customPrompt?: string },
   ): Promise<PipelineAsset[]> {
     // 1. 读取 project.originalText
     // 2. 构建 system prompt (实体提取 Prompt A)
     // 3. 调用 llm.chat() with responseFormat: 'json'
     // 4. 解析 JSON 输出: { characters: [...], scenes: [...], props: [...] }
     // 5. 为每个实体创建 PipelineAsset
     // 6. 为每个资产创建 CanvasNode (自动布局)
     // 7. SSE 推送 node_created 事件
     // 8. 更新 project.status = 'assets_ready'
     // 9. 返回创建的资产列表
   }

   /** LLM 分析视觉风格 */
   async analyzeStyles(projectId: string): Promise<ArtDirection> {
     // 1. 读取 originalText
     // 2. 调用 LLM 分析风格，返回推荐画风
     // 3. 更新 project.artDirection
     // 4. 返回 ArtDirection
   }

   /** 同步实体描述 */
   async syncDescriptions(projectId: string): Promise<void> {
     // 从剧本重新提取描述，更新已有资产的 description
   }
 }
 ```

 ### 4.2 AssetGenerationService

 ```typescript
 export class AssetGenerationService {
   constructor(
     private readonly repo: PipelineRepository,
     private readonly runService: GenerationRunService,  // 复用现有
     private readonly sse?: PipelineSsePort,
   ) {}

   /** 生成资产参考图 (T2I) */
   async generateAssetImage(
     projectId: string,
     assetId: string,
     options?: { batchSize?: number; promptOverride?: string },
   ): Promise<AssetVariant[]> {
     // 1. 读取 asset + project.artDirection + project.modelSettings
     // 2. 拼装 prompt (description + style + aspectRatio)
     // 3. 创建 GenerationRun (capability: 'text-to-image')
     //    - source: 'agent-tool' 或 'direct-ui'
     //    - idempotencyKey: `pipeline:asset:${assetId}:${Date.now()}`
     // 4. 创建 AssetVariant (artifactId/runId 先为 null，Worker 完成后回填)
     // 5. 返回 variants (前端显示生成中状态)
     // Worker 完成后通过 SSE 推送 generation_completed
   }

   /** 上传源图片作为变体 */
   async uploadAssetImage(
     projectId: string,
     assetId: string,
     imageData: Uint8Array,
     contentType: string,
   ): Promise<AssetVariant> {
     // 1. 通过 GenerationAssetService 写入 workspace
     // 2. 创建 AssetVariant (isUploadedSource: true)
     // 3. SSE 推送
   }

 /** 选择变体 */
   async selectVariant(assetId: string, variantId: string): Promise<void> {
     // 更新 asset.selectedArtifactId
   }

   /** 收藏/取消收藏变体 */
   async toggleVariantFavorite(variantId: string): Promise<void> { ... }

   /** 锁定/解锁资产 */
   async toggleAssetLock(assetId: string): Promise<void> { ... }
 }
 ```

 **GenerationRun 映射**:
 - 资产图生成 → `capability: 'text-to-image'`, `source: 'direct-ui'`
 - `idempotencyKey`: `pipeline:asset:{assetId}:{timestamp}` 避免重复
 - `sessionId`: 使用 pipeline project 关联的 GenerationSession
 - Worker 完成后，`GenerationExecutionService` 创建 `GenerationArtifact`
 - `AssetGenerationService` 监听完成事件，回填 `AssetVariant.artifactId`

 ### 4.3 StoryboardService

 ```typescript
 export class StoryboardService {
   constructor(
     private readonly llm: LlmPort,
     private readonly repo: PipelineRepository,
     private readonly runService: GenerationRunService,
     private readonly sse?: PipelineSsePort,
   ) {}

   /** LLM 提取分镜帧 */
   async extractFrames(
     projectId: string,
     options?: { customPrompt?: string },
   ): Promise<StoryboardFrame[]> {
     // 1. 读取 originalText + assets (角色/场景/道具)
     // 2. 构建 system prompt (分镜提取 Prompt B)
     // 3. 调用 llm.chat() with responseFormat: 'json'
     // 4. 解析 JSON: { frames: [{ visualDescription, dialogue, cameraMovement, ... }] }
     // 5. 为每个帧创建 StoryboardFrame
     // 6. 为每个帧创建 CanvasNode (storyboard 类型)
     // 7. 自动创建 CanvasEdge (frame → character/scene, references 类型)
     // 8. SSE 推送
     // 9. 更新 project.status = 'storyboard_ready'
   }

   /** 拼装分镜 prompt (纯函数，可独立测试) */
   assembleFramePrompt(
     frame: StoryboardFrame,
     assets: PipelineAsset[],
   ): string {
     // 参考 LumenX prompt_assembly.py 的 assemble_prompt
     // 优先级: visualDescription → lighting → cameraMovement → shotSize → 角色外观
   }

   /** LLM 润色 prompt */
   async polishPrompt(
     projectId: string,
     frameId: string,
     stage: 'image' | 'video' | 'r2v',
   ): Promise<string> {
     // 1. 读取 frame 的 draft prompt
     // 2. 读取关联 assets 的描述
     // 3. 调用 LLM 润色 (Prompt C/D/E)
     // 4. 更新 frame.imagePrompt / videoPrompt
   }

   /** 生成分镜图 (I2I) */
   async generateFrameImage(
     projectId: string,
     frameId: string,
     options?: { batchSize?: number },
   ): Promise<void> {
     // 1. 读取 frame + 关联 assets 的选中图片
     // 2. 拼装 prompt
     // 3. 创建 GenerationRun (capability: 'image-to-image')
     //    - assets: [{ slot: 'reference', ... }]
     // 4. Worker 处理，完成后更新 frame.selectedImageArtifactId
   }

   /** 添加/删除/重排分镜帧 */
   async addFrame(projectId: string, insertAt?: number): Promise<StoryboardFrame> { ... }
   async deleteFrame(frameId: string): Promise<void> { ... }
   async reorderFrames(projectId: string, frameIds: string[]): Promise<void> { ... }
 }
 ```

 ### 4.4 VideoGenerationService

 ```typescript
 export class VideoGenerationService {
   constructor(
     private readonly repo: PipelineRepository,
     private readonly runService: GenerationRunService,
     private readonly sse?: PipelineSsePort,
   ) {}

   /** I2V 生成 (先有图，再生视频) */
   async generateI2V(
     projectId: string,
     frameId: string,
     options?: { duration?: number; model?: string },
   ): Promise<string> {
     // 1. 读取 frame.selectedImageArtifactId
     // 2. 创建 GenerationRun (capability: 'image-to-video')
     //    - assets: [{ slot: 'source_image', artifactId }]
     // 3. 创建 CanvasNode (video 类型) + CanvasEdge (source_of)
     // 4. 返回 runId
   }

   /** R2V 生成 (参考图+文本直接生视频) */
   async generateR2V(
     projectId: string,
     frameId: string,
     options?: { referenceAssetIds?: string[]; duration?: number },
   ): Promise<string> {
     // 1. 读取关联 assets 的选中图片作为参考
     // 2. 创建 GenerationRun (capability: 'multimodal-to-video')
     // 3. 创建 CanvasNode + CanvasEdge
   }

   /** 选择最终 take */
   async selectFinalTake(frameId: string, runId: string): Promise<void> {
     // 更新 frame.finalTakeRunId
   }

   /** 批量生成视频 */
   async batchGenerateVideos(
     projectId: string,
     frameIds: string[],
     mode: 'i2v' | 'r2v',
   ): Promise<string[]> { ... }
 }
 ```

 **GenerationRun 映射**:
 - I2V → `capability: 'image-to-video'`, assets 包含 source_image
 - R2V → `capability: 'multimodal-to-video'`, assets 包含多个 reference images
 - `source`: `'direct-ui'` (用户手动) 或 `'agent-tool'` (AI 驱动)

### 4.5 AssemblyService (后续实现)

> 初期版本不包含 AssemblyService、FFmpeg 合成和混音。接口定义保留供将来实现。

 ```typescript
 export class AssemblyService {
   constructor(
     private readonly repo: PipelineRepository,
     private readonly runService: GenerationRunService,
     private readonly processRunner: ProcessRunner,  // 复用现有
     private readonly sse?: PipelineSsePort,
   ) {}

  /** FFmpeg 拼接视频 + 混音 */
  // (后续实现)
  async assemble(
     projectId: string,
     options: AssemblyOptions,
   ): Promise<string> {
     // 1. 读取所有 frame.finalTakeRunId
     // 2. 获取每个 run 的 video artifact localPath
     // 3. 构建 FFmpeg concat 命令
     // 4. 混音: 对白 + BGM + 音效 (按 mixSettings 增益)
     // 5. 通过 processRunner 执行 FFmpeg
     // 6. 创建 GenerationArtifact (kind: 'video') 存储最终成片
     // 7. 更新 project.status = 'assembled'
     // 8. SSE 推送
   }
 }

 export interface AssemblyOptions {
   resolution: string;
   format: string;
   bgmUrl: string | null;
   mixSettings: { dialogue: number; bgm: number; sfx: number };
   subtitles: 'burn-in' | 'none';
 }
 ```

 ### 4.6 CanvasService

 ```typescript
 export class CanvasService {
   constructor(
     private readonly repo: PipelineRepository,
     private readonly sse?: PipelineSsePort,
   ) {}

   /** 获取画布完整状态 (节点 + 边) */
   async getCanvasState(projectId: string): Promise<{
     nodes: CanvasNode[];
     edges: CanvasEdge[];
   }> { ... }

   /** 移动节点位置 */
   async moveNode(nodeId: string, x: number, y: number): Promise<void> { ... }

   /** 自动布局 (AI 创建节点时调用) */
   async autoLayout(projectId: string): Promise<void> {
     // 按节点类型分区布局:
     // script: 左上
     // character/scene/prop: 左侧纵向排列
     // storyboard: 中间横向排列 (按 index)
     // video: 分镜右侧
   }

   /** 删除节点 (同时删除关联边) */
   async deleteNode(nodeId: string): Promise<void> { ... }
 }
 ```

 ### 4.7 PipelineAgentToolProvider

 ```typescript
 export class PipelineAgentToolProvider implements AgentToolProvider {
   constructor(
     private readonly scriptService: ScriptAnalysisService,
     private readonly assetService: AssetGenerationService,
     private readonly storyboardService: StoryboardService,
     private readonly videoService: VideoGenerationService,
     private readonly assemblyService: AssemblyService,
     private readonly canvasService: CanvasService,
     private readonly repo: PipelineRepository,
   ) {}

   getTools({ sessionId, cwd }): AgentToolDefinition[] {
     return [
       this.analyzeScriptTool(),
       this.generateAssetImageTool(),
       this.extractStoryboardTool(),
       this.generateFrameImageTool(),
       this.generateVideoTool(),
       this.selectFinalTakeTool(),
       this.assembleExportTool(),
       this.getPipelineStateTool(),
     ];
   }

   private analyzeScriptTool(): AgentToolDefinition {
     return {
       name: 'pipeline_analyze_script',
       label: '剧本分析',
       description: '分析剧本文本，提取角色、场景、道具实体，在画布上创建节点',
       parameters: {
         type: 'object',
         properties: {
           projectId: { type: 'string', description: 'Pipeline 项目 ID' },
         },
         required: ['projectId'],
       },
       execute: async ({ input }) => {
         const assets = await this.scriptService.extractEntities(input.projectId);
         return {
           content: [{ type: 'text', text: `已提取 ${assets.length} 个实体` }],
           details: { assetIds: assets.map(a => a.id) },
         };
       },
     };
   }

   // ... 其他工具类似
 }
 ```

**与 AgentRuntime 集成** (选择 A 变体 — 已确认):
- `PipelineAgentToolProvider` 实现 `AgentToolProvider` 接口
- 不创建独立 Runtime，复用现有 `AgentService` 和 `AgentRuntimeRegistry`
- 在 composition 层创建 `CompositeAgentToolProvider`，把
  `GenerationAgentToolProvider` 和 `PipelineAgentToolProvider` 的工具合并返回
- Agent 在 Pipeline 模式下既有 Pipeline 工具也保留普通生成能力
- Agent 通过 `AgentToolDefinition.execute()` 调用 pipeline service
- 工具执行结果通过 `onUpdate` 回调实时推送到 SSE

 ---

 ## 5. Infrastructure 层

 ### 5.1 SqlitePipelineRepository

 位置: `src/server/infrastructure/sqlite/sqlite-pipeline-repository.ts`

 复用现有 `SqliteDatabase` 连接，新增 pipeline 表。

 ### 5.2 SQLite Migration (version 8)

 ```sql
 -- Migration 8: pipeline_tables

 CREATE TABLE pipeline_projects (
   id TEXT PRIMARY KEY,
   workspace_id TEXT NOT NULL,
   title TEXT NOT NULL,
   original_text TEXT NOT NULL,
   art_direction_json TEXT,
   model_settings_json TEXT,
   prompt_config_json TEXT,
   status TEXT NOT NULL,
   cover_artifact_id TEXT,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL
 ) STRICT;

 CREATE INDEX pipeline_projects_workspace_idx
   ON pipeline_projects(workspace_id, updated_at DESC);

 CREATE TABLE pipeline_assets (
   id TEXT PRIMARY KEY,
   project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
   type TEXT NOT NULL CHECK (type IN ('character', 'scene', 'prop')),
   name TEXT NOT NULL,
   description TEXT NOT NULL,
   attributes_json TEXT,
   selected_artifact_id TEXT,
   locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
   starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1)),
   status TEXT NOT NULL,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL
 ) STRICT;

 CREATE INDEX pipeline_assets_project_type_idx
   ON pipeline_assets(project_id, type);

 CREATE TABLE pipeline_asset_variants (
   id TEXT PRIMARY KEY,
   asset_id TEXT NOT NULL REFERENCES pipeline_assets(id) ON DELETE CASCADE,
   artifact_id TEXT,
   run_id TEXT,
   prompt TEXT NOT NULL,
   is_favorited INTEGER NOT NULL DEFAULT 0 CHECK (is_favorited IN (0, 1)),
   is_uploaded_source INTEGER NOT NULL DEFAULT 0 CHECK (is_uploaded_source IN (0, 1)),
   upload_type TEXT,
   created_at TEXT NOT NULL
 ) STRICT;

 CREATE INDEX pipeline_asset_variants_asset_idx
   ON pipeline_asset_variants(asset_id, created_at DESC);

 CREATE TABLE pipeline_frames (
   id TEXT PRIMARY KEY,
   project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
   scene_id TEXT,
   character_ids_json TEXT NOT NULL DEFAULT '[]',
   prop_ids_json TEXT NOT NULL DEFAULT '[]',
   index INTEGER NOT NULL,
   visual_description TEXT,
   dialogue_structured_json TEXT,
   camera_movement_json TEXT,
   blocking_json TEXT,
   lighting_json TEXT,
   audio_note_json TEXT,
   shot_size TEXT,
   transition_hint TEXT,
   image_prompt TEXT,
   video_prompt TEXT,
   selected_image_artifact_id TEXT,
   final_take_run_id TEXT,
   locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
   status TEXT NOT NULL,
   created_at TEXT NOT NULL,
   updated_at TEXT NOT NULL
 ) STRICT;

 CREATE INDEX pipeline_frames_project_index_idx
   ON pipeline_frames(project_id, index);

 CREATE TABLE pipeline_canvas_nodes (
   id TEXT PRIMARY KEY,
   project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
   type TEXT NOT NULL CHECK (type IN ('script', 'character', 'scene', 'prop', 'storyboard', 'video')),
   entity_id TEXT NOT NULL,
   position_x REAL NOT NULL,
   position_y REAL NOT NULL,
   created_at TEXT NOT NULL
 ) STRICT;

 CREATE INDEX pipeline_canvas_nodes_project_idx
   ON pipeline_canvas_nodes(project_id, type);

 CREATE UNIQUE INDEX pipeline_canvas_nodes_entity_unique
   ON pipeline_canvas_nodes(project_id, type, entity_id);

 CREATE TABLE pipeline_canvas_edges (
   id TEXT PRIMARY KEY,
   project_id TEXT NOT NULL REFERENCES pipeline_projects(id) ON DELETE CASCADE,
   source_node_id TEXT NOT NULL REFERENCES pipeline_canvas_nodes(id) ON DELETE CASCADE,
   target_node_id TEXT NOT NULL REFERENCES pipeline_canvas_nodes(id) ON DELETE CASCADE,
   edge_type TEXT NOT NULL CHECK (edge_type IN ('references', 'source_of', 'generates', 'derives_from'))
 ) STRICT;

 CREATE INDEX pipeline_canvas_edges_project_idx
   ON pipeline_canvas_edges(project_id);
 CREATE INDEX pipeline_canvas_edges_source_idx
   ON pipeline_canvas_edges(source_node_id);
 CREATE INDEX pipeline_canvas_edges_target_idx
   ON pipeline_canvas_edges(target_node_id);
 ```

 **设计要点**:
 - `pipeline_canvas_nodes_entity_unique`: 确保每个实体在画布上只有一个节点
 - 级联删除: 删除项目 → 删除资产/帧/画布节点/边
 - `artifact_id` 和 `run_id` 不加外键约束（它们在另一张表，跨域引用）
 - JSON 字段用 `_json` 后缀，repository 层负责序列化/反序列化

 ### 5.3 PiLlmAdapter

 位置: `src/server/infrastructure/pi/pi-llm-adapter.ts`

 ```typescript
 export class PiLlmAdapter implements LlmPort {
   constructor(
     private readonly modelRuntime: ModelRuntime,
     private readonly modelProvider: PiModelProvider,
   ) {}

   async chat(messages: LlmMessage[], options?: LlmOptions): Promise<string> {
     // 1. 获取可用模型 (options.model 或默认)
     // 2. 通过 Pi SDK 的 LLM 接口发起 chat 请求
     // 3. 如果 Pi SDK 不直接暴露 chat，则通过 AgentRuntime 发送内部命令
     // 4. 返回响应文本
   }

   async *stream(messages: LlmMessage[], options?: LlmOptions): AsyncIterable<LlmChunk> {
     // 流式版本
   }

   isConfigured(): boolean {
     // 检查 modelRuntime 是否有可用模型
   }
 }
 ```

 **关键问题**: Pi SDK 是否直接暴露 LLM chat 接口？
 - 如果是: 直接调用，`PiLlmAdapter` 很薄
 - 如果否: 需要通过 `AgentRuntime.execute()` 发送一个特殊的内部命令
   （如 `{ type: 'llm-chat', messages, options }`），由 `PiAgentRuntime` 转发
 - 需要验证 Pi SDK 的实际 API

 ---

 ## 6. Transport 层

 ### 6.1 API 端点设计

 位置: `src/app/api/pipeline/`

 ```text
 /api/pipeline/projects              POST   创建项目
 /api/pipeline/projects              GET    列出项目
 /api/pipeline/projects/[id]         GET    获取项目
 /api/pipeline/projects/[id]         PATCH  更新项目
 /api/pipeline/projects/[id]         DELETE 删除项目

 /api/pipeline/projects/[id]/analyze  POST   LLM 实体提取
 /api/pipeline/projects/[id]/styles   POST   LLM 风格分析

 /api/pipeline/projects/[id]/assets   GET    列出资产
 /api/pipeline/projects/[id]/assets   POST   创建资产
 /api/pipeline/assets/[id]           PATCH  更新资产
 /api/pipeline/assets/[id]           DELETE 删除资产
 /api/pipeline/assets/[id]/generate  POST   生成资产图
 /api/pipeline/assets/[id]/upload    POST   上传源图片
 /api/pipeline/assets/[id]/variants  GET    列出变体
 /api/pipeline/variants/[id]/select  POST   选择变体
 /api/pipeline/variants/[id]/favorite POST  收藏变体

 /api/pipeline/projects/[id]/frames  GET    列出分镜
 /api/pipeline/projects/[id]/frames  POST   创建分镜
 /api/pipeline/projects/[id]/extract-storyboard POST  LLM 分镜提取
 /api/pipeline/frames/[id]           PATCH  更新分镜
 /api/pipeline/frames/[id]           DELETE 删除分镜
 /api/pipeline/frames/[id]/polish    POST   润色 prompt
 /api/pipeline/frames/[id]/generate-image POST  生成分镜图
 /api/pipeline/frames/[id]/generate-video POST  生成视频
 /api/pipeline/frames/[id]/select-take POST  选择最终 take

 /api/pipeline/projects/[id]/canvas  GET    获取画布状态
 /api/pipeline/projects/[id]/canvas  PATCH  更新节点位置

 /api/pipeline/projects/[id]/assemble POST   合成导出

 /api/pipeline/projects/[id]/sse     GET    SSE 事件流
 ```

 ### 6.2 输入验证

 位置: `src/server/transport/http/pipeline-validators.ts`

 复用现有 `validators.ts` 模式，使用 Zod schema 验证输入。

 ### 6.3 SSE 端点

 ```typescript
 // src/app/api/pipeline/projects/[id]/sse/route.ts
 export async function GET(req: Request, { params }) {
   const projectId = params.id;
   return sseStream(req, (send) => {
     const unsubscribe = pipelineSse.subscribe(projectId, (event) => {
       send({ event: event.type, data: JSON.stringify(event.payload) });
     });
     // heartbeat + cleanup
     return unsubscribe;
   });
 }
 ```

 复用现有 `sse-stream.ts` 的 heartbeat/cleanup 机制。

 ---

 ## 7. Composition 层

在 `container.ts` 中新增 pipeline 服务组装:

```typescript
function getPipelineServices() {
  const database = getDatabase(); // 复用现有 SqliteDatabase
  const pipelineRepo = new SqlitePipelineRepository(database);
  const llmPort = new PiLlmAdapter(modelRuntime, models);
  const pipelineSse = new InMemoryPipelineSse();

  const scriptService = new ScriptAnalysisService(llmPort, pipelineRepo, pipelineSse);
  const assetService = new AssetGenerationService(pipelineRepo, getGenerationRunService(), pipelineSse);
  const storyboardService = new StoryboardService(llmPort, pipelineRepo, getGenerationRunService(), pipelineSse);
  const videoService = new VideoGenerationService(pipelineRepo, getGenerationRunService(), pipelineSse);
  const assemblyService = new AssemblyService(pipelineRepo, getGenerationRunService(), processes, pipelineSse);
  const canvasService = new CanvasService(pipelineRepo, pipelineSse);

  const pipelineAgentTools = new PipelineAgentToolProvider(
    scriptService, assetService, storyboardService,
    videoService, assemblyService, canvasService, pipelineRepo,
  );

  // 方案 A — Worker 完成回调: 回填 pipeline variant artifactId
  getGenerationExecutionService().onComplete(async (runId, artifacts) => {
    const run = await getGenerationRunService().getRun(runId);
    if (!run?.sourceRef?.startsWith('pipeline:')) return;
    // 回填 AssetVariant.artifactId
    await pipelineRepo.updateVariantByRunId(runId, { artifactId: artifacts[0]?.id });
    pipelineSse.emit({ type: 'generation_completed', projectId: run.sessionId, payload: { runId, artifacts } });
  });

  // 选择 A 变体 — 合并工具: Pipeline + 现有生成工具
  const compositeAgentTools = new CompositeAgentToolProvider(
    generationAgentTools,   // 现有 GenerationAgentToolProvider
    pipelineAgentTools,     // PipelineAgentToolProvider
  );

  return { scriptService, assetService, storyboardService, videoService,
           assemblyService, canvasService, pipelineAgentTools, compositeAgentTools, pipelineRepo };
}
```

 **关键复用**:
 - `SqliteDatabase`: 同一个数据库文件，新增 pipeline 表
 - `GenerationRunService`: 资产图/分镜图/视频都通过它创建 Run
 - `GenerationWorker`: 同一个 Worker 处理所有 Generation Job
 - `ModelRuntime` / `PiModelProvider`: 复用模型配置
 - `ProcessRunner`: FFmpeg 合成

 ---

 ## 8. GenerationRun 复用映射

 | Pipeline 操作 | GenerationCapability | source | assets |
 |---|---|---|---|
 | 资产图生成 (T2I) | `text-to-image` | `direct-ui` | 无 |
 | 分镜图生成 (I2I) | `image-to-image` | `direct-ui` | reference images |
 | 视频生成 (I2V) | `image-to-video` | `direct-ui`/`agent-tool` | source_image |
 | 视频生成 (R2V) | `multimodal-to-video` | `direct-ui`/`agent-tool` | reference images |
 | 合成导出 | 不创建 Run | — | 直接通过 ProcessRunner 执行 FFmpeg |

 **GenerationSession 关联**:
 - 每个 PipelineProject 关联一个 `GenerationSession` (origin: `'direct-generation'`)
 - 该 Session 的 `cwd` = project 的 workspaceId
 - 所有 pipeline 生成的 Run 都挂在这个 Session 下
 - 前端通过 `/api/generation/runs?sessionId=xxx` 查询 Run 状态

**Worker 完成回调** (方案 A — 已确认):
- `GenerationExecutionService` 构造函数新增可选的
  `onComplete?: (runId: string, artifacts: GenerationArtifact[]) => void`
- 在 `complete()` 方法末尾 `updateRun` 成功后调用回调
- 回调用 try-catch 包住，回调失败不影响 Run 完成流程
- Pipeline 服务在 composition 层注册回调:
  1. 检查 `run.sourceRef` 是否以 `pipeline:` 开头
  2. 如果是，回填对应 `AssetVariant.artifactId`
  3. 通过 `PipelineSsePort` 推送 `generation_completed` 事件

 ---

 ## 9. 前端 Contracts

 位置: `src/contracts/pipeline.ts`

 定义前后端共享的 HTTP 请求/响应/SSE 事件类型:

 ```typescript
 // 请求类型
 export interface CreateProjectRequest {
   title: string;
   originalText: string;
   workspaceId: string;
 }

 // 响应类型
 export interface ProjectListResponse {
   projects: PipelineProjectSummary[];
 }

 export interface PipelineProjectSummary {
   id: string;
   title: string;
   status: PipelineProjectStatus;
   stageProgress: PipelineStageStatus[];
   frameCount: number;
   videoCount: number;
   coverUrl: string | null;
   updatedAt: string;
 }

 // SSE 事件
 export type PipelineSseEventType =
   | 'node_created' | 'node_updated' | 'node_deleted'
   | 'edge_created' | 'edge_deleted'
   | 'asset_updated' | 'frame_updated'
   | 'generation_progress' | 'generation_completed' | 'generation_failed'
   | 'agent_message' | 'agent_thinking' | 'agent_tool_call';
 ```

 ---

## 10. 待验证问题

1. ~~**Pi SDK LLM 接口**~~: 已验证。`ModelRuntime.completeSimple()` 可直接
   用于 LLM 调用，不需要通过 AgentRuntime。`PiLlmAdapter` 实现方案已确认。

2. ~~**GenerationRoute 配置**~~: 已验证。现有 RunningHub 路由已覆盖:
  - text-to-image (Seedream v5 Pro) → 资产图生成
  - image-to-image (Seedream v5 Pro) → 分镜图生成
  - image-to-video (Seedance 2.0/2.5) → I2V 视频生成
  - multimodal-to-video (Seedance 2.0/2.5) → R2V 视频生成

3. ~~**FFmpeg 可用性**~~: 合成导出和混音为后续实现，初期不涉及 FFmpeg。
  本机已安装 ffmpeg 8.1.2，将来实现时可用 ProcessRunner 调用。

4. ~~**GenerationWorker 回调**~~: 已确认方案 A（回调）。
   在 `GenerationExecutionService` 构造函数新增可选的
   `onComplete?: (runId: string, artifacts: GenerationArtifact[]) => void` 参数。
   在 `complete()` 方法末尾 `updateRun` 成功后调用回调。
   回调用 try-catch 包住，回调失败不影响 Run 完成流程。
   Pipeline 服务在 composition 层注册回调，检查 `run.sourceRef` 是否以
   `pipeline:` 开头，如果是则回填对应 `AssetVariant.artifactId` 并通过
   `PipelineSsePort` 推送 `generation_completed` 事件。

5. ~~**AgentRuntime 集成**~~: 已确认选择 A 变体（合并工具）。
   不创建独立 Runtime。在 composition 层创建 `CompositeAgentToolProvider`，
   把 `GenerationAgentToolProvider` 和 `PipelineAgentToolProvider` 的工具
   合并返回。Agent 在 Pipeline 模式下既有 Pipeline 工具也保留普通生成能力。
   复用现有 `AgentService` 和 `AgentRuntimeRegistry`，不需要新的 Runtime
   生命周期管理。

6. ~~**实时通信方案**~~: 已确认不引入 WebSocket。
   Pipeline 工作台所有实时通信使用 SSE，复用现有 `createSseResponse`。
   所有通信场景（Agent 回复流式输出、工具执行进度、Worker 状态变化、
   画布节点变更通知）都是服务端→客户端单向推送，SSE 天然适用。
   用户指令（创建项目、生成图片、移动节点等）用普通 HTTP POST/PATCH。
   不引入 WebSocket 依赖，与现有架构一致。
