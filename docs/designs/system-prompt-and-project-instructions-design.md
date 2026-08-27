# 系统提示词与项目指令功能设计

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 状态 | Draft，待评审 |
| 适用产品 | Po Agent |
| 设计范围 | 全局系统提示词追加、项目 `AGENTS.md` 创建与编辑、有效提示词查看、运行时重载 |
| 不包含 | 多租户组织策略、云端同步、路径匹配规则、完整系统提示词替换 |

## 2. 背景

Po Agent 基于 Pi SDK 创建 Agent Runtime。每个 Runtime 都有一份最终有效的系统提示词，但该提示词不是单一文件，而是由以下内容动态组装：

1. Pi 默认系统提示词。
2. 用户全局追加提示词。
3. 项目上下文文件，例如 `AGENTS.md`。
4. 当前可用工具及其说明。
5. 已加载的 Skills。
6. 当前日期和工作目录。
7. Extension 在单轮请求前进行的临时修改。

当前项目已经使用 `DefaultResourceLoader`，因此底层能力已经支持：

- `~/.pi/agent/APPEND_SYSTEM.md`：向默认系统提示词追加全局内容。
- `<project>/AGENTS.md`：向当前项目的 Agent 上下文追加项目指令。
- `AgentSession.systemPrompt`：读取当前 Runtime 最终有效的系统提示词。
- `AgentSession.reload()`：重新加载系统提示词、上下文文件、Skills、Prompts 和 Extensions。

Po Agent 当前缺少的是这些能力的用户界面、安全写入接口、保存状态和运行时重载流程。

需要注意：Pi 当前的默认发现逻辑会在项目 `.pi/APPEND_SYSTEM.md` 存在时优先使用项目文件，而不再同时加载全局 `~/.pi/agent/APPEND_SYSTEM.md`。这与本设计“用户全局追加提示词作用于所有项目”的产品语义不同。实现时必须在 Po Agent 的 Pi ResourceLoader 适配层显式组合全局和项目追加来源，不能只依赖 SDK 的默认单文件发现结果。

## 3. 问题定义

用户需要完成两个相互独立但最终会合并生效的任务：

1. 为所有项目配置自己的通用指令，例如回复语言、工作习惯和全局安全偏好。
2. 为单个项目维护项目指令，例如架构约束、构建命令、测试要求和代码规范。

如果把二者放进同一个设置文件或同一个可编辑的最终提示词中，会产生以下问题：

- 无法判断某条指令属于用户还是项目。
- 项目规则不能自然进入版本控制。
- 将动态拼装结果保存回文件时，会把 Skills、工具、日期和 `AGENTS.md` 重复固化。
- 多个项目之间容易相互污染。
- 无法清楚说明修改范围和生效时间。

因此，本设计以“两个真实配置源、一个只读有效结果”为核心模型。

## 4. 设计目标

1. 用户可以在 Chat Workspace 中查看当前最终有效的系统提示词。
2. 用户可以追加或修改影响所有项目的全局提示词。
3. 用户可以在项目文件工作区创建、预览和编辑项目根目录的 `AGENTS.md`。
4. `AGENTS.md` 是项目指令的唯一真实来源，可以被 Git 跟踪并与团队共享。
5. 全局追加提示词使用 Pi 原生的 `APPEND_SYSTEM.md`，不维护重复数据库副本。
6. 保存后明确告知内容是否已经应用到当前 Runtime。
7. 所有写入必须限制在允许的位置，不能演变成任意路径写入接口。
8. UI 保持精确、安静、信息密度适中，并沿用 Po Agent 现有 Dialog、文件面板和未保存确认模式。

## 5. 非目标

第一版不实现以下能力：

1. 不允许直接编辑 Pi 默认系统提示词。
2. 不提供 `.pi/SYSTEM.md` 的完整替换模式。
3. 不支持每个 Session 独立保存一份系统提示词。
4. 不支持组织或管理员下发不可覆盖的策略。
5. 不自动分析仓库并生成完整 `AGENTS.md` 内容。
6. 不在选择项目时自动创建空 `AGENTS.md`。
7. 不实现类似 `.cursor/rules` 的路径匹配规则系统。
8. 不依靠提示词执行安全授权；文件访问、工具权限和工作区限制仍由代码强制。

完整系统提示词替换可以在后续版本作为高级能力评估，但必须与“追加提示词”明确分离，并显示可能破坏工具说明和默认行为的风险。

## 6. 核心概念

### 6.1 三种内容

| 内容 | 是否可编辑 | 作用范围 | 保存位置 |
| --- | --- | --- | --- |
| 最终有效系统提示词 | 否，只读 | 当前 Runtime | 不保存，动态生成 |
| 用户全局追加提示词 | 是 | 所有项目 | `~/.pi/agent/APPEND_SYSTEM.md` |
| 项目指令 | 是 | 当前项目 | `<project>/AGENTS.md` |

### 6.2 合并顺序

概念上的合并顺序为：

```text
Pi 默认系统提示词
        ↓
用户全局追加提示词
        ↓
当前项目 AGENTS.md
        ↓
Skills、工具、日期、工作目录
        ↓
当前用户消息
```

这里的顺序用于解释来源和冲突。安全策略不依靠顺序保证，必须在服务端和工具层执行。

### 6.3 文件命名

项目指令文件固定使用：

```text
AGENTS.md
```

不使用 `Agent.md`。这是 Pi 当前识别的文件名，也是 Coding Agent 生态正在采用的项目指令格式。

### 6.4 所有权

- `APPEND_SYSTEM.md` 属于当前本机用户，不进入项目仓库。
- `AGENTS.md` 属于项目，是否提交 Git 由用户决定。
- 最终有效系统提示词属于 Runtime，仅用于查看和诊断。

### 6.5 Pi SDK 兼容规则

Po Agent 对追加来源采用以下明确顺序：

```text
~/.pi/agent/APPEND_SYSTEM.md
        ↓
<project>/.pi/APPEND_SYSTEM.md（如果外部工具已经创建）
        ↓
AGENTS.md 项目上下文
```

Po Agent UI 第一版只管理全局 `APPEND_SYSTEM.md` 和项目根 `AGENTS.md`，不提供项目 `.pi/APPEND_SYSTEM.md` 的编辑入口。但是，为了兼容用户通过 Pi CLI 或外部编辑器创建的配置，ResourceLoader 仍应加载该文件，并在“提示词来源”中将其显示为只读外部来源。

实现时由 `createPiResourceLoader` 显式向 `DefaultResourceLoader` 传入按上述顺序解析出的 append sources。这样即使项目存在 `.pi/APPEND_SYSTEM.md`，用户全局追加提示词仍然会生效，而且不会因为 SDK 的项目优先发现逻辑被遮蔽。

## 7. 信息架构

本功能不新增独立的 Instructions 设置页面。

功能入口分为两处：

1. Workspace Top Bar 的“系统提示词”按钮：查看最终有效提示词并编辑全局追加内容。
2. File Workspace：创建、预览和编辑项目根目录的 `AGENTS.md`。

二者通过“提示词来源”区域互相跳转，但保持各自真实配置源清晰。

```text
系统提示词按钮
    │
    ├── 查看最终有效系统提示词
    ├── 编辑全局追加提示词
    ├── 查看提示词来源
    └── 打开或创建项目 AGENTS.md
                         │
                         ▼
                  项目文件工作区
                         │
                         ├── 预览 AGENTS.md
                         ├── 编辑 AGENTS.md
                         └── 创建 AGENTS.md
```

## 8. 系统提示词按钮

### 8.1 位置

在 Workspace Top Bar 右侧增加系统提示词按钮，与分支和文件面板控制处于同一组：

```text
po-agent / 当前会话                   [系统提示词] [分支] [文件]
```

宽度不足时可以只显示图标，但必须保留 Tooltip：

```text
查看和编辑系统提示词
```

推荐使用能够表达“文本规则”而不是“魔法生成”的线性图标。按钮使用现有 ghost/icon control 样式，不增加新的强调色。

### 8.2 可用状态

| 场景 | 按钮状态 | 行为 |
| --- | --- | --- |
| 有活跃 Runtime | 启用 | 显示真实的最终有效提示词 |
| 已选项目但 Runtime 尚未创建 | 启用 | 可以编辑全局追加内容；最终提示词区域显示尚不可用 |
| 未选择项目 | 启用 | 可以编辑全局追加内容；不显示项目来源 |
| 正在保存 | 禁用 | Tooltip 显示“正在保存系统提示词” |

按钮不应因为没有活跃 Session 而完全消失，因为全局追加提示词与 Session 无关。

## 9. 系统提示词 Dialog

### 9.1 布局

Dialog 使用宽屏尺寸，建议宽度 `min(880px, calc(100vw - 48px))`，高度不超过视口的 84%。内容区内部滚动，Footer 固定。

```text
┌──────────────────────────────────────────────────────────────┐
│ 系统提示词                                             [×]   │
│ 查看当前有效提示词，并为所有项目添加自定义指令。               │
│                                                              │
│ 作用范围：所有项目                                            │
│                                                              │
│ 当前有效系统提示词                            [复制] [查看来源] │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ You are an expert coding assistant operating inside pi…  │ │
│ │                                                          │ │
│ │ Guidelines:                                              │ │
│ │ - Be concise in your responses                           │ │
│ │ …                                                        │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 用户追加提示词                                               │
│ 这些内容会添加到默认系统提示词之后，并作用于所有项目。           │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 始终使用中文回答。                                        │ │
│ │ 修改代码前先阅读相关实现和测试。                           │ │
│ │ 未经确认不要执行 Git push。                               │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 保存位置：C:\Users\...\.pi\agent\APPEND_SYSTEM.md          │
│                                                              │
│                                         [取消] [保存]         │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 当前有效系统提示词

该区域只读，展示 `AgentRuntimeState.systemPrompt`。

要求：

- 使用等宽字体。
- 默认高度约 220px，内部滚动。
- 支持复制完整内容。
- 不允许直接切换成编辑状态。
- 没有 Runtime 时显示明确空状态，而不是空白编辑框。

无 Runtime 文案：

```text
当前还没有运行中的 Agent Session。
发送第一条消息后，可以在这里查看最终有效系统提示词。
```

最终有效提示词不能直接保存，原因是它包含动态内容。把它原样写入 `APPEND_SYSTEM.md` 会导致 `AGENTS.md`、Skills、工具说明、日期或工作目录在下次加载时重复出现。

### 9.3 用户追加提示词

这是 Dialog 中唯一可编辑的主要字段，对应 `APPEND_SYSTEM.md` 的原始内容。

要求：

- 使用支持多行输入的 Markdown 文本编辑器或等宽 Textarea。
- 不使用富文本格式。
- 保留用户输入的 Markdown。
- 显示字符数。
- 最大允许 64 KiB UTF-8 内容。
- 支持 `Ctrl+S` / `Cmd+S` 保存。
- 有修改时 Dialog 进入 dirty 状态。
- 保存按钮仅在内容变化后启用。

辅助文案必须明确说明作用范围：

```text
这些内容会添加到 Pi 默认系统提示词之后，并作用于所有项目。
项目特定规则请编辑项目根目录的 AGENTS.md。
```

### 9.4 提示词来源

点击“查看来源”后，在当前有效提示词下方展开来源列表：

```text
提示词来源

✓ Pi 默认系统提示词
  内置

✓ 用户追加提示词
  C:\Users\...\.pi\agent\APPEND_SYSTEM.md

✓ 项目 Pi 追加提示词
  D:\code\po-agent\.pi\APPEND_SYSTEM.md
  外部配置，只读

✓ 项目提示词
  D:\code\po-agent\AGENTS.md                          [打开文件]

✓ Runtime Context
  7 个工具 · 3 个 Skills
```

如果当前项目没有 `AGENTS.md`：

```text
○ 项目提示词
  当前项目没有 AGENTS.md                             [创建]
```

“打开文件”和“创建”通过 `AgentWorkspace` 协调 File Workspace，不让 instructions feature 直接 import files feature。

### 9.5 清除全局追加内容

已有内容被全部清空时，不应把一个空文件静默当作正常保存结果。UI 显示显式操作：

```text
清除全局提示词？

这会删除 APPEND_SYSTEM.md。Pi 默认系统提示词和项目 AGENTS.md 不受影响。

                                    [取消] [清除]
```

确认后删除 `APPEND_SYSTEM.md`。不存在该文件时，空内容代表默认状态，不创建空文件。

## 10. 项目 `AGENTS.md` 文件体验

### 10.1 文件存在

如果项目根目录已有 `AGENTS.md`，它像普通文件一样出现在 File Tree 中：

```text
po-agent
├── AGENTS.md
├── package.json
├── src
└── docs
```

打开后，File Preview Header 显示：

```text
AGENTS.md                                           [编辑]
```

编辑状态：

```text
┌──────────────────────────────────────────────────────┐
│ # Project Instructions                               │
│                                                      │
│ ## Architecture                                      │
│ - Route Handler 中不得包含业务逻辑。                   │
│                                                      │
│ ## Verification                                      │
│ - 完成修改后运行 npm run check。                       │
└──────────────────────────────────────────────────────┘

                                      [取消] [保存]
```

### 10.2 文件不存在

不在项目选择、浏览或 Session 创建时自动写入文件。

提供以下显式入口：

1. 项目根节点的操作菜单：“创建 AGENTS.md”。
2. File Workspace 的项目指令空状态：“创建 AGENTS.md”。
3. 系统提示词 Dialog 来源列表中的“创建”。
4. 通用新建文件能力允许用户手动输入 `AGENTS.md`。

点击创建后只创建前端未保存草稿，不立刻修改磁盘：

```md
# Project Instructions

## Architecture

## Development

## Testing
```

用户首次点击保存时才创建真实文件。

### 10.3 自动创建的定义

“自动创建”只发生在以下场景：

```text
用户明确进入创建 AGENTS.md 流程
        ↓
系统打开带模板的未保存草稿
        ↓
用户编辑内容
        ↓
保存时自动创建项目根目录 AGENTS.md
```

不得在用户仅仅打开或注册项目时自动修改仓库。

### 10.4 编辑限制

第一版只承诺 `AGENTS.md` 的专用创建和编辑体验，不因此开放任意工作区文件写入。

原因：

- 当前 File Workspace 是只读预览器。
- 通用文件编辑涉及保存冲突、编码、二进制文件、换行符、权限、符号链接和恢复策略。
- 本需求只需要一个固定名称、固定位置、Markdown 文本文件。

File Panel 可以通过布局传入的能力 props 展示专用编辑器，但后端仍使用项目指令专用接口。

### 10.5 删除

删除 `AGENTS.md` 必须显式确认：

```text
删除 AGENTS.md？

这会删除当前项目的 Agent 指令文件。该操作可能可以通过 Git 恢复。

                                    [取消] [删除文件]
```

删除后刷新 File Tree，并重新加载当前 Runtime。

## 11. 保存与生效

### 11.1 保存全局追加提示词

```text
用户点击保存
    ↓
校验字符长度和 revision
    ↓
原子写入 APPEND_SYSTEM.md
    ↓
保存结果返回
    ↓
存在当前 Runtime？
    ├── 是：标记当前会话仍使用旧版本，并提供“应用到当前会话”
    └── 否：提示将在新会话中生效
```

### 11.2 保存项目指令

```text
用户点击保存
    ↓
校验 cwd 是已注册项目根目录
    ↓
校验目标固定为 <cwd>/AGENTS.md
    ↓
校验 revision
    ↓
原子创建或写入 AGENTS.md
    ↓
刷新文件树
    ↓
如果存在当前 Runtime，标记待应用并提供显式 reload 操作
```

### 11.3 运行时状态

| Runtime 状态 | 保存行为 | UI 反馈 |
| --- | --- | --- |
| 没有 Runtime | 只保存文件 | “将在新会话中生效” |
| Runtime 空闲 | 保存文件，提供应用按钮 | “已保存，是否应用到当前会话” |
| 正在 Streaming | 保存文件，不中断当前轮，应用按钮禁用 | “当前任务完成后可应用” |
| 正在 Compacting | 保存文件，应用按钮禁用 | “上下文压缩完成后可应用” |
| Reload 失败 | 文件保存成功，Runtime 保持旧配置 | “已保存，但未能应用到当前会话” |

保存成功和 reload 成功必须分开表达，不能因为 reload 失败而告诉用户文件保存失败。

### 11.4 应用到当前会话

保存后如果当前 Runtime 忙碌，显示非阻塞状态条：

```text
提示词已保存。当前会话仍在使用之前的版本。        [应用到当前会话]
```

按钮在 Runtime 忙碌时禁用，Tooltip 使用具体原因：

```text
请等待当前任务完成后再重新加载提示词。
```

第一版不自动排队 reload，避免用户在当前 Agent 轮结束后遭遇未预期的 Extension、Skill 或工具配置变化。用户可以在 Agent 空闲后显式应用；新 Runtime 始终读取最新文件。

## 12. Dirty 状态与离开确认

系统提示词 Dialog 和 `AGENTS.md` 编辑器都必须跟踪：

- `initialContent`
- `draftContent`
- `saving`
- `revision`
- `saveError`

关闭或切换文件时，如果 `draftContent !== initialContent`，显示确认：

```text
放弃提示词修改？

你有尚未保存的修改。离开后这些修改将丢失。

                              [继续编辑] [放弃修改]
```

Dialog 不通过 backdrop click 或 Escape 静默丢弃修改，遵循现有产品的 deliberate close 原则。

## 13. 外部修改与并发冲突

用户可能同时在 VS Code 和 Po Agent 中编辑 `AGENTS.md` 或 `APPEND_SYSTEM.md`。接口使用 revision 避免静默覆盖。

建议 revision 为原始文件字节的 SHA-256；文件不存在时使用稳定的 absent revision。

读取响应：

```ts
interface InstructionDocument {
  content: string;
  exists: boolean;
  filePath: string;
  revision: string;
}
```

写入请求携带读取时的 revision：

```ts
interface SaveInstructionDocumentRequest {
  content: string;
  expectedRevision: string;
}
```

revision 不一致时返回 `INSTRUCTION_CONFLICT`（HTTP 409），UI 显示：

```text
文件已被其他程序修改。

                                  [查看最新内容] [覆盖文件]
```

“覆盖文件”必须是用户第二次明确操作，不能在第一次冲突后自动重试。

## 14. API 设计

### 14.1 全局追加提示词

```http
GET /api/instructions/system
```

响应：

```ts
interface SystemInstructionsResponse {
  append: InstructionDocument;
}
```

最终有效系统提示词继续从已有 Runtime state 获取，不在该接口中复制：

```http
GET /api/agent/:id
POST /api/agent/:id { "type": "get_state" }
```

保存：

```http
PUT /api/instructions/system
Content-Type: application/json
```

```ts
interface SaveSystemInstructionsRequest {
  content: string;
  expectedRevision: string;
  force?: boolean;
}
```

清除：

```http
DELETE /api/instructions/system
Content-Type: application/json
```

```ts
interface DeleteSystemInstructionsRequest {
  expectedRevision: string;
  force?: boolean;
}
```

### 14.2 项目指令

读取：

```http
GET /api/instructions/project?cwd=<absolute-project-root>
```

保存或创建：

```http
PUT /api/instructions/project
Content-Type: application/json
```

```ts
interface SaveProjectInstructionsRequest {
  cwd: string;
  content: string;
  expectedRevision: string;
  force?: boolean;
}
```

删除：

```http
DELETE /api/instructions/project
Content-Type: application/json
```

```ts
interface DeleteProjectInstructionsRequest {
  cwd: string;
  expectedRevision: string;
  force?: boolean;
}
```

`filePath` 不由客户端提供。服务端只能从已验证的 `cwd` 计算：

```ts
path.join(cwd, "AGENTS.md")
```

### 14.3 Runtime 重载

在 Agent Command 中增加：

```ts
type AgentCommand =
  | ExistingCommands
  | { type: "reload_instructions" };
```

Runtime 适配器调用：

```ts
await session.reload();
```

重载成功后返回最新 `AgentRuntimeState`，前端同步：

- `systemPrompt`
- Skills 和工具相关展示数据（如果现有 UI 使用）
- Runtime busy state

如果 `isStreaming` 或 `isCompacting`，返回 `AGENT_BUSY`（HTTP 409），不调用 SDK reload。

### 14.4 错误码

| 错误码 | HTTP | 场景 |
| --- | --- | --- |
| `INSTRUCTION_TOO_LARGE` | 400 | UTF-8 内容超过 64 KiB |
| `INSTRUCTION_CONFLICT` | 409 | 文件 revision 已变化 |
| `PROJECT_NOT_REGISTERED` | 403 | cwd 不是已注册项目根目录 |
| `INSTRUCTION_READ_FAILED` | 500 | 文件读取失败 |
| `INSTRUCTION_WRITE_FAILED` | 500 | 文件创建或写入失败 |
| `INSTRUCTION_DELETE_FAILED` | 500 | 文件删除失败 |
| `AGENT_BUSY` | 409 | Streaming 或 Compacting 时请求 reload |
| `INSTRUCTION_RELOAD_FAILED` | 500 | 文件已保存但 Runtime reload 失败 |

不在错误消息中返回文件内容、用户主目录中的其他路径、凭证或底层未脱敏异常。

## 15. 后端分层设计

遵循现有依赖方向：

```text
domain <- ports <- application <- transport
                   ^                ^
                   |                |
            infrastructure      app/api
```

### 15.1 Contracts

建议新增：

```text
src/contracts/instructions.ts
```

包含 HTTP 可序列化结构：

- `InstructionDocument`
- `SystemInstructionsResponse`
- `ProjectInstructionsResponse`
- 保存和删除请求
- 稳定错误码引用

### 15.2 Domain

如果 revision、作用域或文档状态需要在服务端跨层表达，新增：

```text
src/server/domain/instruction.ts
```

Domain 不包含 `fs`、Pi SDK 或 Next.js 类型。

### 15.3 Ports

新增最小端口：

```ts
interface InstructionStore {
  readGlobalAppend(): Promise<InstructionDocument>;
  writeGlobalAppend(input: WriteInstructionInput): Promise<InstructionDocument>;
  deleteGlobalAppend(input: DeleteInstructionInput): Promise<void>;
  readProject(root: string): Promise<InstructionDocument>;
  writeProject(root: string, input: WriteInstructionInput): Promise<InstructionDocument>;
  deleteProject(root: string, input: DeleteInstructionInput): Promise<void>;
}
```

不在现有 `WorkspaceFileService` 上直接增加不受约束的 `write(path, content)`。项目指令端口通过语义限制可写目标。

### 15.4 Application

新增：

```text
src/server/application/instruction-service.ts
```

职责：

- 校验 project root 已注册。
- 校验内容大小。
- 协调 revision 冲突。
- 调用 `InstructionStore`。
- 不直接使用 `node:fs`。
- 不直接调用 Pi SDK。

Runtime reload 继续由 `AgentService` 协调，避免 Instruction Service 直接依赖具体 Runtime 实现。

### 15.5 Infrastructure

新增文件实现，例如：

```text
src/server/infrastructure/filesystem/node-instruction-store.ts
```

职责：

- 使用 `getAgentDir()` 解析全局位置。
- 将全局目标固定为 `<agentDir>/APPEND_SYSTEM.md`。
- 将项目目标固定为 `<root>/AGENTS.md`。
- UTF-8 读取和写入。
- 计算 SHA-256 revision。
- 使用同目录临时文件加 rename 原子写入。
- 防止通过符号链接逃逸允许根目录。
- 删除时再次校验 revision。

同时更新现有 Pi ResourceLoader 适配器：

```text
src/server/infrastructure/pi/pi-resource-loader.ts
```

它需要显式组合：

1. 全局 `<agentDir>/APPEND_SYSTEM.md`。
2. 当前项目 `<cwd>/.pi/APPEND_SYSTEM.md`（如果存在）。

组合顺序固定为全局在前、项目在后。不得继续依赖 SDK “项目文件存在时遮蔽全局文件”的默认发现行为。这个组合逻辑属于 Pi SDK 兼容细节，应留在 infrastructure 层，不进入 application service 或前端。

### 15.6 Transport 与 Route Handler

新增 validator：

- `parseSaveSystemInstructions`
- `parseDeleteSystemInstructions`
- `parseSaveProjectInstructions`
- `parseDeleteProjectInstructions`

Route Handler 只负责：

1. 读取 query 或 JSON body。
2. 调用 validator。
3. 委托给 application service。
4. 使用统一响应 helper 返回。

公开接口实现后同步更新 `docs/agent-api-reference.md`。

## 16. 前端架构

### 16.1 Instructions feature

新增：

```text
src/features/instructions/
├── api.ts
├── types.ts
├── system-prompt-dialog.tsx
├── system-prompt-sources.tsx
├── instruction-editor.tsx
└── *.test.tsx
```

职责：

- 加载和保存全局追加提示词。
- 展示最终有效提示词。
- 展示来源列表。
- 维护 dirty、saving、revision 和 conflict 状态。
- 发出打开或创建 `AGENTS.md` 的 callback。

不得直接 import `src/server` 或 files feature。

### 16.2 Files feature

File Workspace 继续负责文件树和文件预览。为满足本功能，可以接受由 layout 传入的能力：

- 当前文件是否允许专用编辑。
- 保存专用文件的 callback。
- 创建 `AGENTS.md` 的 callback。
- 删除 `AGENTS.md` 的 callback。

Files feature 不自行理解全局系统提示词，也不调用 instructions feature。

### 16.3 Layout 协调

`AgentWorkspace` 已拥有：

- 当前项目 cwd。
- 当前 Session。
- Top Bar。
- File Workspace 打开状态。

因此它负责：

- 打开 System Prompt Dialog。
- 把当前 runtime `systemPrompt` 传给 Dialog。
- 响应“打开 AGENTS.md”。
- 必要时打开 File Workspace。
- 响应“创建 AGENTS.md”。
- 保存后触发 File Tree refresh。
- 协调当前 Session reload。

跨 feature 交互只通过 props 和 callback，不让 instructions 与 files 相互 import。

### 16.4 Client boundary

System Prompt Dialog、编辑器、dirty 状态和文件操作需要交互，因此属于 Client Component。保持新增 client boundary 在 feature 和现有 `AgentWorkspace` 范围内，不扩大到页面根布局。

## 17. 安全设计

### 17.1 路径限制

- 全局目标路径由服务端通过 Pi `getAgentDir()` 解析。
- 项目目标路径只能是已注册 root 本身下的 `AGENTS.md`。
- 客户端不能提交目标文件名或任意绝对文件路径。
- 写入前解析 real path，并检查现有符号链接不会逃逸允许目录。
- 创建文件时校验父目录 real path 位于注册 root 内。

### 17.2 内容限制

- 仅接受字符串。
- 最大 64 KiB UTF-8。
- 不解析或执行 Markdown。
- UI 渲染预览时使用安全 Markdown renderer，不允许原始 HTML 或脚本。
- 不把内容写入服务端日志。

### 17.3 提示词不是授权边界

`AGENTS.md` 和 `APPEND_SYSTEM.md` 只能影响模型行为，不能：

- 扩大文件系统访问范围。
- 自动启用被禁用的工具。
- 获取凭证。
- 绕过 API 输入校验。
- 绕过用户确认和 busy guard。

这些规则必须继续由端口、应用服务和 Runtime 控制。

## 18. 可访问性与视觉规范

1. Top Bar 按钮必须有可读 `aria-label` 和 Tooltip。
2. Dialog 打开后焦点进入标题或第一个合理操作，不直接把焦点放进长文本区域。
3. Dialog 关闭后焦点返回系统提示词按钮。
4. 只读最终提示词使用可选择文本，不使用 disabled Textarea。
5. 编辑器必须有可见 label，不能只依赖 placeholder。
6. 保存、删除和应用按钮都有清晰的 focus-visible 状态。
7. 错误信息与对应字段建立 `aria-describedby`。
8. 状态不能只通过颜色表达，必须同时有文字或图标。
9. 不引入渐变、玻璃效果、大面积强调色或装饰动画。
10. 支持 `prefers-reduced-motion`。

## 19. 国际化文案范围

建议新增 feature-scoped dictionary：

```text
instructions.systemPrompt
instructions.effectivePrompt
instructions.globalAppend
instructions.scopeAllProjects
instructions.sources
instructions.openProjectInstructions
instructions.createProjectInstructions
instructions.savedAndApplied
instructions.savedPendingReload
instructions.conflict
instructions.clearGlobalTitle
instructions.deleteProjectTitle
```

英文和中文词典必须同步更新，并更新字典结构测试。

## 20. 关键交互状态

### 20.1 System Prompt Dialog

| 状态 | UI |
| --- | --- |
| Loading | 编辑器区域显示 skeleton，Footer Save 禁用 |
| Loaded clean | Save 禁用 |
| Dirty | Save 启用，关闭触发确认 |
| Saving | Save 显示“正在保存…”，字段保持可见但不可重复提交 |
| Saved and applied | 显示成功状态，刷新有效提示词 |
| Saved but stale | 显示“当前会话仍使用旧版本”和应用按钮 |
| Conflict | 保留草稿，提供查看最新内容和覆盖操作 |
| Read failure | 显示可重试错误，不把内容重置为空 |
| Write failure | Dialog 保持打开，保留草稿 |

### 20.2 `AGENTS.md` Editor

| 状态 | UI |
| --- | --- |
| File absent | 显示创建入口 |
| New draft | 显示模板，磁盘尚无文件 |
| Existing read-only | 显示内容和编辑按钮 |
| Editing dirty | 显示取消和保存，离开需确认 |
| Saving | 禁止重复保存 |
| Conflict | 保留草稿并提示外部修改 |
| Deleted | 关闭预览并刷新 File Tree |

## 21. 测试设计

### 21.1 Application tests

- 读取全局追加提示词。
- 保存内容并返回新 revision。
- 清除全局提示词。
- 拒绝超过 64 KiB 的内容。
- 拒绝未注册 project root。
- 固定项目目标为 root `AGENTS.md`。
- revision 冲突返回 `INSTRUCTION_CONFLICT`。
- `force` 只在明确请求时覆盖。

### 21.2 Infrastructure tests

- 文件不存在时返回 `exists: false`。
- 原子创建和覆盖。
- 写入失败不破坏原文件。
- revision 随内容变化。
- 删除时校验 revision。
- 项目 `AGENTS.md` 符号链接逃逸被拒绝。
- 全局路径来自注入的 agentDir，测试不触碰真实用户目录。
- UTF-8 内容往返一致。
- 没有项目 `.pi/APPEND_SYSTEM.md` 时加载全局追加提示词。
- 存在项目 `.pi/APPEND_SYSTEM.md` 时仍同时加载全局追加提示词。
- 全局追加内容位于项目 Pi 追加内容之前。
- 同一路径或同一来源不会被重复加载。

### 21.3 Pi Runtime tests

- `reload_instructions` 调用 `session.reload()`。
- Streaming 时拒绝 reload。
- Compacting 时拒绝 reload。
- reload 后 `getState().systemPrompt` 返回最新内容。
- reload 失败映射为稳定错误。
- reload 不删除 Session 历史。

### 21.4 Transport tests

- 校验 content、cwd、expectedRevision 和 force。
- 拒绝空 cwd、错误类型和额外危险路径字段。
- 验证错误码到 HTTP 状态映射。

### 21.5 UI tests

- Top Bar 按钮打开 Dialog。
- 有 Runtime 时显示最终有效提示词。
- 无 Runtime 时显示正确空状态。
- 编辑全局追加内容后 Save 启用。
- dirty Dialog 关闭时显示确认。
- 保存失败保留草稿。
- conflict 状态不静默覆盖。
- 来源列表能够打开现有 `AGENTS.md`。
- 来源列表能够进入创建 `AGENTS.md` 流程。
- Agent busy 时应用按钮禁用并显示具体原因。
- 项目文件不存在时保存创建文件。
- 英文和中文文案结构一致。

### 21.6 浏览器验证

实现后在浏览器验证：

1. 没有选择项目时编辑全局追加提示词。
2. 选择没有 `AGENTS.md` 的项目并创建文件。
3. 从系统提示词 Dialog 打开项目 `AGENTS.md`。
4. 保存并应用到空闲 Session。
5. Agent 运行中保存，验证不会中断当前轮。
6. 从外部编辑器修改文件，验证冲突处理。
7. 1024px 最小宽度下 Dialog 和 File Workspace 可用。
8. Light、Dark、键盘和 reduced motion 状态。

## 22. 文档与验证要求

实现公开接口时必须同步更新：

- `docs/agent-api-reference.md`
- 相关 contracts
- 中英文 dictionaries
- 架构文档（仅当实际模块边界发生变化）

代码实现完成前运行最小相关测试；交付前运行：

```bash
npm run check
```

由于该功能会新增 Next.js Route Handlers、Client UI 和生产运行时行为，交付前同时运行：

```bash
npm run build
```

## 23. 分阶段交付

### Phase 1：文件读写与基础 UI

- System Prompt Top Bar 按钮。
- System Prompt Dialog。
- 读取和保存全局 `APPEND_SYSTEM.md`。
- 查看已有 Runtime 的最终有效提示词。
- File Workspace 创建和编辑项目根 `AGENTS.md`。
- 保存状态、dirty 确认和基础错误处理。
- 新 Runtime 自动使用最新文件。

### Phase 2：安全重载与来源联动

- `reload_instructions` Agent Command。
- 保存后应用到空闲 Runtime。
- busy guard 和 pending UI。
- 来源列表打开或创建 `AGENTS.md`。
- reload 后刷新最终有效提示词。

### Phase 3：并发与质量增强

- revision 冲突处理。
- 文件 watcher 驱动的“外部已修改”提示。
- 来源详情和内容大小提示。
- 更完整的浏览器和视觉回归测试。

### 后续候选

- 完整替换 `.pi/SYSTEM.md` 的高级模式。
- 用户私有的项目级本地指令文件。
- Monorepo 子目录级规则。
- 路径匹配的条件指令。
- 从项目结构生成可评审的 `AGENTS.md` 草稿。

## 24. 需要评审确认的产品决策

以下决策在开始实现前需要确认：

1. 第一版是否坚持只支持追加全局提示词，不开放 `.pi/SYSTEM.md` 完整替换。
2. `AGENTS.md` 默认模板是否使用本设计中的三个空章节，还是创建完全空白文件。
3. 保存后是否自动 reload 空闲 Runtime，还是始终要求用户点击“应用到当前会话”。
4. 第一版是否必须包含 revision 冲突保护，还是放到 Phase 3。
5. 删除 `AGENTS.md` 是否由专用 UI 支持，还是交给外部编辑器和未来通用文件操作。

## 25. 推荐决策

为了在安全、清晰和实现成本之间取得平衡，建议：

1. 第一版只支持 `APPEND_SYSTEM.md`，完整替换留到后续高级功能。
2. 创建 `AGENTS.md` 时提供简洁模板，但仅在用户明确保存时写入磁盘。
3. 保存和应用分开：保存始终立即完成，Runtime 空闲时提供显式“应用到当前会话”。
4. 第一版即包含 revision 冲突保护，避免覆盖 VS Code 中的修改。
5. 第一版支持专用删除，因为用户需要完整管理由 Po Agent 创建的文件。

这组决策使 UI 只暴露两个容易理解的概念：

- “我的全局追加提示词”。
- “当前项目的 `AGENTS.md`”。

最终有效系统提示词始终作为只读结果展示，不成为第三份可写配置。

## 26. 行业参考

- [AGENTS.md](https://agents.md/)：项目级、目录级 Coding Agent 指令的开放 Markdown 格式。
- [Claude Code Memory](https://code.claude.com/docs/zh-CN/memory)：用户级、项目级和目录级指令分层。
- [GitHub Copilot Repository Instructions](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)：仓库级、路径级和 Agent 指令。
- [Cursor Rules](https://docs.cursor.com/context/rules)：User Rules 与 Project Rules 分层。
- Pi 当前安装版本的 `docs/usage.md` 和 `docs/sdk.md`：`APPEND_SYSTEM.md`、`AGENTS.md`、ResourceLoader 和 Runtime reload 行为。
