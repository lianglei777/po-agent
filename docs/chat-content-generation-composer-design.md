# Chat Composer 内容生成能力设计

> 状态：Draft，等待 Review
> 日期：2026-08-13
> 适用范围：Po Agent Chat、Content Generation 与统一 Session 工作区
> 关联文档：`PRODUCT.md`、`DESIGN.md`、`docs/architecture.md`、`docs/ai-driven-content-generation-design.md`、`docs/adr/0001-unified-session-and-generation-runtime.md`

## 1. 摘要

Po Agent 将保留 Chat 作为默认对话入口，并在 Chat Composer 中增加内容生成能力选择。用户可以选择：

1. 普通对话；
2. 内容生成自动选择；
3. 某个已启用的具体内容生成 API（Generation Route）。

具体 API 按供应商分组展示，选中值是稳定的 `routeId`。内容生成还提供“直接执行”和“执行前确认”两种二级执行策略。

内容生成模式只表示本 Session 已开放生成能力，不表示每条消息都必须生成。无明确生成意图的普通文字始终按普通 Chat 处理。附件是否发送给聊天模型、是否作为生成素材、是否需要澄清，由服务端在提交前根据用户意图、模型能力和 Route Schema 决定。

内容生成模式下不使用一个无语义的通用附件集合。Composer 必须根据 Route Schema 展示图片、视频、音频或具名素材槽位，并按槽位规则校验类型、数量、大小和必填要求。

第一阶段保留现有 Generate 视图，不删除或重构其现有流程。

## 2. 背景与问题

当前 Chat 附件入口由聊天模型的多模态能力控制。模型只有在 `input` 声明包含 `image` 时，用户才能附加图片。这个规则适合“让聊天模型理解图片”，但无法覆盖以下场景：

- 当前聊天模型是纯文本模型；
- 系统已经接入图生图、图生视频或多模态视频 API；
- 用户希望在新 Session 的第一条消息中直接上传素材并发起生成。

聊天模型能否理解素材，与内容生成供应商能否使用素材，是两种独立能力：

- 聊天模型能力决定附件能否作为模型多模态输入；
- Generation Route Schema 决定附件能否作为内容生成素材。

产品需要允许用户显式开放内容生成能力，同时避免以下问题：

- 开启生成后，普通文字被误判为生成请求；
- 纯文本模型收到不支持的图片、音频或视频；
- 意图不明确时误触发可能计费的任务；
- 自动模式静默选择供应商或 API，用户无法确认实际执行路径；
- 指定 API 后，系统在后台偷偷切换到其他 API；
- 附件未按 Route 的具体素材槽位绑定。

## 3. 目标

本设计需要实现以下目标：

- Chat Composer 成为普通对话和内容生成的统一自然语言入口；
- 新 Session 默认保持简单的普通对话状态；
- 用户可选择自动路由或明确指定具体内容生成 API；
- 所有可用具体 API 按供应商分类展示；
- 内容生成附件输入严格由 Route Schema 驱动；
- 纯文本聊天模型仍可协助发起图生图、图生视频等任务；
- 普通文字在任何内容生成选择下仍能正常走 Chat；
- 生成意图、参数候选可以由模型识别，但最终执行受确定性规则控制；
- 第一次输入即可创建 Session、上传素材并发起生成；
- 复用现有 Generation Run、Provider Job、Artifact、Worker 和 Route 体系。

## 4. 非目标

第一阶段不包含：

- 删除 Generate 视图；
- 允许普通对话模式上传任意文件；
- 为 PDF、Office、压缩包或代码文件建立通用解析系统；
- 自动执行用户没有明确要求的内容生成；
- 绕过已有付费授权、Provider 开关或 Route Schema；
- 同一 Session 内并行运行多个 Chat 或 Generation 请求；
- 允许模型直接传递供应商字段、本地绝对路径或不受控 URL；
- 通过前端关键词列表独立决定最终执行路径。

## 5. 产品状态模型

### 5.1 一级选项：Composer 模式

```ts
type ComposerMode =
  | { type: "chat" }
  | { type: "generation-auto" }
  | { type: "generation-route"; routeId: string };
```

- `chat`：普通对话，不开放内容生成路由。
- `generation-auto`：识别到明确生成意图后，由系统从可用 Route 中选择具体 API。
- `generation-route`：识别到明确生成意图后，严格使用用户选择的 Route。

新建 Session 必须初始化为 `{ type: "chat" }`，不得继承上一个 Session 的选择。

内容生成选择可以在当前 Session 生命周期内保持，直到用户主动切换。普通文字走 Chat 后，不应自动清除当前内容生成选择。

### 5.2 二级选项：生成执行策略

二级选项仅在 `generation-auto` 或 `generation-route` 下显示：

```ts
type GenerationExecutionPolicy = "direct" | "review-first";
```

- `direct`：意图明确且所有确定性校验通过时直接创建 Generation Run；
- `review-first`：先展示完整 Route、素材和参数确认卡，用户确认后创建或推进 Run。

现有文案调整为：

- `Automatic` → `直接执行`；
- `Review first` → `执行前确认`。

该选项只控制已经确认属于内容生成的请求，不影响普通 Chat。

## 6. Composer 交互设计

### 6.1 单入口 Popover

Chat 工具栏只保留一个稳定宽度的“内容生成”按钮，不并列展示总开关、API Select 或执行方式 Select。按钮关闭时使用中性样式；开启时使用轻量选中态，并通过 Tooltip 显示当前 API 与执行策略。

点击按钮打开单层 Popover：顶部 Switch 控制是否开放内容生成能力；其下紧邻“执行前确认”Switch，再下方是默认开启的“自动选择生成 API”Switch。关闭自动选择后才按 Provider 分组展开“具体生成 API”Route Radio 列表。Popover 不嵌套第二层 Select。“内容生成”“执行前确认”和“自动选择生成 API”的解释由标题旁可聚焦的问号图标通过 Tooltip 提供，不占用常驻空间。

```text
内容生成                    [?]              [Switch]
执行前确认                  [?]              [Switch]

自动选择生成 API            [?]              [Switch]

  （关闭自动选择后显示）
  具体生成 API
  RunningHub
    ○ Seedream · 文生图
    ○ Seedream · 图生图
    ○ Seedance · 文生视频
    ○ Seedance · 图生视频

```

首次开启使用自动选择；同一 Session 内关闭后再次开启恢复上一次 Route。新 Session 仍初始化为关闭、自动选择和直接执行。Route Schema 素材槽位继续显示在 Composer 输入区，不放入 Popover，以保证已选素材始终可见。“自动选择”必须保留。

### 6.2 API 展示规则

Composer 只展示当前可实际使用的 Route。Route 至少需要满足：

- Route 已启用；
- Provider 已启用；
- Provider 凭据可用；
- Route 配置有效。

不可用 API 不展示为禁用项。用户在设置页面查看、启用和配置 API。

菜单按 `providerId` 分组；空分组不展示。每个选项至少展示：

- Route 名称；
- Generation Capability；
- 必要时展示产品名称。

如果没有任何可用 Route，则不展示自动选择和供应商分组，并提示当前没有可用 API。

### 6.3 普通文字行为

无论当前选择自动模式还是具体 API，只要本轮没有明确内容生成意图，就必须作为普通 Chat 处理。

示例：

```text
当前选择：RunningHub / Seedance 图生视频
用户：TypeScript 的 interface 和 type 有什么区别？
结果：普通 Chat，不创建 Generation Run。
```

本轮按 Chat 处理后，Composer 仍保持原来的内容生成选择。

## 7. Route Schema 驱动的素材输入

### 7.1 基本原则

内容生成模式下，Composer 根据 Route Schema 显示图片、视频、音频或具名素材槽位，不使用一个无法表达槽位语义的通用附件列表。

`GenerationAssetSlot` 是素材输入的来源：

```ts
interface GenerationAssetSlot {
  key: string;
  label: string;
  description?: string;
  mediaType: "image" | "video" | "audio";
  required?: boolean;
  multiple?: boolean;
  minFiles?: number;
  maxFiles?: number;
  maxFileSizeBytes?: number;
  acceptedTypes?: string[];
}
```

UI 必须表达：

- 素材槽位名称和说明；
- 图片、视频或音频类型；
- 是否必填；
- 已添加数量和最大数量；
- 接受的真实 MIME 类型；
- 单文件大小限制；
- 添加、替换和移除操作。

例如，一个首尾帧视频 Route 应展示两个不同入口：

```text
首帧图片 *   [选择图片]
尾帧图片     [选择图片]
```

不能把两张图片放进统一附件列表后再让系统猜测其槽位。

### 7.2 指定 API 模式

指定 Route 后可以直接读取完整 Schema，因此立即渲染该 Route 的全部素材槽位。

附件只能绑定到用户操作的具体槽位。上传和创建 Run 时必须保留 `slot`：

```json
{
  "slot": "firstFrameUrl",
  "ref": {
    "type": "workspace-file",
    "relativePath": ".po-agent/generation-inputs/example.png"
  }
}
```

### 7.3 自动选择模式

自动模式在尚未确定 Route 前，无法直接渲染某个 Route 的全部槽位。因此采用渐进式流程：

1. 初始阶段根据所有可用 Route 的 Schema 和用户已表达的输出意图，展示可接受的媒体类型入口；
2. 用户提交文字，或附件与文字足以形成候选后，服务端计算可行 Route；
3. 当选出具体 Route 后，Composer/确认卡切换为该 Route 的完整具名素材槽位；
4. 已有素材按确定性规则绑定；无法唯一绑定时要求用户选择槽位；
5. 缺少必填槽位时，保留草稿并展示需要补充的具体素材入口。

自动模式不得为了避免确认而猜测具有不同业务含义的同类型槽位。

### 7.4 模式或 Route 切换

切换模式或 Route 时不得静默删除附件。

如果已有素材与新 Schema 不兼容：

- 保留草稿与本地暂存素材；
- 标记无法继续使用的素材或绑定；
- 禁止提交；
- 说明具体不兼容原因；
- 允许用户重新绑定、移除素材或切回原 Route。

## 8. 提交前规划与意图识别

### 8.1 规划结果

服务端在真正执行 Chat 或 Generation 前生成本轮计划：

```ts
type TurnPlan =
  | { type: "chat"; modelInputs: ModelInput[] }
  | {
      type: "generation";
      routeId: string;
      assets: GenerationInputAsset[];
      parameters: Record<string, JsonValue>;
      executionPolicy: GenerationExecutionPolicy;
    }
  | {
      type: "clarification";
      reason:
        | "AMBIGUOUS_INTENT"
        | "AMBIGUOUS_ASSET_SLOT"
        | "MODEL_CANNOT_READ_ATTACHMENT"
        | "GENERATION_ROUTE_MISMATCH";
    }
  | { type: "invalid"; errors: TurnInputError[] };
```

### 8.2 意图分类

```ts
type TurnIntent =
  | "normal-chat"
  | "attachment-understanding"
  | "content-generation"
  | "ambiguous";
```

内容生成意图还需要识别目标能力，例如：

- `text-to-image`；
- `image-to-image`；
- `text-to-video`；
- `image-to-video`；
- `multimodal-to-video`。

未来 Route 增加音频等能力时按同一机制扩展。

### 8.3 两层判断

语义识别必须由当前 Chat 模型完成，并读取本 Session 的最近对话和 Generation Run 摘要。不得通过关键词表或正则表达式机械判断生成意图。模型应把“为什么生成结果与原图一样”“分析上一次失败原因”等追问识别为普通 Chat；只有明确要求立即创建或变换媒体时才进入生成。无法可靠判断时返回澄清问题，不创建可能计费的 Run。

当识别为生成时，模型同时产出结合上下文的 `effectivePrompt`。持久化 Run 在 `input.originalPrompt` 保存用户原文，在 `input.prompt` 保存实际发送给 Provider 的有效提示词；Chat 中默认展示原文，并允许展开检查有效提示词。`effectivePrompt` 缺失或只是占位符时必须先要求模型纠正，仍不合格则转为澄清，不能创建付费 Run。

生成完成后的普通 Chat 追问必须能读取最近 Run 的审计快照，包括实际 Route、有效 Prompt、参数、素材、Provider Job、产物和错误。该上下文由服务端生成并以隐藏消息注入 Agent Session，不依赖前端拼接，也不在消息列表重复展示。

系统必须将语义识别和确定性判断分离。

语义识别负责：

- 是否具有明确生成意图；
- 用户想生成图片、视频还是其他产物；
- 自然语言中的参数候选；
- 自动模式下对可行 Route 的语义排序。

确定性判断负责：

- 模型是否支持对应多模态输入；
- Route、Provider 和凭据是否可用；
- Route capability 是否匹配；
- 素材类型、数量、大小和槽位是否合法；
- 参数是否满足 Route Schema；
- 用户是否已经明确授权可能计费的生成；
- workspace 路径与受控资产边界；
- 并发、忙碌和重复提交保护。

语义识别不能绕过确定性判断。

## 9. 执行决策矩阵

| Composer 模式 | 用户意图 | 模型/素材条件 | 处理方式 |
| --- | --- | --- | --- |
| 普通对话 | 普通文字 | 任意 | 普通 Chat |
| 普通对话 | 图片理解 | 模型支持图片 | 多模态 Chat |
| 普通对话 | 图片理解 | 模型不支持图片 | 保持现有限制并说明原因 |
| 内容生成自动 | 普通文字 | 无明确生成意图 | 普通 Chat |
| 内容生成指定 API | 普通文字 | 无明确生成意图 | 普通 Chat |
| 内容生成自动 | 明确生成 | 存在唯一可行 Route | 选择并显示具体 Route，进入生成流程 |
| 内容生成自动 | 明确生成 | 多个候选无法可靠区分 | 请求用户确认 Route |
| 内容生成指定 API | 明确生成 | 意图与 Route 匹配 | 使用指定 Route |
| 内容生成指定 API | 明确生成 | 意图与 Route 冲突 | 不静默切换；提示并推荐 API |
| 内容生成任一模式 | 附件理解 | 模型支持附件 | 普通多模态 Chat，不生成 |
| 内容生成任一模式 | 附件理解 | 模型不支持附件 | 拦截附件发送并请求切换模型或澄清用途 |
| 内容生成任一模式 | 意图不明确且有附件 | 任意 | 保留草稿和素材，要求澄清 |

### 9.1 不支持多模态的模型发起生成

纯文本模型可以理解：

> 使用首帧图片生成一个 8 秒的 16:9 视频。

模型不需要读取图片像素。图片作为受控 Generation Asset 绑定到 Route 槽位，实际内容交给生成 Provider。

### 9.2 不支持多模态的模型理解附件

如果用户要求：

> 分析这张图片的设计问题。

而当前模型不支持图片：

- 不把图片发送给模型；
- 不因为开启内容生成就创建 Run；
- 保留草稿和素材；
- 提示切换支持图片的模型，或明确改为内容生成请求。

## 10. 自动选择 Route

自动模式采用“确定性筛选，语义排序”的流程：

```text
文字、素材元数据和可用 Route
              ↓
       识别明确生成意图
              ↓
  根据 capability 与 Schema 筛选可行 Route
              ↓
      根据语义、默认 Route 等排序
              ↓
          得到具体 routeId
              ↓
    展示 Route、补齐槽位、校验参数
              ↓
      直接执行或进入确认卡
```

自动选择结果必须对用户可见，至少显示：

- 供应商；
- 具体 API/Route；
- capability；
- 素材槽位绑定；
- 解析后的完整参数。

用户可以在执行前更换 API。更换后按新 Route Schema 重新校验，不得沿用不兼容绑定。

## 11. 指定 API 的冲突处理

指定 API 表示用户对 Route 的明确偏好，系统不得静默改用其他 Route。

例如当前选择图生图 API，用户输入：

> 使用这张图生成一个 10 秒视频。

系统应提示当前 API 与意图不匹配，并提供：

- 切换到推荐的图生视频 API；
- 修改请求以继续使用当前 API；
- 返回普通对话。

如果用户输入普通文字问题，则直接走 Chat，不需要用户先关闭内容生成模式。

## 12. 参数解析和执行确认

系统可以从自然语言提取参数候选：

```text
用户：生成 8 秒、16:9 的视频。
候选：durationSeconds = 8，aspectRatio = "16:9"
```

最终值按以下优先级解析：

1. 用户本轮明确输入；
2. Route 默认值；
3. Schema 字段默认值。

无论执行策略如何，最终参数都必须经过 Route Schema 校验。

### 12.1 直接执行

只有同时满足以下条件才可直接创建 Run：

- 内容生成意图明确；
- 自动模式得到可靠的具体 Route，或用户已指定 Route；
- 必填素材和槽位完整；
- 参数合法；
- Provider、Route 和凭据可用；
- 本轮构成明确的生成与计费授权。

任一条件不满足时不得强行执行。

### 12.2 执行前确认

确认卡展示：

- Provider 和 Route；
- capability；
- Prompt；
- 每个素材槽位及绑定素材；
- 全部参数及最终值；
- 可能的计费/副作用提示。

用户可以修改参数、补充或移除素材、更换 API、确认或取消。参数卡不设置“高级参数”折叠，继续遵循现有 Route Schema 完整展示原则。

## 13. 第一次输入直接生成

新 Session 必须支持以下流程：

```text
新建 Session（默认普通对话）
        ↓
用户选择内容生成自动或具体 API
        ↓
按 Route Schema 添加素材并填写 Prompt
        ↓
创建持久化 Session
        ↓
上传素材到 Session 的受控目录
        ↓
意图识别、Route 和 Schema 校验
        ↓
创建或确认 Generation Run
```

用户不需要先发送一条普通 Chat 消息。

因为现有 Generation Asset 上传依赖 `sessionId`，实现时应在首次生成提交阶段先创建 Session，再上传素材。任何步骤失败时：

- 保留文字草稿；
- 保留仍可恢复的本地素材；
- 显示具体失败原因；
- 避免用户重新选择文件；
- 不留下无法归属或无法清理的生成素材。

## 14. 运行期间的并发规则

当前 Session 存在未结束的内容生成任务时，不允许继续发送普通 Chat，也不允许提交新的生成任务。

阻塞状态包括：

- `awaiting_confirmation`；
- `queued`；
- `running`；
- `cancel_requested`。

锁定期间：

- Composer 保持可见；
- 文字输入、发送、模式切换、API 选择和素材操作禁用；
- 显示具体状态和禁用原因；
- 提供确认、取消或等待等与当前状态匹配的操作；
- 已有未提交草稿不得丢失；
- Run 成功、失败或取消后恢复 Composer。

第一阶段不支持同一 Session 的并行 Chat turn、排队 Chat 或并行 Generation Run。

## 15. Chat 内的生成呈现

生成请求发生在 Chat 中时，用户保持在 Chat 视图。消息流依次呈现：

1. 用户文字和素材摘要；
2. 必要的 Route/参数确认卡；
3. Generation Run 状态；
4. Provider Task ID；
5. 取消、失败和重试操作；
6. 最终图片、视频、音频或文本产物。

UI 通过稳定 `runId` 和结构化 Run/Artifact DTO 获取状态，不解析模型自然语言或供应商原始 JSON。

## 16. Generate 视图的阶段策略

第一阶段保留现有 Generate 视图及其输入、历史、取消、重试和产物展示能力。本设计不把删除 Generate 视图作为验收条件。

第一阶段完成后再评估：

- Chat 与 Generate 两个输入入口是否造成明显重复；
- Chat 是否足以承载复杂素材槽位和完整参数；
- Generate 是否更适合转为纯任务/产物管理视图；
- 是否需要在 Chat 的生成卡片提供“在 Generate 中打开”。

任何后续删除或重构都需要独立产品决策。

## 17. 架构与职责边界

本设计复用现有依赖方向：

```text
contracts <- domain <- ports <- application <- transport
                         ^              ^
                         |              |
                  infrastructure   Chat preflight/planner
```

建议职责：

- `contracts`：Composer 提交、素材引用、规划结果和确认请求的公开结构；
- `domain`：稳定的 intent、plan、Route、asset binding 和错误类型；
- `application`：意图规划编排、可行 Route 计算、Schema 校验和 Run 创建；
- `ports`：可选的意图分类能力接口，不暴露具体模型 SDK；
- `infrastructure`：Pi/LLM 分类适配、文件暂存和 Provider 实现；
- `transport`：不可信输入解析、大小限制、MIME 和响应映射；
- `features/chat`：Composer 状态、素材槽位 UI、草稿和结果呈现；
- `features/content-generation`：共享 Route、参数、Run 和 Artifact 展示组件；
- `layouts`：只通过 props/callback 协调 Chat 与 Generate，不让 feature 互相 import。

内容生成能力判断必须来自服务端 Route、Provider 和凭据状态，不由前端复制业务规则。

## 18. 安全、合规与副作用边界

所有素材和请求必须经过：

- 文件真实类型与声明 MIME 校验；
- 文件数量与大小限制；
- Route 素材槽位校验；
- workspace 路径和受控资产边界；
- Provider、Route 和凭据可用性检查；
- 用户明确生成/计费授权；
- 重复提交与幂等保护；
- 并发、取消和失败恢复；
- 日志脱敏，禁止记录 Base64、文件内容和凭据。

在意图或素材用途不明确时，不得上传到第三方 Provider。

## 19. 错误与澄清原则

错误必须指出具体原因和可采取的操作，例如：

- 当前模型无法读取图片；
- 当前 Route 需要首帧图片；
- 当前 Route 最多接受三张参考图片；
- 文件类型不受当前素材槽位支持；
- 当前选择的是图生图，但请求意图是生成视频；
- 没有可用的图生视频 API，请前往设置启用；
- 当前生成任务正在运行，请等待或取消。

澄清或校验失败时应尽量保留草稿和素材，不应创建虚假的 Assistant 消息污染 Session 历史。

## 20. 验收标准

### 20.1 Session 与状态

- 新 Session 默认普通对话；
- 不继承上一个 Session 的生成模式；
- 新 Session 第一条消息可以直接发起内容生成；
- 内容生成选择在当前 Session 内可持续使用。

### 20.2 内容生成控件

- Chat 工具栏只出现一个内容生成按钮；
- Popover 内依次提供总开关、执行前确认开关和 API 区域；
- 自动选择必须保留；
- “自动选择生成 API”使用默认开启的 Switch，关闭后才显示“具体生成 API”；
- 内容生成、执行前确认和自动选择的说明使用问号 Tooltip；
- 具体 API 按供应商分组；
- 只展示已启用且可用的 API；
- 执行前确认默认关闭，关闭时直接执行，且只在内容生成开启时显示；
- API 与执行策略不以额外的并列工具栏控件展示。

### 20.3 普通消息

- 自动模式下，无明确生成意图的普通文字走 Chat；
- 指定 API 下，无明确生成意图的普通文字走 Chat；
- 普通文字不会意外创建 Generation Run；
- 普通 Chat 后不自动清除生成模式选择。

### 20.4 素材槽位

- 指定 API 时按 Route Schema 展示图片、视频、音频及具名槽位；
- 显示必填、数量、大小和类型约束；
- 多个同类型但不同语义的槽位不会被自动混合；
- 自动模式选出 Route 后展示完整具名槽位；
- 模式切换不静默删除已有素材。

### 20.5 意图与路由

- 自动模式只从确定性可行的 Route 中选择；
- 最终 Provider 和 Route 对用户可见；
- 指定 API 与意图冲突时提示但不静默切换；
- 意图不明确时不执行可能计费的任务；
- 所有参数和素材最终通过 Schema 校验。

### 20.6 模型能力

- 纯文本模型可以通过文字和 Generation Asset 发起图生图、图生视频；
- 附件理解请求不会把不支持的附件发给纯文本模型；
- 开启内容生成不会把附件默认发送给模型或 Provider。

### 20.7 运行控制

- Generation Run 未结束时不能发送普通 Chat；
- 不能同时提交新的生成任务；
- Composer 显示具体锁定原因；
- 当前任务可以按状态确认或取消；
- 任务结束后恢复输入，已有草稿不丢失。

### 20.8 视图策略

- 第一阶段继续保留 Generate 视图；
- 本需求不删除或替换现有 Generate 工作流。

## 21. 实施阶段建议

### 阶段一：Composer 状态与 Route 发现

- 引入 Composer 一级和二级状态；
- 新 Session 默认普通对话；
- 加载可用 Route 并按 Provider 分组；
- 只展示真正可用的 API。

### 阶段二：Schema 驱动素材槽位

- 复用或抽取现有 Generation Parameter/Asset UI；
- 指定 API 渲染完整素材槽位；
- 建立草稿素材暂存和模式切换兼容检查。

### 阶段三：提交前规划

- 增加服务端 Turn Planner；
- 实现普通 Chat、明确生成、附件理解和澄清分支；
- 自动模式实现可行 Route 筛选与语义排序；
- 指定 Route 实现冲突检测。

### 阶段四：首次生成与 Chat Run 展示

- 支持先创建 Session 再上传 Generation Asset；
- 在 Chat 中复用确认、Run、Artifact 和错误展示；
- 实现运行期间 Composer 锁定。

### 阶段五：产品验证

- 比较 Chat 与 Generate 输入流程；
- 收集自动 Route 选择和澄清频率；
- 另行决定 Generate 视图是否重构。

## 22. 已确认决策清单

- [x] 新 Session 默认普通对话；
- [x] 内容生成提供自动选择；
- [x] 所有可用具体 API 按供应商分组展示；
- [x] 不可用 API 不在 Composer 展示；
- [x] 指定 API 后，普通文字仍走 Chat；
- [x] 自动模式下，普通文字仍走 Chat；
- [x] 内容生成附件由 Route Schema 显示图片、视频、音频或具名槽位；
- [x] 生成运行期间不允许继续发送普通 Chat；
- [x] 第一阶段保留 Generate 视图；
- [x] 原有 Automatic/Review first 调整为内容生成的二级选项：直接执行/执行前确认。

## 23. Chat 执行链路补充决策

Chat 中的内容生成采用“语义规划 + 确定性工作流”，并由同一个服务端 Turn 用例编排：

1. Composer 上传素材后，通过统一 Chat Turn endpoint 提交用户文字、模式和素材引用；客户端不能提交 Planner 结果。
2. 服务端读取 Runtime 当前模型与完整历史完成语义规划。普通 Chat、澄清和明确生成是互斥的最终决策，不使用前端正则判断意图，也不让 Agent 在 Planner 判定 Chat 后再次获得生成授权。
3. 只有明确生成且通过确定性校验时，服务端才把 Route、有效 Prompt、执行前确认和素材引用转换成可执行命令；聊天模型不能覆盖这些字段，也不负责再次决定是否执行。
4. 普通问题即使开启内容生成也直接得到正常模型回复，不创建 Run；附件本身不等于生成意图。
5. 明确生成时，服务端直接创建 Generation Run，并在同一 Pi Session 持久化用户消息、标准 Assistant Tool Call 与 Tool Result；前端对新轮次只渲染真实消息，旧会话才按 Run 做兼容投影。用户原文只显示一次，确认、运行更新、Provider Job 和最终产物复用普通对话的执行过程。该流程不依赖聊天模型实际发起 Tool Call，也不占用长时间 Agent Prompt。
6. 生成步骤允许展开查看服务端解析后的完整输入、脱敏后的 Provider 请求和完整 Provider 响应。用户原始文字保存在用户消息和 `originalPrompt`，模型整理后的自包含 Prompt 保存在 `input.prompt`，两者不得互相覆盖。
7. 新建 Runtime 返回前必须完成 Generation Session 投影；页面恢复通过统一 Turn Snapshot 同时获得 Agent 和 Generation Run 状态。
8. 上传素材的可见元数据作为隐藏的 Session 自定义消息持久化，并与其后的用户消息关联，因此刷新、切换会话后仍显示在原用户气泡中；素材引用不会因为聊天模型缺少视觉能力而作为原生多模态输入发送给它。
9. 每个 Turn 具有稳定 `turnId`；用户消息和 Run 通过该标识关联，重复提交复用相同幂等键，不得产生第二个 Provider Job。
