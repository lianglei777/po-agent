# Po Agent Architecture

本文档定义项目的稳定模块边界。它描述的是代码应该如何增长，而不是逐个文件解释实现。

## 目标

- 让业务用例不依赖 Next.js、Node.js 或 Pi SDK 的具体实现。
- 让 HTTP、SSE、文件系统和 SDK 变化局限在各自边界内。
- 让 AI 和开发者能够快速判断新代码应该放在哪里。
- 让关键边界可以由 ESLint、TypeScript 和测试自动验证。

## 总体结构

```text
src/app/api
    |
    v
transport ------> application ------> ports <------ infrastructure
    |                  |                 |                 |
    +-----------------> domain <---------+-----------------+
                           ^
                           |
                      composition
```

实际依赖原则：

```text
contracts <- domain <- ports <- application
domain/application <- transport
domain/ports <- infrastructure
application/infrastructure <- composition
composition/transport/domain <- app/api
contracts <- features/layouts
```

`composition` 不是业务层，它是唯一负责把接口和具体实现组装起来的生产入口。

## 层级职责

### Shared Contracts

位置：`src/contracts`

定义浏览器与服务端共同理解的 HTTP 请求、JSON 响应和 SSE 事件，是 domain 与前端都可以依赖的纯 TypeScript 底层。合同不得依赖 `src/server`、feature、layout、React、Next.js、Node.js 或供应商 SDK。

只有线上可序列化结构进入 contracts。服务端端口、运行时对象、文件流和应用内部输入继续位于 server；表单草稿、加载状态和展示模型继续位于对应 feature。公开合同字段不得在 domain 或 feature 中重复定义。

### Domain

位置：`src/server/domain`

负责稳定的业务数据、命令、事件、状态和错误。Domain 不应该知道：

- Next.js、React 或 HTTP
- 文件系统和进程 API
- Pi SDK 或其他供应商 SDK
- 依赖注入和对象构造

Domain 内部可以互相引用，但应保持类型和规则简单明确。

### Ports

位置：`src/server/ports`

Ports 是 application 所需要的能力接口，例如 Session 存储、Agent Runtime、凭证和文件访问。接口由应用边界拥有，具体实现由 infrastructure 提供。

新增外部能力时，先定义最小接口，再实现适配器。不要把 SDK 类型暴露到 port。

### Application

位置：`src/server/application`

Application Service 编排用例和业务流程，只依赖 domain 和 ports。它可以使用无副作用的 Node.js 标准能力，例如生成 UUID，但不能：

- import infrastructure
- import Pi SDK
- 构造具体 repository、registry 或 provider
- 处理 Request、Response 或 SSE 编码

### Infrastructure

位置：`src/server/infrastructure`

负责实现 ports，包括：

- Pi SDK 适配器
- Node.js 文件系统
- `node:sqlite` Repository 与 schema migration
- RunningHub 内容生成适配器
- 子进程执行
- 进程内 registry

SDK 类型、文件格式和供应商差异必须在这一层转换成项目自己的 domain 类型。

内容生成供应商在 infrastructure 内拥有各自的 Adapter、受信 Catalog、请求映射与资产准备协议。Catalog 编译为供应商无关的 `GenerationRoute` 和可持久化 execution config；不同供应商不共享任意 HTTP DSL，也不能从客户端或数据库动态注册生产 Provider。供应商准备后的素材引用对 domain/application 保持不透明，可以是 URL、文件 ID 或临时对象存储引用。

Web 搜索和网页抓取由 infrastructure 内置的 `pi-web-access` Extension 提供。Po Agent 固定并随应用发布该依赖，由 Pi ResourceLoader 直接加载，不进入用户 Skill Pack 安装流程。正常 Session 始终开放 `web_search`、`fetch_content`、`get_search_content` 和 `source_check`；搜索供应商、API Key 和回退顺序保存在 `<PI_CODING_AGENT_DIR>/web-search.json`，由独立的 Web Access 设置端口管理并通过 `/api/web-access` 暴露给本机设置页。配置写入后，存活 Runtime 会在下一次 Prompt 前重新加载 Extension。远程内容按不可信数据处理，Po Agent 禁止 `fetch_content` 读取本地路径，本地文件仍必须经过已注册 workspace root 的文件能力。

### Transport

位置：`src/server/transport`

负责外部协议：

- JSON 输入验证
- `AppError` 到 HTTP 响应的映射
- 未知 HTTP 异常的请求关联与脱敏诊断日志
- SSE 编码、心跳和资源清理

Transport 可以调用或描述 application 输入，但不直接访问 infrastructure。

### Composition

位置：`src/server/composition`

Composition Root 构造 infrastructure，实现依赖注入，并暴露 application services。除测试外，具体 infrastructure 类只应在这里组装。

内容生成 Provider Module 的固定列表也由 Composition 汇总。新增同协议模型只修改对应 infrastructure Catalog；新增供应商时增加一个 Provider Module，并在受信列表中注册一次。

Provider Module 同时声明稳定 ID、展示名称和可选凭据描述。Composition 据此构造只读 Provider Directory；application 的 Provider Settings Service 负责校验受信 `providerId`、读写总开关并把 Provider 映射到服务端 credential ref。动态 Route Handler 和设置 UI 只传递 `providerId`，不能自行指定 credential ref、环境变量或供应商网络配置。Composer 的 Route 可用性也从同一 Directory 与凭据状态计算，不维护供应商专用 Map。

### Next.js Route Handlers

位置：`src/app/api`

Route Handler 应保持很薄，通常只做：

1. 获取 path、query、header 或 JSON body。
2. 调用 transport validator。
3. 委托给 container 中的 application service。
4. 使用统一 HTTP 或 SSE helper 返回结果。

不要在 Route Handler 中实现业务规则、直接调用 Pi SDK 或构造 repository。

## 前端边界

```text
src/app          Next.js 页面、布局和 Route Handler
src/contracts    前后端共享的 HTTP 与 SSE 合同
src/components/ui 无业务语义的通用 UI primitive
src/features     按业务能力组织的组件、hook、类型和常量
src/layouts      应用级页面骨架和 feature 组合
src/lib          浏览器与共享 UI 工具
```

- 页面和布局默认使用 Server Component。
- 只有需要交互或浏览器 API 的最小边界使用 `"use client"`。
- 前端不得 import `src/server`。浏览器通过 `src/contracts` 描述的 `/api` 合同与后端交互。
- 通用 UI primitive 放在 `src/components/ui`，不得依赖 feature 或 layout。
- 业务组件放在 `src/features/<feature>`。feature 不得依赖 layout，也不直接
  依赖其他 feature。
- 应用骨架放在 `src/layouts`，只负责组合 feature 和管理布局级状态。
- 跨 feature 交互通过 layout 中的 props、callback 和共享状态协调。
- 一个 hook 或组件承担多个独立工作流时，按职责拆分，而不是按任意行数拆分。

当前前端结构：

```text
src/components/ui
src/features/chat
src/features/content-generation
src/features/files
src/features/instructions
src/features/model-providers
src/features/sessions
src/features/skills
src/layouts/agent-workspace
```

### 前端状态管理

Zustand Store 按拥有状态的业务边界就近放置，不建立承载所有状态的全局
`src/store`：

- 跨 feature 的工作区选择、面板协调和布局偏好放在
  `src/layouts/agent-workspace/state`。
- 仅在单个 feature 内由多个组件共享的业务状态放在
  `src/features/<feature>/state`，并由 feature Provider 创建独立 Store 实例。
- Store 保存可观察的状态和原子业务转换；请求、SSE、AbortController、定时器和
  DOM observer 等副作用生命周期保留在 feature controller hook 或组件中。
- Store 消费者只订阅当前职责需要的字段；组合选择多个字段时使用浅比较，避免无关
  状态变化扩大组件重渲染范围。
- 输入草稿、单个弹窗、hover、复制提示、DOM 节点和尺寸测量等组件私有状态继续使用
  React 本地状态，不为消除 `useState` 而迁入 Zustand。
- Next.js 中禁止使用模块级单例 Store 承载请求相关状态。Provider 应尽可能靠近实际
  消费边界，避免 SSR 请求、测试或多个 Workspace 实例之间共享状态。

当前 Chat、Content Generation、Files、Instructions、Model Providers、Sessions 与
Skills 均在各自业务边界内维护 Zustand Store；跨模块的工作区协调状态仍由 Workspace
Store 负责。组件私有草稿、短暂视觉反馈及副作用句柄不属于迁移目标。

## 横切规则

### 错误处理

可预期错误使用 `AppError` 和稳定错误码。未知错误由 transport 统一转换为 `INTERNAL_ERROR`，不要在每个 Route Handler 重复 try/catch。

### 输入验证

所有来自 HTTP、URL、用户输入和外部 SDK 的数据都需要在边界处解析。Application 接收已经规范化的输入。

### SSE

所有 SSE 流必须处理：

- heartbeat
- 客户端断开
- cleanup 回调
- AbortSignal
- stream close

修改 SSE helper 或订阅逻辑时必须增加生命周期测试。

### 持久化后台任务

Pipeline Studio 使用可迁移的本地项目目录。创建项目时，用户指定目标目录；
`.pipeline-studio/project.json` 标识项目格式，`.pipeline-studio/project.sqlite` 保存项目、画布、
节点和工作流等结构化数据，`assets/imports/`、`generated/` 与 `exports/` 保存资源和产物。
全局 `pipeline-projects.json` 只是最近打开路径索引，不是项目内容的事实来源。Pipeline application
继续依赖 `PipelineRepository` port，由本地项目 repository 根据项目索引打开对应 SQLite；Route Handler
不得直接访问项目数据库。项目路径在 composition 中注册为 workspace root，Agent 会话与生成任务均以
该项目根目录作为 cwd。首页的移除操作只删除索引，不能递归删除用户项目目录。

内容生成 Run 和供应商 Job 使用 `node:sqlite` 持久化。任务编排和状态机位于 application，SQLite、内容生成供应商、文件系统和凭证存储分别通过 ports 隔离。进程内 Worker 由 composition 启动，只通过 application 和 ports 推进 Job，不允许 Route Handler 或供应商 adapter 直接修改任务状态。Provider Module 声明该供应商的 Worker 并发上限；Worker 按 Provider 独立调度，并把查询/下载的连续可恢复错误次数、下一次执行时间和指数退避状态持久化到 Job。付费提交结果不确定时仍禁止自动重试。

Pipeline Studio 的多节点执行使用项目数据库中的 Workflow Run 和 Step 作为编排事实来源。Run 冻结选中节点与内部边的拓扑快照，Step 只关联标准 Generation Run，不复制 Provider Job 或 Artifact。调度器按拓扑推进 ready 节点；刷新或应用重启后从项目数据库和关联 Generation Run 恢复。进程内锁只用于避免同一进程重复推进，不能作为运行状态来源。项目数据库以部分唯一索引保证一个项目最多存在一个活动 Run；application 在创建首个付费 Generation Run 前预检全部步骤的静态 Route、Provider、Prompt、参数和素材槽位，并在活动期间拒绝修改运行节点的数据或连接。

浏览器原始素材先经受控资产接口写入 workspace 的 `.po-agent/generation-inputs/`，再以 workspace-relative `AssetRef` 创建 Run。直接生成 UI 只读取持久化 Run view；它不会直接调用供应商查询接口。显式重试保留 Run，并原子新增带独立幂等键的 Provider Job。

前端把 Chat 与 Generate 作为同一持久化 Session 的两个 workspace surface。新建 Session 不再选择固定模式；已有 Pi Session 可以直接创建 Generation Run。Session 列表只来自 Pi Session repository，生成状态只来自 SQLite Run/Job；旧 `content-generation.json`、通用 HTTP 模板和独立内容生成 Session 不进入生产组装。

聊天 Agent 通过项目自有 `AgentToolDefinition` port 使用 `generate_image`、`generate_video`、`get_generation` 和 `cancel_generation`。application 工具只创建或读取持久化 Run；Pi adapter 负责把稳定定义转换为 SDK `ToolDefinition`，供应商字段不会进入 Agent 工具合同。生成工具以 Session ID 与 Pi tool-call ID 组成幂等键，工具等待被中止时只停止等待，不取消已持久化的 Run。Pi tool result 的 `details` 被消息映射保留，Chat UI 直接消费结构化 Run/Artifact 数据。

Chat Composer 通过 `ChatTurnService` 提交一轮消息，不在浏览器中先调用 planner 再回传可信 Plan。该 application 用例读取 Runtime 当前模型、最近对话、Generation Run 和可用 Route，调用语义 Planner 后执行确定性校验。Planner 明确区分普通 Chat、附件理解、澄清和内容生成：普通 Chat 进入标准 Agent Loop；附件理解只向支持视觉输入的聊天模型传递原生图片；明确生成则由 `GenerationTurnExecutor` 将服务端 Plan 直接转换成持久化 Run，不再依赖聊天模型是否支持或遵守强制 Tool Call。Composer 素材由 application 层按 Route Schema 强制绑定，模型不能替换。Chat 生成请求使用稳定 `turnId` 关联 Pi Session 用户消息与 SQLite Run，并以该值构造幂等键。服务端在 Pi Session 中按顺序持久化用户消息、标准 Assistant `generate_image`/`generate_video` Tool Call 和对应 Tool Result；前端只渲染真实会话消息，旧版本只保存 Run 的会话才使用兼容投影。用户原文只显示一次，执行过程、确认动作、状态和最终产物继续复用普通 Agent Turn 结构；持久化 Run 仍是进度与产物的事实来源。

新建 Runtime 返回前必须通过 `SessionLifecycleProjector` 建立持久化 Generation Session 投影。Chat 页面通过统一 Turn Snapshot 同时恢复 Agent Runtime 和 Generation Run；SSE 与轮询只提供增量变化。服务端在接受新 Turn 前同时检查 Agent streaming/compacting 状态和活动 Generation Run，前端禁用状态不能替代该并发守卫。

Chat 的“执行前确认”是单轮执行策略，不是 Session 模式。Planner 选择 Route 后，application 可先创建 `awaiting_confirmation` Run；该状态没有 Provider Job，Worker 不会领取。application 按“字段默认值、Route 默认值、明确输入”的优先级解析并持久化完整参数。用户在 Assistant 消息动作中确认后，application 按 Route Schema 重新校验最终 Prompt 与参数，并由 repository 在同一 SQLite 事务中把 Run 切换为 `queued`、创建首个 Job。Chat 以本地 `runId` 查询持久化 Run，将最新状态投影到同一执行步骤并展示最终产物。参数动作展示 Route Schema 的全部参数，不定义或消费 `advanced` 展示字段。用户修改值不会重新交给模型转述。

Chat 工作流生成由 Worker 独立推进并由 Run 轮询恢复，不占用一次长时间 Agent Prompt。确定性编排写入的 Assistant Tool Call 会触发 Pi Session 文件创建，随后无论 Run 创建成功或失败都会写入 Tool Result 闭合该步骤；因此仅执行内容生成、从未调用聊天模型的新 Session 也能在刷新后恢复完整过程。断开页面或 Agent SSE 不会取消持久化 Run；用户确认、取消和重试都直接作用于 Run 状态机。开放式 Agent Tool 仍可使用 `generate_image`、`generate_video`、`get_generation` 和 `cancel_generation`，但统一 Composer 已确认的生成 Plan 不再经过该模型决策链路。下载产物由 application 根据最终 Prompt 生成简短名称提示，filesystem adapter 负责过滤非法字符和 Windows 保留名，文件仍隔离在对应 Run 目录。

Provider Job 在创建时冻结 Route 的 execution config 与已解析参数；资产准备、提交和轮询都使用该快照，不能在恢复时重新读取当前 Catalog 的协议语义。准备后的供应商资产引用随 Job 持久化但对 application 保持不透明，新重试 Job 会重新准备资产。Provider Job 还持久化脱敏且有大小上限的 `requestSnapshot` 与 `responseSnapshot`。凭据、密码、Cookie 字段以及 URL 查询参数中的 token、secret、authorization、签名等值在 adapter 边界替换为 `[REDACTED]`；超过上限的协议内容保留截断标记、原始字节数和受限预览。Chat 的生成工具步骤可展开查看模型工具入参、最终 Route 输入和审计快照，而不暴露凭据。

付费内容生成采用服务端纵深防护：供应商总开关与逐 Route 开关共同控制新 Run，默认关闭并持久化于 SQLite；种子 Route 升级不得覆盖用户开关。Agent 生成工具还要求本轮用户明确授权，直接 Generate UI 在创建和重试前进行费用确认。前端隐藏或 Prompt 约束不能替代 application 层的开关校验。

当前部署要求长期运行的 Node.js 进程。Electron 和自托管 Next.js 满足该约束；若迁移到 Serverless，必须先将 Worker 替换为独立常驻执行器或托管队列。

### 安全

当前服务面向单用户、单进程运行，不提供多租户权限模型。生产模式的应用页面、JSON API、SSE、文件流与媒体响应统一经过单用户访问控制；密码哈希持久化在 Pi Agent 数据目录，Session 只保存在服务端内存。`next dev` 的跳过状态只影响当前进程，不得写入生产设置。

Access Control 登录、改密和开关接口是唯一公开例外。所有 `src/app/api/**/route.ts` 必须通过 `src/app/api/_route.ts` 的 `protectedRoute` 或 `publicRoute` 进入统一 HTTP Route Pipeline；业务 API 不得直接处理鉴权、错误映射或最终 Response 策略。具体约束见 [HTTP Route Pipeline 设计](designs/http-route-pipeline.md)。公网部署仍必须由 HTTPS 反向代理终止 TLS 并限制 Node.js 服务端口。

文件访问必须经过 workspace root 校验。任何接受绝对路径或 skill 路径的接口都需要单独进行安全审查。

## 新功能放置示例

新增“导出 Session”能力：

1. 在 domain 定义导出结果类型。
2. 在 ports 扩展 `SessionRepository` 的最小能力。
3. 在 application 增加导出用例。
4. 在 infrastructure 实现 Pi Session 文件读取和映射。
5. 在 transport 增加参数验证或响应 helper。
6. 在 `app/api` 添加薄 Route Handler。
7. 分层添加测试并更新 API 文档。

## 架构变更

当需求无法自然放入现有边界时，不要悄悄跨层 import。先更新本文档，说明新的依赖方向和理由；重大、难以逆转的决定应在 `docs/decisions/` 增加 ADR。
