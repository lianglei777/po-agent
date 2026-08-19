 # Toonflow 业务逻辑文档

 > 参考项目路径: `C:\Users\weilianglei\Desktop\Toonflow-app-master`
 > 核心文件: `src/agents/`, `src/routes/production/`, `src/socket/`

 ## 1. 完整生产工作流

 Toonflow 围绕 "策划 → 编剧 → 分镜 → 出片" 构建闭环：

 ```text
 小说导入 ──→ 章节事件提取 ──→ 剧本 Agent ──→ 生产 Agent ──→ 视频导出
  (Novel)     (Event Graph)     (ScriptAgent)  (ProductionAgent)   (Workbench)
     │            │                  │                │                │
     │            ▼                  ▼                ▼                ▼
     │      o_novel.event      故事骨架         衍生资产           视频轨道
     │      章节事件图谱        改编策略         分镜面板           FFmpeg 拼接
     │                           结构化剧本        分镜表             最终成片
     └──→ o_novel.chapterData
 ```

 ## 2. 阶段详解

 ### 2.1 小说导入与事件图谱

 **入口**: `routes/novel/addNovel`, `routes/novel/event/generateEvents`

 **流程**:
 1. 用户导入小说文本，按章节存储到 `o_novel` 表
 2. `chapterData` 存储章节原文，`chapterIndex` 记录章节编号
 3. AI 自动提取章节事件 (`generateEvents`)，结构化存储到 `o_novel.event`
 4. `eventState` 记录事件提取状态
 5. 剧本改编时按事件图谱精准调用上下文，减少长文本信息丢失

 **事件图谱的价值**:
 - 避免将整本小说一次性喂给 LLM (上下文窗口限制)
 - 按章节事件精准检索相关上下文
 - 支持跨章节的情节连续性

 ### 2.2 剧本 Agent 阶段 (ScriptAgent)

 **入口**: Socket.IO `/api/socket/scriptAgent` → `runDecisionAI()`

 **三层 Agent 协作**:

 ```text
 用户消息
     │
     ▼
 ┌─────────────────────────────────────────┐
 │ 决策层 (script_agent_decision.md)         │
 │                                          │
 │ 输入:                                     │
 │  · 用户消息                               │
 │  · 记忆 (RAG + 摘要 + 短期对话)            │
 │  · 项目信息 (小说名/类型/简介/画风/画幅)    │
 │  · 章节数量                               │
 │                                          │
 │ 工具:                                     │
 │  · get_novel_events (获取章节事件)         │
 │  · get_novel_text (获取章节原文)           │
 │  · get_planData (获取工作区数据)           │
 │  · get_script_content (获取剧本内容)       │
 │  · deepRetrieve (深度记忆检索)            │
 │  · run_sub_agent_storySkeleton            │
 │  · run_sub_agent_adaptationStrategy       │
 │  · run_sub_agent_script                   │
 │  · run_supervision_agent                  │
 └─────────────────────────────────────────┘
     │
     ├──→ 故事骨架 (storySkeleton)
     │    Skill: script_execution_skeleton.md
     │    输出: <storySkeleton>XML</storySkeleton>
     │    存入: o_agentWorkData.data.storySkeleton
     │
     ├──→ 改编策略 (adaptationStrategy)
     │    Skill: script_execution_adaptation.md
     │    输出: <adaptationStrategy>XML</adaptationStrategy>
     │    存入: o_agentWorkData.data.adaptationStrategy
     │
     ├──→ 结构化剧本 (script)
     │    Skill: script_execution_script.md
     │    输出: <scriptItem name="剧本名">剧本内容</scriptItem>
     │    存入: o_script 表 + o_agentWorkData.data.script
     │
     └──→ 监督审阅 (supervision)
          Skill: script_agent_supervision.md
          独立分析剧本质量，返回修订建议
 ```

 **剧本 Agent 工具** (`scriptAgent/tools.ts`):

 | 工具 | 说明 |
 |---|---|
 | `get_novel_events` | 按 chapterIndexs 查询章节事件 |
 | `get_novel_text` | 获取章节原始文本 |
 | `get_planData` | 获取工作区数据 (storySkeleton/adaptationStrategy/script) |
 | `get_script_content` | 按 ID 获取剧本内容 |

 **计划数据持久化** (`routes/scriptAgent/`):
 - `getPlanData`: 读取 o_agentWorkData 中的 planData
 - `setPlanData`: 写入 planData
 - `updateData`: 更新工作区数据

 ### 2.3 生产 Agent 阶段 (ProductionAgent)

 **入口**: Socket.IO `/api/socket/productionAgent` → `runDecisionAI()`

 **三层 Agent 协作**:

 ```text
 用户消息
     │
     ▼
 ┌─────────────────────────────────────────────┐
 │ 决策层 (production_agent_decision.md)         │
 │                                              │
 │ 输入:                                         │
 │  · 用户消息                                   │
 │  · 记忆 (RAG + 摘要 + 短期对话)                │
 │  · 项目信息 (图像模型/视频模型/多参/画风)       │
 │                                              │
 │ 工具:                                         │
 │  · get_flowData (获取工作区数据)               │
 │  · add_deriveAsset (新增/更新衍生资产)          │
 │  · del_deriveAsset (删除衍生资产)              │
 │  · generate_deriveAsset (生成衍生资产图片)      │
 │  · generate_storyboard (生成分镜图片)          │
 │  · add_flowData_storyboard (新增分镜面板)      │
 │  · deepRetrieve (深度记忆检索)                │
 │  · run_sub_agent_derive_assets               │
 │  · run_sub_agent_generate_assets             │
 │  · run_sub_agent_director_plan               │
 │  · run_sub_agent_storyboard_gen              │
 │  · run_sub_agent_storyboard_panel             │
 │  · run_sub_agent_storyboard_table             │
 │  · run_sub_agent_supervision                 │
 └─────────────────────────────────────────────┘
     │
     ├──→ 衍生资产分析 (derive_assets)
     │    Skill: production_execution_derive_assets.md
     │    分析剧本，提取角色/场景/道具衍生资产
     │    通过 add_deriveAsset 工具写入工作区
     │
     ├──→ 衍生资产生成 (generate_assets)
     │    Skill: production_execution_generate_assets.md
     │    通过 generate_deriveAsset 工具生成图片
     │
     ├──→ 拍摄计划 (director_plan)
     │    Skill: production_execution_director_plan.md
     │    输出: <scriptPlan>内容</scriptPlan>
     │    存入: FlowData.scriptPlan
     │
     ├──→ 分镜图生成 (storyboard_gen)
     │    Skill: production_execution_storyboard_gen.md
     │    通过 generate_storyboard 工具生成分镜图片
     │
     ├──→ 分镜面板写入 (storyboard_panel)
     │    Skill: production_execution_storyboard_panel.md
     │    输出: <storyboardItem videoDesc='...' prompt='...' track='...'
     │           shouldGenerateImage='...' duration='...'
     │           associateAssetsIds='[...]'></storyboardItem>
     │    通过 add_flowData_storyboard 工具写入工作区
     │
     ├──→ 分镜表构建 (storyboard_table)
     │    Skill: production_execution_storyboard_table.md
     │    输出: <storyboardTable>内容</storyboardTable>
     │    存入: FlowData.storyboardTable
     │
     └──→ 监督审阅 (supervision)
          Skill: production_agent_supervision.md
          独立分析生产质量，返回修订建议
 ```

 **生产 Agent 工具** (`productionAgent/tools.ts`):

 | 工具 | 说明 |
 |---|---|
 | `get_flowData` | 获取工作区数据 (script/assets/storyboard 等) |
 | `add_deriveAsset` | 新增/更新衍生资产 (写 DB + Socket 通知前端) |
 | `del_deriveAsset` | 删除衍生资产 |
 | `generate_deriveAsset` | 生成衍生资产图片 (异步，Socket 回调) |
 | `generate_storyboard` | 生成分镜图片 (串行队列，避免假死) |
 | `add_flowData_storyboard` | 新增分镜面板到工作区 |

 **FlowData 数据结构**:

 ```typescript
 FlowData = {
   script: string,            // 剧本内容
   scriptPlan: string,        // 拍摄计划
   assets: AssetItem[],       // 衍生资产
   storyboardTable: string,   // 分镜表
   storyboard: Storyboard[],  // 分镜面板
 }

 AssetItem = {
   id: number,
   name: string,
   type: 'role' | 'tool' | 'scene' | 'clip',
   prompt: string,
   desc: string,
   derive: DeriveAsset[],  // 衍生子资产
 }

 Storyboard = {
   id: number,
   duration: number,         // 持续时长(秒)
   prompt: string,           // 生成提示词
   associateAssetsIds: number[], // 关联资产ID列表
   src: string | null,       // 分镜资源路径
   index: number | null,      // 排序字段
 }
 ```

 ### 2.4 视频工作台阶段 (Workbench)

 **入口**: `routes/production/workbench/`

 视频工作台是生产 Agent 的下游，负责将分镜组装成最终视频：

 ```text
 routes/production/workbench/
 ├── getGenerateData.ts        # 获取生成数据 (8KB, 核心数据组装)
 ├── generateVideoPrompt.ts     # 生成视频 Prompt (7KB)
 ├── batchGeneratePrompt.ts    # 批量生成 Prompt (8KB)
 ├── generateVideo.ts          # 生成视频 (4KB)
 ├── batchGenerateVideo.ts     # 批量生成视频 (5KB)
 ├── checkVideoPrompt.ts       # 检查视频 Prompt
 ├── checkVideoStateList.ts    # 检查视频状态列表
 ├── getVideoList.ts           # 获取视频列表
 ├── selectVideo.ts            # 选择视频
 ├── delVideo.ts               # 删除视频
 ├── addTrack.ts              # 添加轨道
 ├── deleteTrack.ts           # 删除轨道
 ├── updateVideoDuration.ts   # 更新视频时长
 ├── updateVideoPrompt.ts     # 更新视频 Prompt
 ├── getAudioBindAssetsList.ts # 获取音频绑定资产列表
 ├── getFileUrl.ts            # 获取文件 URL
 └── ...
 ```

 **视频生成流程**:

 1. `getGenerateData`: 组装分镜+资产+模型配置数据
 2. `generateVideoPrompt`: LLM 为每个分镜生成视频 Prompt
 3. `batchGeneratePrompt`: 批量生成 Prompt
 4. `generateVideo` / `batchGenerateVideo`: 调用视频模型生成
 5. `checkVideoStateList`: 轮询视频生成状态
 6. `selectVideo`: 选择最终视频
 7. 轨道管理: `addTrack` / `deleteTrack` 组织视频片段

 ### 2.5 分镜管理阶段 (Storyboard)

 **入口**: `routes/production/storyboard/`

 ```text
 routes/production/storyboard/
 ├── addStoryboard.ts           # 添加分镜
 ├── batchAddStoryboardInfo.ts   # 批量添加分镜信息 (4KB)
 ├── batchGenerateImage.ts      # 批量生成分镜图 (6KB)
 ├── previewImage.ts            # 预览图 (5KB)
 ├── downPreviewImage.ts        # 下载预览图 (4KB)
 ├── editStoryboardInfo.ts      # 编辑分镜信息
 ├── getStoryboardData.ts       # 获取分镜数据
 ├── pollingImage.ts            # 轮询图片状态
 ├── removeFrame.ts             # 移除帧
 ├── updateStoryboardUrl.ts     # 更新分镜 URL
 └── batchDelete.ts             # 批量删除
 ```

 ### 2.6 衍生资产管理阶段 (Assets)

 **入口**: `routes/production/assets/`

 ```text
 routes/production/assets/
 ├── batchGenerateAssetsImage.ts  # 批量生成资产图 (5KB)
 ├── pollingImage.ts              # 轮询图片状态
 ├── updateAssetsUrl.ts           # 更新资产 URL
 └── deleteAssetsDireve.ts        # 删除衍生资产
 ```

 资产分为两级:
 - **主资产** (assetsId = null): 角色/场景/道具
 - **衍生资产** (assetsId != null): 主资产的变体/精修版本

 ### 2.7 图像编辑流阶段 (EditImage)

 **入口**: `routes/production/editImage/`

 ```text
 routes/production/editImage/
 ├── generateFlowImage.ts    # 生成流图像 (2KB)
 ├── getImageFlow.ts         # 获取图像流 (1KB)
 ├── saveImageFlow.ts        # 保存图像流 (1KB)
 ├── updateImageFlow.ts      # 更新图像流 (1KB)
 ├── uploadImage.ts          # 上传图片 (2KB)
 └── getImageDefaultModle.ts # 获取默认模型
 ```

 支持节点化精调：分镜图可在独立编辑流中精修后回流工作台。

 ## 3. 项目配置体系

 ### 3.1 导演手册 (Director Manual)

 `routes/project/addDirectorManual`, `queryDirectorManual`, `editDirectorlManual`

 - 存储在 `o_project.directorManual`
 - 定义导演意图、风格指导
 - 注入 Production Agent 的技能上下文

 ### 3.2 视觉手册 (Visual Manual)

 `routes/project/addVisualManual`, `getVisualManual`, `editVisualManual`

 - 存储在 `o_project` 相关字段
 - 定义画风、视觉风格
 - 注入 Production Agent 的技能上下文

 ### 3.3 模型选择

 `routes/project/getModelDetails`, `routes/modelSelect/`

 - `o_project.imageModel`: 图像模型 (格式: `vendorId:modelName`)
 - `o_project.videoModel`: 视频模型 (格式: `vendorId:modelName`)
 - `o_project.mode`: 视频模式 (JSON, 判断是否多参)
 - `o_project.videoRatio`: 视频画幅

 ## 4. 画风与技能体系

 ### 4.1 画风管理

 `routes/artStyle/`
 - `addArtStyle` / `editArtStyle` / `getArtStyle`
 - `extractStylePrompt`: 从画风描述提取 Prompt

 ### 4.2 技能层级

 ```text
 技能加载优先级:
 1. art_skills/{artName}/driector_skills/*.md    # 画风技能
 2. story_skills/{storyName}/driector_skills/*.md # 故事技能
 3. production_skills/*.md                       # 生产技能
 ```

 - 画风和故事技能按项目配置动态加载
 - 生产技能全局共享
 - 技能通过 `activate_skill` 工具按需激活

 ## 5. 关键业务约束

 ### 5.1 Socket 操作串行队列

 ```typescript
 function createSocketQueue(delayMs = 800) {
   // 确保 socket 操作排队执行，避免并发过高导致假死
 }
 ```

 生产 Agent 的 `generate_storyboard` 和 `add_flowData_storyboard` 工具
 使用串行队列，每个操作间隔 800ms，避免前端处理不过来。

 ### 5.2 思考配置

 ```typescript
 thinkConfig = {
   think: boolean,        // 是否启用思考模式
   thinlLevel: 0 | 1 | 2 | 3,  // 思考深度
 }
 ```

 - 前端可通过 `updateThinkConfig` 事件动态调整
 - 影响所有 Agent (决策层 + 子 Agent) 的 LLM 调用

 ### 5.3 中止与恢复

 - `abortController`: 每次对话创建新的 AbortController
 - `stop` 事件: 中止当前生成
 - 新消息到达时自动中止上一次未完成的生成
 - Agent 记忆持久化，跨会话可恢复

 ### 5.4 XML 工作区写入协议

 子 Agent 通过特定 XML 标签向工作区写入结构化数据：

 ```xml
 <storySkeleton>故事骨架内容</storySkeleton>
 <adaptationStrategy>改编策略内容</adaptationStrategy>
 <scriptItem name="剧本名称">剧本内容</scriptItem>
 <scriptPlan>拍摄计划内容</scriptPlan>
 <storyboardTable>分镜表内容</storyboardTable>
 <storyboardItem videoDesc='视频描述' prompt='提示词' track='分组'
   shouldGenerateImage='true/false' duration='时长'
   associateAssetsIds='[资产ID列表]'></storyboardItem>
 ```

 决策层调用子 Agent 时附加 XML 格式约束，子 Agent 输出后由前端解析并写入工作区。

 ## 6. 与 LumenX 的业务逻辑对比

 | 维度 | LumenX | Toonflow |
 |---|---|---|
 | 流程驱动 | 用户手动触发每阶段 | Agent 自动决策+用户对话 |
 | 剧本来源 | 直接输入文本 | 小说导入+事件图谱提取 |
 | 分镜生成 | LLM 提取+Prompt 拼装 | Agent 子任务+XML 写入 |
 | 资产管理 | 变体池 (max 10) | 两级资产 (主+衍生) |
 | 视频生成 | I2V/R2V 双模式 | Workbench 轨道制 |
 | 记忆系统 | 无 | ONNX 向量检索+摘要 |
 | 提示词管理 | PromptConfig (DB 字段) | Skill 文件 (Markdown) |
 | 质量控制 | 用户手动审阅 | 监督层 Agent 自动审阅 |
 | 画风控制 | ArtDirection + style_presets | 导演手册+视觉手册+画风技能 |
 | 成片导出 | FFmpeg 拼接+混音 | Workbench 轨道拼接 |
