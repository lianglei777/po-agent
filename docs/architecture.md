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

### Transport

位置：`src/server/transport`

负责外部协议：

- JSON 输入验证
- `AppError` 到 HTTP 响应的映射
- SSE 编码、心跳和资源清理

Transport 可以调用或描述 application 输入，但不直接访问 infrastructure。

### Composition

位置：`src/server/composition`

Composition Root 构造 infrastructure，实现依赖注入，并暴露 application services。除测试外，具体 infrastructure 类只应在这里组装。

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
src/features/files
src/features/model-providers
src/features/sessions
src/features/skills
src/layouts/agent-workspace
```

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

内容生成 Run 和供应商 Job 使用 `node:sqlite` 持久化。任务编排和状态机位于 application，SQLite、RunningHub、文件系统和凭证存储分别通过 ports 隔离。进程内 Worker 由 composition 启动，只通过 application 和 ports 推进 Job，不允许 Route Handler 或供应商 adapter 直接修改任务状态。

浏览器原始素材先经受控资产接口写入 workspace 的 `.po-agent/generation-inputs/`，再以 workspace-relative `AssetRef` 创建 Run。直接生成 UI 只读取持久化 Run view；它不会直接调用 RunningHub 查询接口。显式重试保留 Run，并原子新增带独立幂等键的 Provider Job。

当前部署要求长期运行的 Node.js 进程。Electron 和自托管 Next.js 满足该约束；若迁移到 Serverless，必须先将 Worker 替换为独立常驻执行器或托管队列。

### 安全

当前服务面向本机单用户、单进程运行，不具备公网多租户认证边界。任何扩大部署范围的改动都必须先设计认证、授权、路径隔离、速率限制和凭证保护。

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
