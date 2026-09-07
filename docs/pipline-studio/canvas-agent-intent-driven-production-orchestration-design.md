# Pipeline Studio Canvas Agent 意图驱动的生成编排设计

> 状态：待评审 / 后续迭代设计基线  
> 日期：2026-09-04  
> 范围：回合意图、作用域控制、创作规格、模型与参数决策、素材绑定、画布编排、生成执行、结果复盘和 Skills 边界  
> 关联文档：[Canvas Agent 产品调研与技术方案](./canvas-agent-product-research-and-technical-design.md)、[Canvas Agent 开发计划](./canvas-agent-development-plan.md)、[Workflow Run V1](./workflow-run-v1-design.md)

> 当前开发已收敛为“Agent 准备完整画布、用户手动触发生成”。近期实现以
> [Canvas Agent 意图驱动的画布准备设计](./canvas-agent-intent-driven-canvas-preparation-design.md)
> 为准；本文仅保留为长期自动生成与生产编排能力参考。

## 1. 设计结论

Pipeline Studio Canvas Agent 的目标不是把一条固定的“剧本 → 分镜 → 图片 → 视频”流程自动跑到底，而是：

> Agent 先理解用户本轮想完成什么、涉及哪些对象、应停在哪里，再在这个范围内自动完成模型选择、参数设置、提示词编译、素材引用、节点编排、执行检查、失败恢复和局部调整。

因此，系统必须把两个概念分开：

1. **任务范围**：由用户本轮意图决定做什么、影响哪些内容、交付到什么程度。
2. **自动化深度**：在任务范围内，Agent 应主动处理全部技术细节，尽量不让用户检查 Route、参数、提示词、素材槽位和依赖关系。

“允许 Agent 自动触发生成”仅控制是否可以调用有成本的内容生成接口。它不扩大任务范围，也不代表每轮都要生成媒体。

## 2. 产品原则

### 2.1 用户决定目标和停止位置

不同请求必须产生不同交付：

| 用户请求 | Agent 应完成 | 停止位置 |
| --- | --- | --- |
| “讨论一下这个创意” | 分析、建议、必要澄清 | 对话，不改画布 |
| “写一个三分钟短剧剧本” | 编写或修改剧本，可写入文本节点 | 剧本，不拆分镜 |
| “把这个剧本拆成分镜” | 生成 shot list、镜头设计和连续性要求 | 分镜规格，不创建可执行媒体节点 |
| “把这些分镜搭到画布上，我自己生成” | 创建节点、选择 Route、设置参数、编译提示词、绑定素材和连线 | 可运行画布，不调用生成 API |
| “生成角色定妆图” | 只准备并生成角色定妆图及必要依赖 | 角色图完成 |
| “重新生成第 3 镜，动作更快” | 修改第 3 镜及必要的直接依赖并局部重跑 | 第 3 镜新结果完成 |
| “根据这些素材完成整部短剧” | 动态规划完整生产图并在权限允许时执行 | 用户要求的最终交付完成 |

Agent 完成当前交付后可以建议下一步，但建议不能成为后续工具权限。用户对多个建议只回复“可以”时，只有在语义上能唯一对应一个动作才可继续，否则应简短澄清。

### 2.2 Agent 负责范围内的技术正确性

当用户要求搭建或生成内容时，Agent 应自行完成：

- 选择适合当前镜头目标和素材条件的内容生成 Route；
- 设置 Route Schema 允许的画幅、时长、分辨率、数量和模型参数；
- 把剧本与镜头设计编译为适合所选模型的提示词；
- 识别参考素材的语义并绑定到正确输入槽位；
- 创建、更新、连接、分组和布局节点；
- 在执行前修复缺失引用、无效参数、失效资产和不兼容 Route；
- 根据依赖顺序执行，区分生成失败、供应商输入下载失败和本地产物下载失败；
- 评审结果并把调整限制在最小受影响子图。

用户只需要处理会改变创作方向、交付规格或费用上限的问题。模型 ID、API 名称、首尾帧槽位、采样参数和失败重试方式不应成为默认提问。

### 2.3 画布是可检查的生产事实

Agent 的工作必须落回普通画布节点、引用边、Workflow Run 和 Generation Run：

- 用户可以查看和手动修改 Agent 创建的任何节点；
- 每个生成节点保存最终 Route、参数、提示词、素材绑定和来源镜头；
- 一组 Agent 修改可整体撤销；
- 结果与输入保留生成血缘，上游变化后下游可标记过期；
- Agent 不维护一套与画布脱离的隐藏生产流程。

## 3. 当前实现与目标差距

当前基础链路已经具备项目独立会话、语义意图判断、阶段权限、Canvas Plan、原子画布修改、Workflow Run、Generation Run、素材分析、连续性、结果评审和 Skill 加载能力。本设计在这些能力上增量扩展。

主要缺口如下：

| 维度 | 当前状态 | 目标状态 |
| --- | --- | --- |
| 意图 | 单一 `requestedStage` | 一轮可包含多个明确动作，并记录交付物和停止条件 |
| 范围 | 主要限制阶段 | 同时限制项目、节点、镜头、实体和允许创建的必要依赖 |
| 生成授权 | 区分允许、关闭和用户拒绝 | 继续保留，并叠加本轮明确生成请求和对象范围 |
| 模型选择 | 节点可保存 `routeId`，存在默认 Route 回退 | 根据镜头生产要求和实际素材动态筛选、评分和解释 |
| 参数 | 节点可保存 `settings` | Agent 生成并由 Schema 校验、归一化和记录来源 |
| 提示词 | 支持结构化富文本和素材引用 | 从稳定的镜头规格确定性编译为 Route 适配提示词 |
| 素材 | 有媒体类型和少量引用角色 | 增加创作语义角色，再映射为 Route 的实际槽位 |
| 执行 | Workflow Run 按 DAG 执行 | 增加生产计划、预算、自动修复、Route 回退和局部重规划 |
| 评审 | 能分析最近结果并局部调整 | 按原始镜头目标进行结构化验收并控制自动重试上限 |
| Skill | 可加载项目 Skill，内置短剧 Skill | Skill 只提供创作策略，不固定模型、参数和整条流程 |

## 4. 回合意图与执行策略

### 4.1 回合意图模型

现有阶段字段保留用于兼容，但新的语义解析结果应表达动作与对象范围：

```ts
type CanvasAgentAction =
  | "discuss"
  | "write-script"
  | "create-storyboard"
  | "configure-canvas"
  | "analyze-assets"
  | "generate"
  | "review"
  | "adjust"
  | "recover";

interface CanvasAgentTurnIntentV2 {
  objective: string;
  requestedActions: CanvasAgentAction[];
  scope: {
    projectWide: boolean;
    nodeIds: string[];
    shotIds: string[];
    entityIds: string[];
  };
  deliverables: Array<{
    type: "answer" | "script" | "storyboard" | "canvas" | "media" | "review";
    targetIds: string[];
    description: string;
  }>;
  stopCondition: string;
  generation: {
    requested: boolean;
    targetNodeIds: string[];
    targetShotIds: string[];
  };
  constraints: string[];
  assumptions: string[];
  ambiguity: "none" | "material";
  confidence: "high" | "medium" | "low";
  clarificationQuestion?: string;
}
```

`requestedActions` 不是固定阶段流水线。它表示本轮实际需要的能力集合。例如“分析这三张参考图并建立角色节点，但不要生成”可以同时包含 `analyze-assets` 和 `configure-canvas`，但不包含 `generate`。

### 4.2 语义解析输入

Intent Resolver 应使用：

1. 当前用户消息；
2. 最近对话中的已确认事实和未完成承诺；
3. 当前选区和显式 `@` 引用；
4. 当前画布相关子图；
5. 当前项目的生成权限；
6. 上一轮 Agent 建议，但建议只用于消解指代，不产生授权。

自然语言范围不得使用硬编码关键词或正则作为最终判定。LLM 输出结构化结果后，由服务端执行类型、对象存在性和权限校验。解析失败时降级为澄清或只读讨论，不能猜测为全流程生成。

### 4.3 执行策略

Intent 经过确定性编译后得到短期、服务端持有的执行策略：

```ts
interface CanvasAgentTurnExecutionPolicy {
  sessionId: string;
  turnId: string;
  allowedActions: CanvasAgentAction[];
  allowedNodeIds: string[] | "project";
  allowedShotIds: string[] | "project";
  allowedEntityIds: string[] | "project";
  mayCreateDependencies: boolean;
  mayMutateCanvas: boolean;
  mayTriggerGeneration: boolean;
  maxGenerationNodes: number;
  stopAfter: CanvasAgentTurnIntentV2["deliverables"];
}
```

`mayTriggerGeneration` 必须同时满足：

```text
本轮 requestedActions 包含 generate
AND 本轮 generation.requested 为 true
AND 项目 allowAgentGeneration 为 true
AND 用户本轮没有拒绝生成
```

自动生成关闭时，如果用户要求生成，Agent 仍应把目标节点准备到可运行状态，并清楚说明需要用户手动点击生成。手动点击节点生成不受该设置影响。

### 4.4 工具边界必须强制执行范围

模型提示词只负责帮助模型正确调用工具，不能作为权限边界。所有写工具在 application 层检查执行策略：

- Plan 中出现范围外已有节点，拒绝对应操作；
- 用户只要求第 3 镜，Plan 提交 7 个镜头时，只允许必要依赖和第 3 镜；
- `mayCreateDependencies` 为 false 时，不得创建任何额外节点；
- 创建必要依赖时，必须记录它服务于哪个目标，并受数量预算限制；
- `mayTriggerGeneration` 为 false 时，任何直接或通过 Workflow Run 间接触发的生成都被拒绝；
- 达到 `stopAfter` 后结束工具循环，Agent 只能汇报结果或提出下一步建议。

## 5. 创作规格与生产规格

### 5.1 为什么需要稳定规格

剧本语言不能直接决定供应商 API 参数。相同镜头可能适合文生视频、图生视频、多模态参考视频、口型同步或首尾帧控制。系统需要先保存“要拍什么”，再决定“用哪个模型怎么生成”。

推荐的数据流：

```text
用户意图
  → CreativeBrief
  → ShotProductionSpec
  → RouteDecision
  → NodeGenerationConfig
  → Canvas Plan / Workflow Run
```

### 5.2 镜头生产规格

```ts
interface ShotProductionSpec {
  id: string;
  sourceScriptNodeId?: string;
  narrativePurpose: string;
  durationSeconds: number;
  aspectRatio: string;
  subjects: Array<{
    entityId: string;
    role: "character" | "product" | "prop";
    appearanceRequirements: string[];
  }>;
  environment: {
    entityId?: string;
    description: string;
    time: string;
    weather?: string;
  };
  performance: {
    action: string;
    emotion?: string;
    dialogue?: string;
    lipSyncRequired: boolean;
  };
  camera: {
    shotSize: string;
    angle: string;
    movement: string;
    composition: string;
    transitionIntent?: string;
  };
  visualStyle: {
    styleRefs: string[];
    lighting: string;
    color: string;
    quality: string;
  };
  audio: {
    voiceEntityId?: string;
    ambience?: string;
    sfx?: string;
    music?: string;
  };
  generationRequirements: {
    outputMedia: "image" | "video" | "audio";
    consistencyPriority: "low" | "medium" | "high";
    motionComplexity: "low" | "medium" | "high";
    exactStartFrame: boolean;
    exactEndFrame: boolean;
    referenceModalities: Array<"image" | "video" | "audio">;
  };
}
```

该规格保存创作目标，不保存供应商字段。用户调整剧情或镜头时先修改此规格，再重新编译受影响节点。

### 5.3 节点生成配置

```ts
interface NodeGenerationConfig {
  sourceShotId?: string;
  routeId: string;
  routeRevision: number;
  settings: Record<string, string | number | boolean | Array<string | number | boolean>>;
  promptDocument: CanvasPromptDocument;
  assetBindings: Array<{
    semanticRole: CanvasAssetSemanticRole;
    sourceId: string;
    routeSlot: string;
    order: number;
  }>;
  decision: {
    reasonCodes: string[];
    alternatives: Array<{ routeId: string; reasonRejected: string }>;
  };
  compilerVersion: number;
}
```

最终配置应映射到现有 `CanvasGenerationParams`，避免另建一套执行数据；必要的决策元数据可以作为节点配置的扩展字段或独立持久化记录加入。

## 6. Route 动态选择

### 6.1 不把首尾帧作为默认流程

首尾帧只适合以下目标：

- 用户明确要求从画面 A 精确过渡到画面 B；
- 转场的起点和终点都必须保持可控；
- 所选模型本身要求首尾帧输入，且现有素材满足约束。

一般短剧镜头应根据实际目标选择：

- 只有文字描述且无稳定主体参考：文生图或文生视频；
- 需要保持单张角色或场景画面：图生图或图生视频；
- 同时依赖角色、服装、场景、道具、动作或音频：多模态参考生成；
- 需要复用参考视频运动：支持视频参考的多模态视频；
- 对白必须对口型：口型同步或具备音频驱动能力的 Route；
- 需要精确 A → B 转场：首尾帧 Route。

Agent 不应为了沿用已有节点形态而强行选择首尾帧。

### 6.2 Route 能力画像

Provider Catalog 除现有 Schema 外，应向 application 提供可计算的能力画像：

```ts
interface GenerationRouteProfile {
  routeId: string;
  supportedOutputs: Array<"image" | "video" | "audio">;
  acceptedInputs: Array<{
    modality: "text" | "image" | "video" | "audio";
    min: number;
    max: number;
    semanticRoles?: CanvasAssetSemanticRole[];
  }>;
  features: {
    firstFrame: boolean;
    lastFrame: boolean;
    multiImageReference: boolean;
    videoReference: boolean;
    audioReference: boolean;
    lipSync: boolean;
    nativeAudio: boolean;
  };
  limits: {
    durations?: number[];
    aspectRatios?: string[];
    resolutions?: string[];
  };
  strengths: string[];
  limitations: string[];
  qualityTier: number;
  speedTier: number;
  costTier: number;
}
```

这类资料由受信 Provider Catalog 维护，不能让模型从 API 名称猜测能力。

### 6.3 选择算法

Route 选择分两步：

1. **硬过滤**：Provider 已启用、凭据可用、输出类型匹配、必需输入数量满足、画幅和时长可用、所需能力存在。
2. **软评分**：镜头目标匹配度、连续性能力、运动表现、已有素材利用率、项目偏好、历史成功率、成本、延迟和失败风险。

示意评分：

```text
score =
  objectiveFit * 0.30
  + consistencyFit * 0.20
  + motionFit * 0.15
  + assetUtilization * 0.15
  + projectPreference * 0.05
  + reliability * 0.10
  + costLatencyFit * 0.05
```

权重应可测试并通过实际生成数据调整。第一版可以使用明确的规则评分，不需要训练推荐模型。

如果没有 Route 通过硬过滤，Agent 先尝试创建可生成的必要中间资产或降级非关键要求；只有降级会改变用户交付时才提问。

## 7. 素材语义与引用编译

现有 `reference`、`first-frame`、`last-frame` 是执行角色，不足以表达素材在创作中的用途。增加供应商无关的语义角色：

```ts
type CanvasAssetSemanticRole =
  | "character-identity"
  | "character-clothing"
  | "product-identity"
  | "scene"
  | "prop"
  | "visual-style"
  | "composition"
  | "motion"
  | "transition-start"
  | "transition-end"
  | "voice"
  | "ambience"
  | "source-video";
```

素材分析产生候选语义和置信度，Production Spec 决定镜头实际需要哪些语义，Asset Binding Compiler 再根据所选 Route 映射到 `imageList`、`videoList`、`audioList`、首帧、尾帧或混合顺序。

编译器必须处理：

- Route 最多支持的引用数量；
- 同一实体多张图片的优先级和去重；
- 混合模态输入的稳定顺序；
- 首帧和尾帧必须由图片节点提供，尾帧不能脱离首帧；
- 被删除、失效或尚未生成的素材；
- 上游节点完成后才能解析的 Artifact；
- 供应商需要公网 URL、文件 ID 或临时上传对象的差异。

上传是供应商适配器的资产准备职责。Agent 只绑定 workspace 内的受控资产引用，不直接处理上传地址和供应商凭据。

## 8. 提示词与参数编译

### 8.1 提示词编译

Prompt Compiler 从 `ShotProductionSpec` 和 Route Profile 生成最终提示词，建议按以下稳定顺序组织：

1. 镜头叙事目的；
2. 主体身份和必须保持的外观；
3. 场景、时间和环境；
4. 动作、表演、情绪和对白；
5. 景别、机位、构图和运镜；
6. 光线、色彩和视觉风格；
7. 连续性约束；
8. 声音要求；
9. Route 特有的表达和限制。

编译器还应：

- 让提示词中的素材编号与真实槽位顺序一致；
- 删除与参考素材或模型能力冲突的描述；
- 避免重复堆叠风格词和互相矛盾的运镜；
- 把全局连续性要求只注入相关镜头；
- 保存编译器版本，使后续重新编译可解释。

### 8.2 参数决策

参数来源优先级：

```text
用户本轮明确值
→ 项目偏好
→ ShotProductionSpec 推导值
→ Route 默认值
```

所有参数必须经过 Route Schema 校验。枚举值不合法时选择语义最接近的合法值；数值超界时收敛到允许范围；无法无损修复且会影响交付时才询问用户。Agent 不应写入 Catalog 未声明的任意高级参数。

## 9. 生产计划、执行和恢复

### 9.1 持久化生产计划

在现有语义 Canvas Plan 和 Workflow Run 之间增加可持久化的 `CanvasProductionPlan`：

```ts
interface CanvasProductionPlan {
  id: string;
  projectId: string;
  sourceTurnId: string;
  intentSnapshot: CanvasAgentTurnIntentV2;
  canvasBaseRevision: number;
  shots: ShotProductionSpec[];
  targetNodeIds: string[];
  dependencyNodeIds: string[];
  status: "draft" | "configured" | "running" | "completed" | "partially-failed" | "cancelled";
  budget: {
    maxGenerationNodes: number;
    maxAutomaticRetriesPerNode: number;
    maxFallbacksPerNode: number;
  };
  revision: number;
}
```

它保存 Agent 为本轮做出的生产决策和范围快照；真正的运行状态仍由 Workflow Run、Generation Run 和 Provider Job 持有。

### 9.2 Preflight 与自动修复

执行前对目标子图进行一次完整检查：

| 问题 | 默认处理 |
| --- | --- |
| Route 已关闭或能力不匹配 | 重新选择通过硬过滤的 Route |
| 参数超出 Schema | 归一化为合法值并记录修复 |
| 缺少必需参考素材 | 从已有资产补绑定，或创建最小必要依赖 |
| 首尾帧关系非法 | 改用合适的参考模式或补齐合法图片依赖 |
| 引用素材已删除或过期 | 重选同语义资产，必要时重新生成上游 |
| 供应商输入文件失效 | 重新准备或上传输入，不重复创建付费生成任务 |
| 上游结果未完成 | 保持当前步骤等待，不提前提交 |
| 提示词与素材编号不一致 | 重新编译提示词和槽位顺序 |

修复不能突破本轮范围。若必要依赖会显著增加费用或改变交付，Agent 应先询问用户。

### 9.3 执行调度

继续复用现有 Workflow Run：

- 按 DAG 拓扑执行；
- 无依赖分支受控并发；
- 幂等创建 Generation Run，避免重复付费；
- 刷新和应用重启后从 SQLite 恢复；
- 节点在“运行中”但尚未写入 Generation Run ID 的短窗口不能被判为另一次执行；
- 只取消用户指定的目标和其等待中的下游，不误伤无关分支。

### 9.4 故障分类

对用户和 Agent 暴露可行动的稳定分类：

| 类别 | 示例 | 恢复方式 |
| --- | --- | --- |
| 生成提交失败 | 参数错误、额度不足、供应商拒绝 | 修复配置后显式重新提交 |
| 供应商处理失败 | 模型运行失败 | 同 Route 重试或选择备选 Route |
| 供应商输入下载失败 | RunningHub `1013 文件下载超时` | 重新上传/准备输入，再提交新任务 |
| 本地产物下载失败 | 远端生成成功，本地获取结果超时 | 只重新下载，不重复生成和计费 |
| 本地编排失败 | 保存冲突、依赖变化 | 从持久化快照恢复或重新编译 Plan |

失败信息必须明确回答“内容是否已经生成”“是否会再次计费”“Agent 下一步会做什么”。

## 10. 结果评审与局部调整

结果评审以 `ShotProductionSpec` 为基准，检查：

- 主体、服装、产品和场景连续性；
- 动作、情绪、对白和镜头目标是否实现；
- 构图、景别、运镜、节奏和转场；
- 明显生成缺陷、文字错误和音画问题；
- 结果是否满足交付画幅、时长和声音要求。

评审输出结构化偏差和建议动作：

```ts
interface ShotReviewDecision {
  shotId: string;
  accepted: boolean;
  deviations: Array<{
    dimension: string;
    severity: "minor" | "major";
    evidence: string;
  }>;
  recommendedAction:
    | "keep"
    | "recompile-prompt"
    | "change-settings"
    | "change-assets"
    | "change-route"
    | "regenerate-dependency";
}
```

自动修正遵循最小影响原则：先改当前节点的提示词或参数，再考虑素材和 Route，最后才重做上游依赖。除非用户要求整个项目统一调整，否则不得重跑无关镜头。

自动复盘不能无限循环。每个节点的自动重试次数、Route 回退次数和本轮生成节点数受 Production Plan 预算限制；达到上限后保留现状并说明需要用户决定的创作取舍。

## 11. Skills 的职责

第一阶段只保留一个内置“短剧” Skill，用于验证 Skill 机制。真实用户可以添加项目 Skill。

短剧 Skill 应描述：

- 如何从用户目标提取冲突、人物关系、节奏和集尾钩子；
- 如何设计镜头目的、表演、对白密度和竖屏构图；
- 如何建立角色、服装、场景、道具和声音连续性；
- 如何评审剧情推进、人物一致性和镜头可生成性；
- 哪些创作歧义必须询问用户。

短剧 Skill 不应固定：

- RunningHub 或其他供应商的 Route ID；
- 所有镜头都使用首尾帧；
- 固定的模型参数；
- 无论用户请求什么都执行完整短剧生产；
- 一套不可改变的节点拓扑。

Skill 提供领域策略；Intent Resolver 决定本轮范围；Route Selector 读取项目实际可用模型；Compiler 生成具体配置；application 工具执行并校验。用户 Skill 同样不能绕过这些边界。

## 12. 服务与模块边界

推荐新增或扩展以下 application 能力：

```text
PipelineAgentConversationService
  → CanvasAgentIntentResolver
  → CanvasAgentTurnPolicyCompiler
  → CanvasProductionPlanner
       → CanvasContextAssembler
       → CanvasAssetSemanticService
       → GenerationRouteDecisionService
       → CanvasPromptCompiler
       → CanvasGenerationConfigCompiler
  → CanvasAgentPlanService
  → CanvasProductionPreflightService
  → CanvasWorkflowExecutionService
  → CanvasResultReviewService
```

边界要求：

- contracts 保存浏览器和服务端共同使用的可序列化结构；
- domain 保存 Production Spec、Plan、Decision 和错误码；
- application 负责编排、权限、选择、编译和校验；
- ports 提供 LLM、Route Directory、Repository、媒体分析和供应商生成能力；
- infrastructure 实现 Pi、多模态模型、SQLite、RunningHub、千问和文件准备；
- transport 只解析 HTTP/SSE 输入输出；
- Next.js Route Handler 不实现任何选择或修复规则；
- 前端只展示服务端决策，不复制 Route 选择和权限判断。

## 13. 关键错误码

建议补充稳定错误码：

| 错误码 | 含义 |
| --- | --- |
| `PIPELINE_AGENT_ACTION_NOT_ALLOWED` | 动作不在本轮允许集合 |
| `PIPELINE_AGENT_TARGET_OUT_OF_SCOPE` | 节点、镜头或实体超出本轮范围 |
| `PIPELINE_AGENT_GENERATION_NOT_REQUESTED` | 本轮未请求生成 |
| `PIPELINE_AGENT_GENERATION_DISABLED` | 项目关闭 Agent 自动生成 |
| `PIPELINE_AGENT_DEPENDENCY_BUDGET_EXCEEDED` | 必要依赖超过本轮预算 |
| `PIPELINE_GENERATION_ROUTE_UNAVAILABLE` | 没有满足硬约束的可用 Route |
| `PIPELINE_GENERATION_CONFIG_INVALID` | 编译后的参数或素材绑定不合法 |
| `PIPELINE_GENERATION_INPUT_FETCH_FAILED` | 供应商无法获取输入素材 |
| `PIPELINE_GENERATION_ARTIFACT_DOWNLOAD_FAILED` | 已生成结果无法下载到本地 |
| `PIPELINE_AGENT_REPLAN_REQUIRED` | 相关画布数据已变化，需要重新规划 |

新增公共错误和响应结构时同步更新 `docs/agent-api-reference.md`。

## 14. 交互呈现

右侧 Agent 面板继续使用当前项目独立的持久会话。每轮只展示用户需要判断的信息：

- 当前理解的目标和范围；
- 将创建或修改的镜头/节点数量；
- 是否会触发生成及预计调用数量；
- 关键创作假设；
- 已自动修复的问题；
- 最终结果和局部调整建议。

Route、参数和素材槽位默认由 Agent 处理，但必须能在节点中查看和手动修改。Agent 在聊天中不应逐项要求用户确认技术设置。只有费用显著增加、交付规格不明确或创作方向存在真实分歧时才提问。

自动生成关闭时，Agent 的完成消息应明确说明节点已经配置完成，以及哪些节点可以由用户手动运行。生成或恢复失败时，发送按钮仍应可用，用户可以继续要求诊断、重新下载或调整方案。

## 15. 分阶段实现

### 阶段 A：动作与对象范围

- 引入 `CanvasAgentTurnIntentV2` 和 `CanvasAgentTurnExecutionPolicy`；
- 保留旧阶段字段的兼容映射；
- 工具边界校验 node、shot、entity 范围；
- 增加范围越界和生成授权回归测试。

验收：用户要求“只调整第 3 镜”时，服务端能拒绝模型提交的其他镜头修改；用户只要求剧本时不会创建媒体节点。

### 阶段 B：镜头生产规格与动态 Route

- 建立 `ShotProductionSpec`；
- 扩展 Route Profile；
- 实现硬过滤和可解释评分；
- 让 Agent 写入经 Schema 校验的 `routeId` 和 `settings`；
- 覆盖文生、图生、多模态参考、首尾帧、口型和音频场景。

验收：同一短剧不同镜头可根据目标使用不同类型的 Route，首尾帧不再成为默认方案。

### 阶段 C：素材与提示词编译

- 增加素材语义角色；
- 实现 Route Slot Binding Compiler；
- 实现版本化 Prompt Compiler；
- 建立配置 preflight 和自动修复。

验收：多张角色、服装、场景和道具参考能自动绑定，模型输入编号与提示词一致，无需用户逐节点检查。

### 阶段 D：持久生产计划与质量收敛

- 持久化 `CanvasProductionPlan`；
- 增加预算、Route 回退和恢复策略；
- 按 Shot Spec 做结果评审；
- 支持最小影响范围的自动调整和局部重跑。

验收：单镜失败或效果偏差只重做受影响节点；应用重启后可恢复计划和运行，不重复付费。

## 16. 验收场景

至少使用以下场景建立真实回归集：

1. **只写剧本**：空画布中要求写短剧剧本，最终只有文本交付，没有分镜和生成调用。
2. **只搭画布**：自动生成关闭，要求把已确认分镜配置为可运行节点；Route、参数、提示词、引用和布局全部完成。
3. **多模态短剧镜头**：提供角色、服装、场景和动作参考，Agent 选择支持对应模态的 Route，不强行改为首尾帧。
4. **精确转场**：要求从指定画面 A 过渡到 B，Agent 才选择首尾帧 Route 并建立合法图片依赖。
5. **局部生成**：只要求生成第 3 镜，Agent 不运行其他镜头，只创建确有必要的依赖。
6. **范围越界防护**：模拟模型提交范围外节点，application 拒绝且画布无部分写入。
7. **输入下载失败**：供应商返回 `1013`，Agent 重新准备输入并解释内容尚未生成，避免把它误报为本地产物下载失败。
8. **产物下载失败**：远端已完成但本地下载超时，只重新下载，不创建新生成任务。
9. **Route 失效**：已配置 Route 被关闭，Agent 自动选择满足约束的备选 Route 并重新编译参数。
10. **结果局部调整**：用户说“第 2 镜人物一致，但动作太慢”，只修改动作相关提示词/参数并重跑第 2 镜。

## 17. 成功指标

- 用户从需求到可运行画布的手动节点、连线和参数操作数量；
- Agent 第一次生成前通过 preflight 的比例；
- 因错误 Route、参数或引用导致的失败率；
- 用户手动覆盖 Agent Route 和参数的比例及原因；
- 单镜调整实际影响的节点数量；
- 重复付费提交次数，目标为零；
- Agent 越过用户本轮范围的次数，目标为零；
- 用户为了理解技术错误而必须手动排查节点的次数。

这些指标用于调整 Route 评分、编译规则和 Skill，不用于鼓励 Agent 扩大本轮任务。

## 18. 非目标

本阶段不做：

- 训练自有 Route 推荐模型；
- 引入 LangGraph、Temporal 或另一套 Agent runtime；
- 内置大量未经真实场景验证的创作 Skills；
- 用一套固定模板覆盖所有广告、口播和短剧；
- 让 Agent 绕过 Canvas Plan、Workflow Run 或 Generation Run 直接调用供应商；
- 为了显得自动化而隐藏模型、参数、引用和生成血缘。

后续实现应先完成阶段 A，并以“意图范围不会越界”为前提，再逐步增加范围内的自动配置和生成能力。
