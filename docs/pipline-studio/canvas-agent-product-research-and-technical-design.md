# Pipeline Studio Canvas Agent 产品调研与技术方案

> 状态：前期调研 / 推荐方案
> 日期：2026-09-03
> 范围：Agent 产品形态、核心能力、交互边界、技术选型、落地顺序
> 不包含：具体 UI 视觉稿、数据库迁移脚本、实现代码

## 1. 结论

Pipeline Studio 应把 Agent 做成一个**驻留在画布中的创作协作者**，而不是给现有画布再加一个聊天窗口。

用户描述目标、补充素材并评价结果；Agent 根据本轮意图决定只回答问题、编写内容、修改画布，还是继续执行生成。它可以整理创作意图、规划内容结构、编写适配具体模型的提示词、创建和连接节点、安排生成、检查结果并根据反馈局部修改，但必须停在用户要求的结果边界。Agent 完成的每一步都应落回普通画布节点和连线，用户随时可以手动接管。

第一版的核心产品承诺应是：

> 用户用自然语言给出一个创作目标后，可以在一次对话中得到一套可编辑、可追踪、可继续生成的画布方案，而不必先学习节点、提示词、模型输入槽位和连线规则。

推荐的技术方向是：

1. 保留现有 Pi Agent runtime，复用其多轮会话、流式输出、工具调用、模型配置和上下文管理能力。
2. 在 application 层新增 Canvas Agent 的计划、校验和执行能力，不让模型直接写数据库或自由拼装底层 mutation。
3. 让 Agent 先生成结构化 `CanvasAgentPlan`，再由确定性执行器把计划转换为现有 `CanvasMutationBatch` 和 Generation Run。
4. 不划分 Assist / Auto 模式，只提供项目级“允许 Agent 自动生成”开关；开关只授予调用生成接口的权限，不扩大本轮任务范围。
5. 第一版不引入 LangGraph、Vercel AI SDK 或 Temporal。它们会重复现有 runtime 或显著增加部署和状态维护成本；只有当现有状态机无法支撑长时间、多分支、跨进程恢复时再重新评估。

## 2. 用户问题的本质

当前体验把四类认知工作都交给了用户：

| 用户负担 | 当前动作 | Agent 应承担的工作 |
| --- | --- | --- |
| 叙事规划 | 自己想脚本、镜头和节奏 | 从目标生成可修改的 brief、脚本和 shot plan |
| 提示词工程 | 为不同模型手写提示词 | 保留创作意图，按 Route 能力编译提示词和参数 |
| 工作流搭建 | 手动创建、摆放、连线 | 创建节点、设置显式引用角色、分组和布局 |
| 生产管理 | 逐个选择模型、运行、等待、比较 | 选择 Route、估算任务、批量运行、失败恢复和结果比较 |

如果只增加“帮我写提示词”或“一键生成节点”，用户仍然需要在上述四类工作之间频繁切换。Canvas Agent 必须覆盖从意图到可编辑生产图的完整闭环。

## 3. 市场与产品基准

### 3.1 LibTV

LibTV 官方页面将产品描述为覆盖生成到剪辑的完整视频创作平台，并把“无限画布、自由编排、智能 Agent”和 AI 导演 Skills 放在核心能力中。公开页面可以确认它的方向是让 Agent 参与完整创作流程，而不仅是调用单个模型。[LibTV 官方页面](https://www.liblib.tv/wappro?sourceid=040004)

公开资料没有完整披露 Agent 的工具协议、审批逻辑和持久化方式，因此本方案不推断其内部实现。用户实际体验提供了更有价值的产品证据：对话、规划、剧本、节点生成和素材分析被放在同一个画布闭环里。

### 3.2 FLORA FAUNA

FAUNA 是目前公开说明最完整的同类形态。官方文档明确列出：读取画布、增加节点、选择模型、连接流程、运行生成、整理输出；选中节点会自动成为上下文，也可以用 `@` 指定节点；图片可直接附加到对话；Assist 模式在运行前展示节点和预计消耗，Auto 模式可以直接运行。[FAUNA 官方文档](https://docs.flora.ai/editor/fauna)

FAUNA 的产品表述也强调，模型、提示词和执行顺序会保留在画布上，用户可以只重跑失败或不满意的一部分，而不破坏其余工作。[FAUNA 发布说明](https://flora.ai/blog/introducing-fauna)

可借鉴的原则：

- Agent 必须“有手”，但手只能通过产品定义的工具操作画布。
- 对话上下文和画布选区应自然连接。
- Agent 的产物必须是普通、可编辑、可重用的画布结构。
- 付费执行和可逆编辑使用不同的确认策略。
- 局部迭代优先于重新生成整套方案。

### 3.3 LTX Studio

LTX Studio 支持从概念、脚本、图片或视频开始，生成场景和分镜，并提供角色、场景与元素的一致性控制以及逐镜头编辑。[LTX Studio 官方页面](https://website.ltx.studio/)

它验证了视频 Agent 不应只关注单次生成质量，还需要维护跨镜头的角色、场景、风格和叙事连续性。对 Pipeline Studio 来说，这意味着“连续性设定”应成为结构化项目状态，而不是散落在每个提示词中。

### 3.4 基准产品带来的共同结论

成熟方向都在把创作过程拆成两层：

1. Agent 把模糊目标转为创作结构和生产计划。
2. 画布保存每个可查看、可编辑、可重跑的中间结果。

因此，Pipeline Studio 不应追求一个隐藏所有过程的“一键成片”黑盒。更合适的差异点是：本地、可检查、模型与 Route 可控、生成血缘清晰、任何阶段都能手动接管。

## 4. 推荐的产品形态

### 4.1 入口与布局

Agent 使用固定停靠在画布右侧的面板，可收起：

- 面板头部显示 Agent 状态、当前模型和“允许 Agent 自动生成”开关。
- 模型可在当前项目中修改；切换后从下一轮开始生效，不丢失聊天历史。
- 快捷键打开后，焦点直接进入输入框。
- 当前选中的节点自动成为本轮上下文，并在输入框上方显示为可移除的引用项。
- 使用 `@` 可以引用未选中的节点、资产、分组、工作流或历史生成结果。
- 输入框固定在面板下方，上方区域显示可恢复的多轮聊天和工具执行记录。
- 收起面板不终止会话和后台生成。
- Agent 创建或修改内容时，画布自动定位到受影响区域，但不抢走用户正在编辑的焦点。

### 4.2 Agent 必须服从本轮范围

规划能力不等于固定执行一套“剧本 → 分镜 → 图片 → 视频”流水线。Agent 每轮先判断用户需要的结果层级：

| 用户意图 | 本轮应完成 | 本轮不应擅自继续 |
| --- | --- | --- |
| “帮我讨论这个创意” | 对话、澄清和建议 | 修改画布 |
| “帮我写一个剧本” | 产出剧本，可创建或更新文本节点 | 分镜、图片或视频生成 |
| “把这个剧本拆成分镜” | 创建 shot plan 和分镜相关节点 | 图片或视频生成 |
| “把分镜节点搭好，我自己生成” | 节点、提示词、引用和布局 | 调用任何生成接口 |
| “根据这些素材做成完整视频” | 规划、搭图并在权限允许时执行生成 | 超出目标的额外版本和无关资产 |

Agent 可以在完成后建议下一步，例如“剧本已经写好，是否继续拆分镜？”，但建议不能自动变成执行。开启自动生成也不能改变这一规则。

内部应把每轮范围表示为结构化 intent：

```ts
interface CanvasAgentTurnIntent {
  requestedOutcome: "answer" | "script" | "storyboard" | "canvas-setup" | "generation" | "review";
  deliverables: string[];
  allowedStages: Array<"discuss" | "write" | "plan" | "edit-canvas" | "generate" | "review">;
  stopCondition: string;
  explicitConstraints: string[];
}
```

这个结构不是固化创作流程，而是约束 Agent 不越过用户本轮要求。复杂任务仍由 Agent 动态决定步骤、顺序和需要使用的领域能力。

### 4.3 一次完整生成任务的典型交互

```text
用户：用这张产品图做一支 15 秒的高端香水广告，冷色、克制，有三次镜头变化。

Agent：
1. 读取产品图和当前画布
2. 推断产品、材质、品牌气质和可用画幅
3. 给出简短创作方案与少量必要假设
4. 生成 3 镜头结构、连续性设定和 Route 适配提示词
5. 在画布上创建素材、创意说明、分镜图和视频节点并完成引用
6. 告知将运行 3 张图、3 段视频；项目已允许自动生成，因此开始执行
7. 完成后比较结果并建议只重做第 2 镜头
```

当需求足够明确时，Agent 不应为了形式完整而逐项询问。只在缺失信息会显著改变成本、叙事或最终格式时提问，例如成片时长、目标平台或必须保留的品牌元素。

### 4.4 自动生成权限

产品只保留一个布尔设置：`allowAgentGeneration`。

#### 关闭时

- Agent 可以对话、分析素材、写剧本和分镜、创建或修改节点、编写提示词、选择 Route、建立引用、分组和布局。
- Agent 不得调用图片、视频或音频生成接口，也不得通过工作流执行间接触发生成。
- Agent 把节点准备到可运行状态，用户在节点上手动点击生成。

#### 开启时

- 当本轮意图明确包含生成时，Agent 可以主动触发生成并管理运行、重试和局部迭代。
- 用户本轮明确说“不要生成”“我自己运行”时，本轮要求优先于项目设置。
- 用户只要求剧本、分镜或画布搭建时，Agent 仍必须在对应阶段停止。

这个开关是**生成权限上限**，不是“全自动工作模式”。建议作为项目级持久化设置，默认关闭；新项目可以读取全局默认值，但项目之间互不联动。

创建节点、连线和布局等普通 Agent 能力不受这个开关影响。每组画布修改形成一个可撤销的 Agent action，避免为每个低风险步骤制造审批疲劳。

### 4.5 计划如何呈现

计划应同时存在两种视图：

- 对话中显示人能快速判断的摘要：目标、镜头数、风格、会使用的素材、待执行生成数量和关键假设。
- 画布上以临时轮廓或一次性预览显示将创建的组和拓扑。用户可以直接“应用”“调整方案”或修改某个镜头。

计划不是长篇说明文。大多数任务只需要 3 至 7 行摘要；具体提示词和参数放在对应节点中。

## 5. Agent 应具备的能力

### 5.1 意图理解与多轮对话

- 判断用户是在讨论、写作、规划、搭建画布、请求生成，还是评审已有结果。
- 从多轮对话中继承已经确认的目标、约束、否定条件和术语指代。
- 新一轮要求覆盖旧假设时，以最新明确要求为准，并更新结构化项目事实。
- 只追问会显著影响当前交付的问题；其余信息采用明确、可修正的假设。
- 每轮形成 `CanvasAgentTurnIntent`，工具层据此限制可执行阶段。
- 完成当前交付后停止，可建议下一步但不自动扩大任务。

### 5.2 画布感知

第一优先级：

- 读取项目、revision、viewport、选区、节点、连线、分组和生成状态。
- 根据选区向上追踪引用、向下追踪派生结果。
- 读取节点的可用内容、提示词、Route、参数和生成血缘。
- 识别空节点、断开的引用、过期结果、失败任务和无法运行的拓扑。
- 用稳定 ID 引用对象；名称只用于展示。

上下文不应每轮发送完整画布。Context assembler 应按以下顺序构建最小相关子图：

1. 显式 `@` 引用；
2. 当前选区；
3. 与选区相邻的引用和派生节点；
4. 项目 brief 与连续性设定；
5. 仅在需要时读取其他节点详情。

### 5.3 素材分析

- 图片：主体、构图、风格、材质、光线、文字、品牌元素、可作为何种引用。
- 视频：基础元数据、采样关键帧、镜头切分、主体和运动摘要。
- 音频：时长、节奏、语音转写、情绪和可用片段。
- 文本/PDF：创作目标、约束、受众、交付格式和品牌规范。
- 多素材：判断哪些是主体、场景、风格、首帧、尾帧或反例，并允许用户修正。

视频和音频应先经过确定性的预处理器生成元数据、关键帧或转写，再把紧凑结果交给多模态模型。不要把整段媒体直接塞入会话上下文。

### 5.4 创作规划

- 把一句需求整理为结构化 creative brief。
- 生成或修改剧本、旁白、shot list 和 storyboard。
- 为每个镜头确定目的、时长、景别、构图、动作、运镜、声音和转场。
- 维护角色、产品、场景、服装、色彩、光线和镜头语言的一致性。
- 提供少量可比较方向，而不是默认生成大量低价值分支。
- 根据用户反馈只修改相关镜头和其下游节点。
- 根据本轮 intent 动态规划，不绑定固定生产阶段，也不默认追求最终视频。

### 5.5 提示词与模型选择

Agent 不应把“创作意图”和“供应商提示词”混成一个字符串。推荐分成：

```text
CreativeSpec
  -> ShotSpec
  -> Route capability resolution
  -> provider-specific prompt compiler
  -> final prompt + parameters + asset bindings
```

Agent 负责 `CreativeSpec` 和 `ShotSpec`；确定性 compiler 根据 Route Schema 生成最终提示词、输入槽位和参数。这样可以在切换模型时保留创作意图，也能避免把模型兼容知识散落在 system prompt 中。

模型选择需要综合：

- 输入模态和必填槽位；
- 是否支持首尾帧、多参考图、音频或口型；
- 画幅、时长和分辨率；
- 质量、速度、成本和当前可用状态；
- 用户或项目的默认偏好。

### 5.6 画布操作

- 创建、更新、复制、移动、删除节点。
- 创建、更新和删除显式角色的引用边。
- 自动布局、分组、命名和折叠结果。
- 从计划创建完整子图。
- 从选区派生新方向，同时保留原方案。
- 应用和保存工作流。
- 撤销 Agent 的一组修改。

Agent 应优先使用语义操作，例如“创建三镜头 storyboard 子图”，而不是连续调用十几次低层 `node.create` 和 `edge.create`。语义操作在服务端展开为一个原子 mutation batch，可以降低 token 消耗、半完成状态和布局错误。

### 5.7 生成编排

- 对计划中的所有节点做 preflight。
- 显示将运行的节点、Route、数量、依赖和估算信息。
- 按 DAG 拓扑运行，独立分支允许受控并发。
- 支持取消、失败重试、替换 Route 和从失败步骤继续。
- 收集多个结果，推荐候选，但不擅自把主观选择永久锁定。
- 记录输入 fingerprint；上游变化后标记下游过期并建议局部重跑。

### 5.8 结果评审与迭代

- 检查画面是否满足 shot spec 和连续性设定。
- 比较多个 take 的构图、主体一致性、动作、镜头和明显缺陷。
- 把“更克制”“第二镜头太快”“保留人物但换场景”等反馈映射到最小受影响子图。
- 解释将修改哪些节点以及为什么。

自动评审只能辅助筛选。审美结论要保留不确定性，最终选择权交给用户。

### 5.9 Skills 与可复用经验

Skills 适合承载：

- 广告、短剧、MV、口播、产品展示等创作方法；
- shot grammar 和镜头检查清单；
- 特定 Route 的提示词策略；
- 可复用的画布 plan 模板。

Skill 负责指导规划，不应绕过 Canvas application service 直接写数据库或文件。

## 6. 权限与控制模型

Agent 是否可以执行某个动作，由三个条件共同决定：

```text
本轮用户意图允许该阶段
AND 项目设置允许 Agent 自动生成（仅生成操作需要）
AND 服务端业务与安全校验通过
```

普通可逆画布操作直接执行并提供 Undo。删除用户已有内容、覆盖锁定资产、发布或外部发送仍按现有产品安全规则处理；这些属于具体动作的安全约束，不再包装成另一种 Agent 模式。

生成接口必须在 application 层检查 `allowAgentGeneration` 和本轮 intent。仅靠 system prompt 提醒模型不能形成权限边界。手动点击节点生成不受这个开关影响。

## 7. 推荐技术架构

### 7.1 总体结构

```text
Canvas Agent panel
  -> Pipeline Agent transport (turns + SSE)
  -> CanvasAgentSessionService
       -> CanvasContextAssembler
       -> CreativePlanner (LLM through existing Pi runtime)
       -> CanvasPlanValidator
       -> CanvasPlanExecutor
            -> CanvasStudioService
            -> GenerationRunService
            -> PipelineRepository / SQLite
  -> Canvas mutation SSE + generation events
```

依赖方向继续遵守项目现有架构：domain <- ports <- application <- transport。模型、Pi SDK 和供应商类型留在 infrastructure；Canvas Agent 的计划、权限和执行状态属于 domain/application。

### 7.2 计划模型

模型不直接生成数据库实体。建议定义中间计划：

```ts
interface CanvasAgentPlan {
  id: string;
  projectId: string;
  baseRevision: number;
  turnIntent: CanvasAgentTurnIntent;
  assumptions: string[];
  operations: CanvasAgentOperation[];
  generationRequests: CanvasAgentGenerationRequest[];
  status:
    | "draft"
    | "ready"
    | "applying"
    | "applied"
    | "failed"
    | "cancelled";
}
```

Plan 只描述本轮要求的交付，不代表必须走完整视频生产流程。Generation Run 拥有独立的 durable 状态；当自动生成关闭或本轮不允许生成时，plan 可以在完成画布搭建后进入 `applied`，不等待生成。

`CanvasAgentOperation` 使用语义类型，例如：

- `createCreativeBrief`
- `createStoryboard`
- `createGenerationBranch`
- `bindReference`
- `groupNodes`
- `arrangeSubgraph`
- `updateShotSpec`
- `removeAgentCreatedSubgraph`

Plan resolver 为临时引用分配真实 ID，解析 Route，编译提示词，并展开为现有 `CanvasMutationBatch`。Plan validator 在执行前检查：

- `projectId` 与 Agent 会话绑定一致；
- `baseRevision` 是否仍然有效；
- 节点和引用是否属于当前项目；
- 拓扑是否满足连接规则且无非法环；
- Route 的输入槽位和参数是否完整；
- 节点数量、并发、媒体大小和文本长度限制；
- operation 是否超出本轮 `allowedStages`；
- 调用生成时项目的 `allowAgentGeneration` 是否开启。

### 7.3 项目作用域必须在服务端绑定

当前 `createPipelineAgentSession(projectId)` 最终只用项目根目录创建普通 Agent session，而现有 Pipeline 工具让模型在参数中自行提交 `projectId`。这个边界不够可靠，也增加了模型调用负担。

推荐每个 Pipeline 项目关联一个独立、持久的 Agent conversation。`pipeline_agent_sessions.project_id` 使用唯一约束，打开项目时恢复对应聊天；创建项目时可以立即创建关联，也可以在首次打开 Agent 面板时延迟创建，但产品上始终表现为一对一关系。

Pipeline Agent session 持久绑定 `pipelineProjectId`，工具闭包从服务端上下文获得项目 ID，并从模型可见参数中移除该字段。所有节点、资产、计划和生成操作都再次校验项目归属。

跨项目隔离必须同时覆盖：

- 聊天消息、压缩摘要和附件；
- 当前模型与自动生成设置；
- creative brief、continuity bible 和用户确认事实；
- Agent plans、actions、运行引用和工具结果；
- 画布 context 查询与资产读取。

Agent 在每轮开始时读取当前 canvas revision、选区和相关子图，不能只依赖历史消息判断“当前上下文”。用户在画布上的手动修改需要在下一轮被重新感知。

### 7.4 Agent 模型配置

- 每个项目的 Agent conversation 保存当前 `provider`、`modelId` 和可选 thinking level。
- 面板头部提供紧凑模型选择器，当前模型始终可见。
- 切换模型从下一轮生效，历史消息、项目事实和画布上下文继续保留。
- 如果模型不支持图片输入或工具调用，UI 应说明具体缺失能力，并阻止选择为 Canvas Agent 模型。
- 模型配置是项目会话偏好；不同项目可以使用不同模型，互不影响。
- 模型不能成为项目知识的存储位置。跨模型连续性来自持久化聊天、摘要和结构化项目事实。

### 7.5 工具设计

第一版建议控制在 8 至 10 个稳定的语义工具：

| 工具 | 作用 |
| --- | --- |
| `canvas_get_context` | 获取项目摘要、选区和相关子图 |
| `canvas_inspect_assets` | 分析指定图片、视频、音频或文档 |
| `canvas_get_capabilities` | 查询可用 Route、输入槽位和约束 |
| `canvas_create_plan` | 创建结构化计划草稿 |
| `canvas_apply_plan` | 原子应用可逆画布修改 |
| `canvas_update_plan` | 根据反馈局部修订计划和子图 |
| `canvas_prepare_generation` | preflight 并生成审阅数据 |
| `canvas_run_generation` | 在 intent 和项目开关均允许时执行生成请求 |
| `canvas_get_run_status` | 读取计划和生成状态 |
| `canvas_undo_action` | 撤销一次 Agent action |

不要把 repository 的每个 CRUD 方法都暴露为工具。细粒度工具会增加调用步数、无效中间状态和模型犯错面。

### 7.6 Revision、并发与幂等

- 每个计划记录 `baseRevision`。
- 应用前 revision 已变化时，先判断变化是否与计划涉及节点相交。
- 无冲突时服务端重建 mutation 并 rebase；有冲突时暂停并说明用户刚修改了哪些对象。
- 每个 plan、Agent action、tool call 和 generation request 使用稳定 idempotency key。
- 一个 Agent action 通过单个 `CanvasMutationBatch` 原子提交。
- Agent 运行期间用户仍可编辑无关节点，不能用全画布锁阻塞手动操作。

### 7.7 持久化

新增 SQLite 实体建议包括：

- `pipeline_agent_sessions`：Agent conversation 与 project 的一对一绑定、当前模型和生成权限。
- `canvas_agent_plans`：计划、base revision、摘要、状态和审阅信息。
- `canvas_agent_actions`：一次原子画布改动、前后 revision、逆向 mutation 或恢复快照引用。
- `canvas_agent_events`：面向恢复和审计的紧凑事件记录。
- `project_creative_briefs`：项目目标和约束。
- `project_continuity_bibles`：角色、产品、场景和风格连续性设定。

聊天消息、附件引用、压缩摘要和工具结果需要随项目持久化。聊天历史不应成为项目事实的唯一存储；brief、continuity bible、计划和用户最终选择也要结构化持久化。任何 context assembler 查询都带服务端绑定的 project ID，禁止跨项目召回。

### 7.8 事件与前端同步

Agent SSE 展示对话、思考阶段和工具步骤；Pipeline SSE 继续发布节点和生成状态。前端按稳定的 `planId`、`actionId` 和 `runId` 关联两条事件流。

建议向用户展示阶段性状态，例如：

- 正在读取 4 个选中节点
- 正在分析产品图
- 正在编排 3 个镜头
- 已创建 11 个节点，可撤销
- 等待确认 6 个生成任务
- 第 2 个视频生成失败，可重试

不要暴露模型的原始思维链。展示可验证的动作、依据、假设和工具结果即可。

## 8. 技术选型比较

| 方案 | 优点 | 主要代价 | 本项目建议 |
| --- | --- | --- | --- |
| 现有 Pi Agent + 自有计划执行器 | 已有会话、SSE、工具、模型配置和 UI；最少迁移；可保持供应商无关 | 需要自行实现 plan 状态与生成权限 | **第一版采用** |
| LangGraph | checkpoint、interrupt、human-in-the-loop、恢复和 time travel 完整 | 新运行时、新状态模型、新依赖；与现有 Agent session 和 SQLite 能力重叠 | 未来复杂编排达到阈值后评估 |
| Vercel AI SDK Agent | TypeScript 体验好，工具循环和审批能力成熟 | 会替换或包裹已有 Pi runtime；迁移 Chat 与事件协议成本高 | 不采用 |
| Temporal | 长任务恢复、重试和 durable execution 很强 | 需要独立服务和 worker，超出本地单用户桌面产品当前复杂度 | 不采用 |
| MCP 作为内部总线 | 工具边界标准化，可供外部 Agent 复用 | 内部调用增加协议层，无法替代业务校验和事务 | 内部不采用；未来可把稳定工具向外导出 |

LangGraph 的官方文档确认它擅长 checkpoint、interrupt、human-in-the-loop 和故障恢复；这些能力在未来长时间、多阶段 Agent 工作流中有价值。[LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)

Temporal 提供跨进程、跨故障的 durable execution，但需要把 workflow 与有副作用的 activity 分开运行。对当前本地 Next.js + SQLite 桌面应用，这会带来明显的部署和运维负担。[Temporal 官方文档](https://docs.temporal.io/)

当前阶段选择现有 runtime 不代表把长任务放在内存中。Canvas plan、审批和 Generation Run 仍必须在 SQLite 中持久化，进程重启后由 application service 恢复。

## 9. 与当前代码的对应关系

### 9.1 可以直接复用

- `AgentService` 与 `AgentToolProvider`：会话、tool loop 和工具适配边界。
- `CanvasStudioService.getState`：画布快照读取。
- `CanvasStudioService.applyMutationBatch`：revision 校验和原子 mutation 入口。
- `CanvasMutationBatch`：Agent action 的最终执行协议。
- Canvas store 的 `past` / `future`：前端 Undo/Redo 基础。
- `CanvasStudioService.preflightWorkflowNode`：运行前检查基础。
- Generation Run、参数审阅和 durable worker：付费生成执行基础。
- Route Schema、prompt compiler、显式引用 role 与 generation provenance。
- Pipeline SSE：画布和生成状态同步。

### 9.2 必须替换或扩展

现有 `PipelineAgentToolProvider` 的 7 个工具仍围绕旧阶段模型：分析剧本、提取分镜、生成资产图、生成分镜图、生成视频、选择 take 和读取阶段状态。它不能直接操作当前媒体画布，也不能利用 selection、revision、mutation batch、Route Schema 和 Undo。

需要：

- 用 project-bound Canvas Agent tools 替代旧阶段工具作为 Studio 的主入口。
- 保留旧工具背后的 script/storyboard service，并把它们降为 planner 可调用的领域能力。
- 建立 Agent plan 和普通画布 mutation 之间的 application service。
- 把 Agent 面板放入 `src/features/pipeline-studio`，layout 只做面板组合。
- 将 Agent 创建的修改作为一个 action 写入历史，支持完整撤销。

## 10. 不建议的实现方式

1. **让模型直接调用大量 CRUD 工具。** 容易产生半套节点、断线和难以撤销的状态。
2. **让模型直接生成底层 `CanvasMutation[]`。** 数据结构正确不等于业务语义正确，且会把稳定 ID、Route 和布局细节暴露给模型。
3. **把所有知识塞进超长 system prompt。** Route 和节点能力会变化，应由工具按需查询。
4. **把 Agent 会话当作项目记忆。** 压缩、分支和模型切换会让事实漂移。
5. **把规划做成固定全流程。** 用户只要求剧本时继续生成分镜或视频，属于意图理解失败，而不是更强的自动化。
6. **默认每一步都询问确认。** 这会把手动疲劳换成审批疲劳。
7. **开启自动生成后默认运行所有生成。** 开关只代表权限；是否生成仍由本轮要求决定。
8. **第一版就采用多 Agent。** 导演、编剧、分镜师等角色可以是 planner 内的结构化步骤；多 Agent 会增加延迟、成本和调试难度，却不直接改善画布闭环。
9. **先做通用自治 Agent，再补画布规则。** 连接、引用、Route 和持久化约束必须先成为可靠工具边界。

## 11. 分阶段路线

### Phase 0：Agent 基础边界

目标：让 Agent 安全、准确地理解当前画布。

- Pipeline Agent session 与 project 强绑定。
- 每个项目一个独立的持久 Agent conversation。
- 可收起的右侧停靠面板和多轮会话恢复。
- 项目级模型选择与自动生成开关。
- selection、`@` 引用和相关子图 context assembler。
- `canvas_get_context`、`canvas_get_capabilities`。
- 画布对象摘要和工具事件展示。

验收：用户可以询问“这组节点在做什么”“为什么这个视频不能运行”，答案来自实际画布和 Route 规则。

### Phase 1：计划并搭建画布

目标：首先消除手动建节点、写基础提示词和连线的疲劳，不触发付费生成。

- `CanvasAgentPlan`、validator、resolver、executor。
- `CanvasAgentTurnIntent` 与服务端执行范围校验。
- 创建 brief、shot plan、文本/图片/视频节点、引用、分组和布局。
- Agent action 原子提交与 Undo。
- revision 冲突处理。
- 计划预览与局部修改。

验收：一句广告需求可以生成完整、可编辑且刷新后可恢复的三镜头画布结构。

### Phase 2：素材分析与连续性

目标：让用户直接带素材交流。

- 图片分析。
- 视频关键帧和镜头摘要。
- 音频转写与节奏摘要。
- creative brief 和 continuity bible 持久化。
- 资产角色建议与显式引用绑定。

验收：上传产品图和参考视频后，Agent 能解释其判断，建立引用，并在用户纠正后更新相关计划。

### Phase 3：生成编排

目标：从可编辑计划安全进入生产。

- Route 选择和 provider-specific prompt compile。
- 批量 preflight 与 `allowAgentGeneration` 服务端权限检查。
- DAG 运行、并发、取消、重试和恢复。
- 结果比较、选择和局部重跑。

验收：开关关闭时 Agent 无法直接或间接触发生成，开关开启且本轮明确要求生成时可以执行；应用重启或页面刷新不丢失计划和生成状态，失败节点可单独恢复。

### Phase 4：高级协作与 Skills

目标：提升重复任务效率。

- 自动生成任务的可选预算、节点数和并发限制。
- 可复用 plan 模板与项目 Skills。
- 从成功子图保存工作流。
- Agent 自动诊断断线、过期结果和低质量分支。
- 可选的批量变体与多方向探索。

## 12. 评估与验收指标

### 12.1 产品指标

- 从首次描述到出现可编辑 storyboard 的时间。
- 完成同一任务所需的手动节点创建、连线和提示词编辑次数。
- 计划首次接受率与局部修改率。
- Agent 超出本轮要求继续执行的越界率，目标应接近零。
- Agent action 的 Undo 率。
- 用户对 Agent 推荐 Route 的覆盖率。
- 因无效输入、错误引用或错误 Route 造成的生成失败率。
- 被丢弃的生成数量和估算浪费。
- 从失败节点恢复而无需重跑整图的比例。

### 12.2 自动化评估

不要用提示词文本完全一致作为断言。测试应验证结构与约束：

- 计划输出通过 schema validation。
- 每个生成节点的必填引用和 Route 输入槽位完整。
- 临时 ID 全部解析，节点与边属于当前项目。
- 计划没有非法边、重复引用或不允许的环。
- revision 冲突不会覆盖用户修改。
- 同一 idempotency key 不会重复创建节点或生成任务。
- 删除、覆盖锁定内容和外部发布不会绕过现有产品安全规则。
- `allowedStages` 不包含生成时不会创建 Generation Run。
- `allowAgentGeneration` 关闭时，Agent 工具不能直接或间接创建 Generation Run。
- 切换 Agent 模型后能继续同一项目的历史对话和结构化上下文。
- 不同项目的消息、摘要、附件、事实和工具查询严格隔离。
- 应用计划和撤销后，画布回到等价状态。

建议用三个真实任务建立回归集：产品广告、固定角色短片、长脚本批量分镜。每个任务同时测试空画布、带参考资产和人工修改后的增量迭代。

## 13. 第一版明确边界

第一版包括：项目独立的持久多轮对话、模型切换、画布读取、意图范围约束、素材分析、脚本/分镜规划、节点与引用搭建、提示词编译、自动生成权限开关、生成运行和局部迭代。

第一版暂不包括：

- 自动完成精剪、混音和最终发布。
- 自主联网寻找可能有版权风险的素材。
- 多 Agent 角色会议。
- 跨项目长期个性记忆。
- 云端多人实时协作。
- 无预算上限的全自动生成。

这些边界能让第一版直接解决用户的主要疲劳，同时把工程重点留在可恢复、可审阅、可撤销的核心闭环上。

## 14. 推荐的下一项设计工作

具体实施顺序见：[Pipeline Studio Canvas Agent 开发计划](./canvas-agent-development-plan.md)。

进入实现前，应先完成一份 `CanvasAgentPlan` 领域设计，确定：

1. plan、operation、generation request 和 permission 的 TypeScript discriminated union；
2. `CanvasAgentTurnIntent` 的识别、覆盖和服务端校验规则；
3. 每类 operation 如何解析为 `CanvasMutationBatch`；
4. 一项目一 conversation 的创建、恢复、模型切换与隔离合同；
5. `allowAgentGeneration` 的持久化和执行拦截位置；
6. Agent action 的 Undo 数据；
7. revision 冲突与局部 rebase 规则；
8. 右侧面板中的 plan、action 和 run 状态模型；
9. Phase 1 三个端到端验收用例。

这是比先画聊天面板或先增加更多工具更重要的下一步，因为它决定 Agent 是否能够可靠地“操作画布”，而不是只会描述自己想做什么。
