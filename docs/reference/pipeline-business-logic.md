 # Pipeline 工作台 — 业务逻辑设计

 > 分支: `feature/pipeline-workbench`
 > 依赖: pipeline-tech-architecture.md, pipeline-workbench-design.md
 > 参考: LumenX llm.py/prompt_assembly.py, Toonflow agents/

 ---

 ## 0. 设计 Review — 与用户期望的对齐

 在进入细节前，先确认这份文档要回答的核心问题：

 1. **AI 驱动**: 用户用自然语言描述意图，Agent 决定执行什么操作，工具直接
    在画布上创建/修改节点。不是用户手动点按钮触发每一步。
 2. **无限画布可视化**: 所有 pipeline 实体都是画布节点，AI 操作的结果实时
    反映在画布上。阶段是画布过滤器，不是独立屏幕。
 3. **完整 pipeline**: 剧本→资产→分镜→视频→合成，每个阶段有完整业务逻辑。
 4. **独立产品**: Pipeline 工作台有自己的设计理念，不是聊天工作区的附加。

 这份文档需要回答：
 - 每个阶段的 LLM Prompt 怎么写？结构化输出 schema 是什么？
 - Prompt 拼装纯函数怎么实现？
 - 资产变体池的完整生命周期？
 - 抽卡机制的数据模型？
 - AI 工具的执行编排（串行/并行/失败处理）？
 - 画布节点的自动创建规则？
 - Worker 完成后如何回填 pipeline 状态？

 ---

 ## 1. LLM 调用基础

 ### 1.1 PiLlmAdapter 实现方案 (已验证)

 `ModelRuntime` 暴露了 `completeSimple()` 和 `streamSimple()` 方法，
 可以直接用于 LLM 调用，不需要通过 AgentSession：

 ```typescript
 export class PiLlmAdapter implements LlmPort {
   constructor(private modelRuntime: ModelRuntime) {}

   async chat(messages: LlmMessage[], options?: LlmOptions): Promise<string> {
     const model = this.resolveModel(options?.model);
     const context: Context = {
       systemPrompt: messages.find(m => m.role === 'system')?.content,
       messages: messages.filter(m => m.role !== 'system').map(m => ({
         role: m.role,
         content: [{ type: 'text', text: m.content }],
       })),
     };
     const result = await this.modelRuntime.completeSimple(model, context, {
       maxTokens: options?.maxTokens,
       temperature: options?.temperature,
     });
     return result.content
       .filter(b => b.type === 'text')
       .map(b => (b as TextContent).text)
       .join('');
   }

   private resolveModel(modelId?: string): Model<Api> {
     if (modelId) {
       const [provider, id] = modelId.split(':');
       const model = this.modelRuntime.getModel(provider, id);
       if (model) return model;
     }
     const available = this.modelRuntime.getAvailableSnapshot();
     if (available.length === 0) throw new Error('No LLM model available');
     return available[0];
   }
 }
 ```

 ### 1.2 JSON 结构化输出

 实体提取和分镜提取需要结构化 JSON 输出。推荐方案：
 Prompt 约束 + 解析修复（兼容所有模型）。

 - system prompt 中明确要求输出 JSON 格式
 - 提供 JSON schema 示例
 - 解析时容错：去除 markdown 代码块标记、修复常见 JSON 错误

 ```typescript
 function parseEntityJson(raw: string): EntityExtractionResult {
   let cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
   const firstBrace = cleaned.indexOf('{');
   const lastBrace = cleaned.lastIndexOf('}');
   if (firstBrace >= 0 && lastBrace > firstBrace) {
     cleaned = cleaned.slice(firstBrace, lastBrace + 1);
   }
   try {
     return JSON.parse(cleaned);
   } catch {
     cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
     cleaned = cleaned.replace(/'/g, '"');
     return JSON.parse(cleaned);
   }
 }
 ```

 ---

 ## 2. 剧本分析阶段

 ### 2.1 实体提取 (Prompt A)

 触发方式: AI 工具 `pipeline_analyze_script` 或用户在检查器点击"提取实体"

 System Prompt 要点:
 - 分析剧本文本，提取角色/场景/道具实体
 - 严格输出 JSON，不加 markdown 标记
 - 输出 schema 包含 characters/scenes/props 三个数组
 - 每个实体有 name + description + 类型特定属性
 - description 要包含足够视觉信息，能直接用于 AI 图像生成
 - 同一角色不同年龄段视为不同实体

 输出 schema:
 ```json
 {
   "characters": [
     { "name": "角色名", "description": "外貌和性格", "age": "", "gender": "", "clothing": "", "visualWeight": 3, "persona": "" }
   ],
   "scenes": [
     { "name": "场景名", "description": "环境视觉", "timeOfDay": "", "lightingMood": "" }
   ],
   "props": [
     { "name": "道具名", "description": "道具视觉" }
   ]
 }
 ```

 执行流程:
 1. 读取 `project.originalText`
 2. 如果文本过长（> 8000 字），分段提取后合并去重
 3. 调用 `llm.chat()` with system prompt + originalText
 4. 解析 JSON 输出（容错处理）
 5. 为每个实体创建 `PipelineAsset` 记录
 6. 为每个资产创建 `CanvasNode`（自动布局）
 7. SSE 推送 `node_created` 事件
 8. 更新 `project.status = 'assets_ready'`
 9. 返回创建的资产列表

 长文本处理:
 - 超过 8000 字时按段落分块
 - 每块单独提取实体
 - 合并结果：同名实体取描述更详细的版本
 - 避免一次性喂入过长文本导致 LLM 输出截断

 ### 2.2 风格分析

 System Prompt 要点:
 - 分析剧本，推荐适合的视觉风格
 - 输出 JSON 包含 recommendations 数组
 - 风格维度: 画幅/色调/笔触/光影

 ### 2.3 画风预设系统

 内置画风预设存储在 `src/server/infrastructure/pipeline/style-presets.json`，
 参考 LumenX 的 `style_presets.json`。每个预设包含 id/name/config/promptSuffix。
 画风配置注入所有资产生成的 prompt 末尾。

 ---

 ## 3. 资产生成阶段

 ### 3.1 Prompt 拼装

 资产图生成的 prompt 由多部分拼装:

 ```typescript
 function assembleAssetPrompt(asset: PipelineAsset, project: PipelineProject): string {
   const parts: string[] = [];
   // 1. 核心描述
   parts.push(asset.description);
   // 2. 角色属性补充 (age/gender/clothing)
   // 3. 场景属性补充 (timeOfDay/lightingMood)
   // 4. 画风后缀 (stylePreset.promptSuffix)
   // 5. 自定义风格 prompt
   return parts.join(', ');
 }
 ```

 ### 3.2 变体池生命周期

 ```text
 创建变体:
   generateAssetImage() → 创建 AssetVariant (artifactId=null, runId=新Run)
                         → Worker 处理 Run
                         → Run 完成 → 回填 artifactId
                         → SSE 推送 generation_completed
                         → 节点更新预览图

 上传变体:
   uploadAssetImage()   → 创建 AssetVariant (isUploadedSource=true)
                         → 直接有 artifactId

 选择变体:
   selectVariant()      → 更新 asset.selectedArtifactId
                         → SSE 推送 asset_updated

 收藏变体:
   toggleFavorite()     → 更新 variant.isFavorited
                         → 收藏的变体不会被自动清理

 自动清理:
   当变体数 > MAX_VARIANTS (10)
   → 删除非收藏、非上传、非选中的最旧变体
   → 同时删除关联的 GenerationArtifact 文件
 ```

 MAX_VARIANTS_PER_ASSET = 10。超限时自动删除最旧的非收藏变体。
 选中的变体和上传的源文件不被删除。

 ### 3.3 GenerationRun 创建映射

 ```typescript
 const run = await runService.createRun({
   sessionId: pipelineSession.id,
   capability: 'text-to-image',
   prompt: assembledPrompt,
   source: 'direct-ui',              // 或 'agent-tool'
   sourceRef: `pipeline:asset:${asset.id}`,
   idempotencyKey: `pipeline:asset:${asset.id}:${Date.now()}`,
   parameters: {
     aspectRatio: resolveAspectRatio(asset.type, project.modelSettings),
     model: project.modelSettings?.t2iModel,
   },
 });
 ```

### 3.4 Worker 完成回填 (方案 A — 已确认)

 问题: GenerationWorker 完成 Job 后创建 GenerationArtifact，
 但 Pipeline 服务需要知道完成了才能回填 AssetVariant.artifactId。

方案 A (已确认): 在 GenerationExecutionService 构造函数新增可选的
`onComplete` 回调参数，在 `complete()` 方法末尾调用:

 ```typescript
// GenerationExecutionService 构造函数新增:
// onComplete?: (runId: string, artifacts: GenerationArtifact[]) => void

// complete() 方法末尾 updateRun 成功后:
// try { this.onComplete?.(run.id, artifacts); } catch { /* 不影响 Run 完成 */ }

// composition 层注册回调:
executionService.onComplete = async (runId, artifacts) => {
  const run = await runService.getRun(runId);
  if (!run?.sourceRef?.startsWith('pipeline:')) return;
  // 1. 回填 AssetVariant.artifactId
  await pipelineRepo.updateVariantByRunId(runId, { artifactId: artifacts[0]?.id });
  // 2. SSE 推送 generation_completed
  pipelineSse.emit({ type: 'generation_completed', projectId: run.sessionId, payload: { runId, artifacts } });
};
 ```

 ---

 ## 4. 分镜生成阶段

 ### 4.1 分镜提取 (Prompt B)

 触发方式: AI 工具 `pipeline_extract_storyboard` 或用户手动触发

 System Prompt 要点:
 - 将剧本片段转化为结构化分镜帧
 - 输出 JSON 包含 frames 数组
 - 每个帧有 visualDescription/dialogue/cameraMovement/blocking/lighting/audioNote/shotSize
 - characterRefs/sceneRef/propRefs 中的名称必须与已提取的实体名称匹配
 - 一个分镜帧的时长建议 3-8 秒

 输出 schema:
 ```json
 {
   "frames": [
     {
       "visualDescription": "画面描述",
       "dialogue": { "speaker": "", "line": "", "emotion": "", "delivery": "" },
       "cameraMovement": { "primary": "push_in", "secondary": "", "speed": "normal", "description": "" },
       "blocking": { "description": "站位", "stage": [], "cameraRelation": "" },
       "lighting": { "direction": "", "quality": "", "colorTemp": "", "description": "" },
       "audioNote": { "sfx": "", "ambience": "", "bgmNote": "" },
       "shotSize": "中景",
       "transitionHint": "",
       "characterRefs": ["角色名"],
       "sceneRef": "场景名",
       "propRefs": ["道具名"]
     }
   ]
 }
 ```

 执行流程:
 1. 读取 originalText + 已有 assets
 2. 构建 system prompt + 上下文 (实体列表)
 3. 调用 LLM 提取分镜帧
 4. 解析 JSON
 5. 为每个帧创建 StoryboardFrame 记录
 6. 通过 characterRefs/sceneRef/propRefs 解析为 characterIds/sceneId/propIds
 7. 为每个帧创建 CanvasNode (storyboard 类型，自动布局)
 8. 自动创建 CanvasEdge (references 类型，连接分镜→角色/场景/道具)
 9. SSE 推送 node_created + edge_created
 10. 更新 project.status = 'storyboard_ready'

 实体引用解析:
 ```typescript
 function resolveEntityRefs(
   frame: ExtractedFrame,
   assets: PipelineAsset[],
 ): { characterIds: string[]; sceneId: string | null; propIds: string[] } {
   const findByName = (name: string) =>
     assets.find(a => a.name === name || a.name.includes(name));
   return {
     characterIds: (frame.characterRefs || [])
       .map(findByName).filter(Boolean).map(a => a!.id),
     sceneId: frame.sceneRef ? findByName(frame.sceneRef)?.id ?? null : null,
     propIds: (frame.propRefs || [])
       .map(findByName).filter(Boolean).map(a => a!.id),
   };
 }
 ```

 ### 4.2 Prompt 拼装纯函数

 参考 LumenX prompt_assembly.py 的 assemble_prompt，TS 版本:

 ```typescript
 // src/server/application/pipeline/prompt-assembly.ts
 // 纯函数，无副作用，可独立测试

 export function assembleFramePrompt(
   frame: StoryboardFrame,
   characters: PipelineAsset[],
   scenes: PipelineAsset[],
   stylePreset?: StylePreset,
 ): string {
   const parts: string[] = [];
   // 1. 视觉描述 (核心叙事)
   if (frame.visualDescription) parts.push(frame.visualDescription);
   // 2. 光影补充
   if (frame.lighting?.description) {
     if (!frame.visualDescription?.includes(frame.lighting.description)) {
       parts.push(frame.lighting.description);
     }
   }
   // 3. 运镜
   if (frame.cameraMovement) {
     const cm = frame.cameraMovement;
     const movementText = cm.description || movementTypeToText(cm.primary, cm.secondary, cm.speed);
     parts.push(movementText);
   }
   // 4. 景别
   const joined = parts.join(' ');
   if (frame.shotSize && !joined.includes(frame.shotSize)) parts.push(frame.shotSize);
   // 5. 角色外观关键词
   const charDesc = getCharacterAppearanceKeywords(frame.characterIds, characters);
   if (charDesc) parts.push(`角色：${charDesc}`);
   // 6. 场景描述
   if (frame.sceneId) {
     const scene = scenes.find(s => s.id === frame.sceneId);
     if (scene) parts.push(`场景：${scene.name}，${scene.description}`);
   }
   // 7. 画风后缀
   if (stylePreset?.promptSuffix) parts.push(stylePreset.promptSuffix);
   if (parts.length === 0) return '';
   return parts.map(p => p.replace(/[。，.]$/, '')).join('。') + '。';
 }
 ```

 运镜类型映射:
 static→固定机位, push_in→推镜头, pull_out→拉镜头,
 pan_left→左摇, pan_right→右摇, tilt_up→上摇, tilt_down→下摇,
 orbit→环绕, follow→跟随, crane_up→升镜, crane_down→降镜,
 handheld→手持, zoom_in→变焦推, zoom_out→变焦拉

 ### 4.3 Prompt 润色 (LLM 驱动)

 Prompt C (分镜图润色): 润色分镜描述为高质量图像生成 prompt，补充光影/材质/构图细节

 Prompt D (I2V 视频 prompt 润色): 描述动态运动而非静态画面，包含角色动作/表情变化/镜头运动，有对白时描述嘴部动作

 Prompt E (R2V 视频 prompt 润色): 描述角色在场景中的动态表演，保持与参考图的角色一致性

 每个润色 prompt 都支持用户自定义覆盖 (PipelinePromptConfig)。

 ### 4.4 分镜图生成 (I2I)

 执行流程:
 1. 拼装 prompt (assembleFramePrompt 纯函数)
 2. 可选 LLM 润色 (Prompt C)
 3. 收集参考图 (关联角色的选中变体 artifact)
 4. 创建 GenerationRun (capability: image-to-image)
    - assets: [{ slot: 'reference', artifactId }]
 5. Worker 处理，完成后更新 frame.selectedImageArtifactId

 ---

 ## 5. 视频生成阶段

 ### 5.1 I2V 生成

 流程:
 1. 读取 frame.selectedImageArtifactId (分镜图)
 2. 拼装视频 prompt (frame.videoPrompt 或 frame.imagePrompt)
 3. 可选 LLM 润色 (Prompt D)
 4. 创建 GenerationRun (capability: image-to-video)
    - assets: [{ slot: 'source_image', artifactId }]
 5. 创建 CanvasNode (video 类型) + CanvasEdge (source_of)
 6. Worker 完成后创建 video artifact → SSE → VideoNode 更新预览

 ### 5.2 R2V 生成

 流程:
 1. 读取关联角色的选中参考图
 2. 拼装视频 prompt
 3. 可选 LLM 润色 (Prompt E)
 4. 创建 GenerationRun (capability: multimodal-to-video)
    - assets: 角色参考图作为 reference images
 5. 创建 CanvasNode + CanvasEdge

 ### 5.3 抽卡机制

 一个分镜帧可以生成多个视频 take:

 ```text
 StoryboardFrame
   ├── finalTakeRunId: string | null     ← 最终选定的 Run
   └── 关联的 GenerationRun 列表 (通过 sourceRef 查询):
       ├── Run 1 (completed) → VideoNode 1
       ├── Run 2 (completed) → VideoNode 2  (starred)
       └── Run 3 (processing) → VideoNode 3
 ```

 数据查询:
 - 通过 runService.listRunsBySession(sessionId) 获取所有 Run
 - 过滤 sourceRef 以 `pipeline:frame:{frameId}:` 开头的 Run
 - 每个 Run 对应一个 VideoNode (通过 findCanvasNodeByEntity 查找)

 最终选择:
 - selectFinalTake(frameId, runId) → 更新 frame.finalTakeRunId
 - 合成阶段只使用 finalTakeRunId 指定的视频

 ### 5.4 批量生成

 串行创建 Run（避免并发过高），Worker 并行处理。
 参考 Toonflow 的 createSocketQueue(800ms) 限流策略。

 ---

## 6. 合成导出阶段

> 本阶段为后续实现。初期版本不包含 FFmpeg 合成、混音和 TTS 配音。
> 以下设计保留供将来实现时参考。

### 6.1 FFmpeg 合成流程 (后续实现)

1. 读取所有 frame (按 index 排序)
2. 获取每个 frame.finalTakeRunId 对应的 video artifact localPath
   - 如果某个 frame 没有 finalTakeRunId，跳过或报错
3. 构建 FFmpeg concat 文件
4. 执行 FFmpeg concat: `ffmpeg -f concat -safe 0 -i concat.txt -c copy output.mp4`
5. 可选混音: 对白 + BGM + 音效，按增益混合 (后续)
6. 可选烧录字幕 (后续)
7. 创建 GenerationArtifact (kind: video) 存储最终成片
8. 更新 project.status = 'assembled'
9. SSE 推送

### 6.2 混音命令 (后续实现)

```bash
ffmpeg -i video.mp4 -i dialogue.wav -i bgm.mp3 \
  -filter_complex "[1:a]volume=1.0[dlg];[2:a]volume=0.35[bgm];\
  [0:a][dlg][bgm]amix=inputs=2:duration=first[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac output.mp4
```

### 6.3 ProcessRunner 集成 (后续实现)

复用现有 NodeProcessRunner 执行 FFmpeg 命令。

### 6.4 TTS 配音 (后续实现)

TTS 是可选的后续功能。初期版本只拼接视频。
后续接入时为每个有对白的分镜帧生成 TTS 音频，
dialogue_text_hash 检测对白变更标记 STALE。

 ---

 ## 7. AI 工具执行编排

 ### 7.1 工具依赖关系

 ```text
 analyze_script (剧本分析)
     │
     ├── generate_asset_image ← 依赖 analyze_script 的实体
     │
     ├── extract_storyboard ← 依赖 analyze_script 的实体
     │   │
     │   ├── generate_frame_image ← 依赖 extract_storyboard + generate_asset_image
     │   │
     │   └── generate_video ← 依赖 generate_frame_image
    │       │
    │       └── select_final_take
    │
    └── assemble_and_export ← 后续实现，依赖所有 frame 有 finalTakeRunId
```

 ### 7.2 阶段守卫

 每个工具执行前检查前置条件。但阶段不是强线性的——
 用户可以跳过某些阶段（比如 freeform 模式不经过剧本分析直接创建资产）。
 守卫只检查必要的前置条件，不强制线性流程。

 ### 7.3 失败处理

 - LLM 调用失败 → 抛出 PIPELINE_LLM_FAILED，Agent 回复错误信息
 - GenerationRun 创建失败 → 抛出错误，Agent 回复
 - Worker 处理失败 → Run 状态变为 failed，SSE 推送 generation_failed
   → 节点显示失败状态 → 用户可重试
- FFmpeg 失败 → 后续实现，抛出错误，Agent 回复

 工具执行失败不回滚已创建的节点（用户可以看到部分结果）。
 Agent 根据错误信息决定重试或换方案。

 ---

 ## 8. 画布自动布局

 当 AI 创建新节点时，使用分区布局:

 - script: 左上角 (0, 0)
 - character: 左侧区域 (0, 250)，纵向排列，间距 220px
 - scene: 左中区域 (220, 250)
 - prop: 左右区域 (500, 250)
 - storyboard: 中间区域 (700, 0)，横向排列，间距 340px
 - video: 右侧区域 (1100, 0)，横向排列，间距 220px

 每种类型的节点超过 3 个时换行。
 用户可随时手动拖拽调整位置，位置持久化。

 ---

 ## 9. 阶段状态计算

 ```typescript
 async getStageStatuses(projectId: string): Promise<PipelineStageStatus[]> {
   // Script: originalText 非空 → ready, 否则 idle
   // Assets: 全部 completed → ready, 部分 → warn, 无 → idle
   // Storyboard: 全部 completed → ready, 部分 → warn, 无 → idle
   // Video: 全部有 finalTakeRunId → ready, 部分 → warn, 无 → idle, 无分镜 → gated
   // Assembly: 已合成/导出 → ready, 视频就绪 → idle, 否则 gated
 }
 ```

 每个 stage 的 statusLabel 包含进度信息，如 "3/5 已完成"。

 ---

 ## 10. 数据一致性维护

 ### 10.1 实体删除时的画布清理

 删除 PipelineAsset 时:
 1. 删除所有关联的 AssetVariant
 2. 删除关联的 CanvasNode
 3. 删除关联的 CanvasEdge (source 或 target)
 4. 从所有 StoryboardFrame 的 characterIds/propIds 中移除该 ID
 5. 如果被某个 frame 的 sceneId 引用，清空 sceneId

 删除 StoryboardFrame 时:
 1. 删除关联的 CanvasNode
 2. 删除关联的 CanvasEdge
 3. 不删除关联的 GenerationRun (Run 是独立的)

 ### 10.2 画布节点唯一性

 pipeline_canvas_nodes 有唯一索引 (project_id, type, entity_id)。
 AI 工具创建实体后先 findCanvasNodeByEntity 检查是否已有节点，
 有则更新位置，没有则创建新节点。

 ### 10.3 边的自动创建

 分镜提取时自动创建 references 边:
 - StoryboardNode → CharacterNode (frame.characterIds 中的每个角色)
 - StoryboardNode → SceneNode (frame.sceneId)
 - StoryboardNode → PropNode (frame.propIds)

 视频生成时自动创建 source_of 边:
 - VideoNode → StoryboardNode

 资产生成视频时自动创建 generates 边:
 - CharacterNode/SceneNode → VideoNode
