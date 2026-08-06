# Po Agent API 文档

本文档描述当前项目已经实现的 HTTP API。内容以 `src/app/api`、
`src/server/transport` 和 `src/server/domain` 中的代码为准。

## 1. 基本信息

### 1.1 Base URL

本地开发环境默认地址：

```text
http://localhost:3000
```

本文档中的路径均以该地址为基准，例如：

```text
GET http://localhost:3000/api/sessions
```

### 1.2 运行模型

当前后端按以下边界设计：

- 单用户
- 单 Node.js 进程
- 本机文件系统
- 本机 Pi Session 和 Credential 存储
- 不提供多租户隔离
- 不提供面向公网部署的认证和授权保护

除 OAuth 流程和 API Key 配置外，API 本身没有登录校验。不要直接暴露到公网。

### 1.3 Content Type

普通 JSON 请求：

```http
Content-Type: application/json
```

普通 JSON 响应：

```http
Content-Type: application/json
```

实时事件响应：

```http
Content-Type: text/event-stream; charset=utf-8
```

文件二进制响应的 `Content-Type` 根据扩展名决定。

### 1.4 JSON 响应约定

成功响应直接返回业务数据，没有统一的 `data` 包装：

```json
{
  "sessionId": "019e..."
}
```

失败响应使用统一结构：

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "message must be a non-empty string",
    "details": {}
  }
}
```

`details` 没有内容时可能不出现。

### 1.5 通用错误代码

| Code | 常见状态码 | 含义 |
| --- | ---: | --- |
| `VALIDATION_ERROR` | 400、403、416 | 请求体、路径或 Range 参数不合法 |
| `SESSION_NOT_FOUND` | 404 | Session 或指定 Session Entry 不存在 |
| `FILE_NOT_FOUND` | 404 | 文件或目录不存在 |
| `NOT_A_FILE` | 400 | 目标不是文件 |
| `NOT_A_DIRECTORY` | 400 | 目标不是目录 |
| `FILE_TOO_LARGE` | 413 | 文本或图片超过预览限制 |
| `MODEL_NOT_FOUND` | 404 | 模型不存在 |
| `UNSUPPORTED_COMMAND` | 400 | Agent Command 类型不受支持 |
| `COMPACTION_NOT_AVAILABLE` | 409 | 当前没有可压缩的较早上下文，或上下文已压缩且没有新增内容 |
| `OAUTH_PROVIDER_NOT_FOUND` | 404 | OAuth Provider 不存在 |
| `PENDING_INPUT_NOT_FOUND` | 404 | OAuth Pending Input Token 不存在或 Provider 不匹配 |
| `SKILL_INSTALL_FAILED` | 500 | Skill CLI 安装失败 |
| `SKILL_PACK_NOT_FOUND` | 404 | Skill Pack 不存在或 opaque ID 已失效 |
| `SKILL_PACK_INSTALL_BUSY` | 409 | 另一个 Skill Pack 安装或移除操作正在运行 |
| `SKILL_PACK_INSTALL_FAILED` | 500 | Skill Pack 安装或安装后校验失败 |
| `SKILL_PACK_REMOVE_FAILED` | 500 | Skill Pack 移除或移除后校验失败 |
| `SKILL_PACK_BROKEN` | 409 | Skill Pack 已配置但资源不完整 |
| `INSTRUCTION_TOO_LARGE` | 400 | 指令内容超过 64 KB 限制 |
| `INSTRUCTION_CONFLICT` | 409 | 指令文件已被其他进程修改 |
| `PROJECT_NOT_REGISTERED` | 403 | 项目根目录未注册 |
| `INSTRUCTION_READ_FAILED` | 500 | 读取指令文件失败 |
| `INSTRUCTION_WRITE_FAILED` | 500 | 写入指令文件失败 |
| `INSTRUCTION_DELETE_FAILED` | 500 | 删除指令文件失败 |
| `AGENT_BUSY` | 409 | Agent 正在流式输出或压缩中，无法重载 |
| `INSTRUCTION_RELOAD_FAILED` | 500 | 重载指令失败 |
| `INTERNAL_ERROR` | 500 | 未归类的服务端错误 |

## 2. API 总览

### 2.1 Utility

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/home` | 获取当前用户 Home 目录 |

### 2.2 Projects

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/projects` | 获取持久化项目列表。 |
| `POST` | `/api/projects` | 校验并添加项目目录。 |
| `DELETE` | `/api/projects?path=...` | 仅从项目列表移除项目。 |
| `GET` | `/api/projects/browse?path=...` | 浏览本机目录。 |

`POST /api/projects` 请求体：

```json
{ "path": "C:\\work\\project" }
```

项目响应包含规范 `path` 和用于关联历史 Session 路径写法的 `aliases`：

```json
{ "path": "C:\\work\\project", "aliases": ["C:\\work\\project"] }
```

`GET /api/projects/browse` 返回当前位置、父目录、平台根位置、面包屑和直接子目录。目录浏览不会返回文件内容。

`DELETE /api/projects` 只删除项目注册表元数据，不会删除目录、项目文件或 Session。

### 2.3 Sessions

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/sessions` | 列出 Session |
| `GET` | `/api/sessions/:id` | 获取 Session Tree、Context 和可选 Runtime State |
| `PATCH` | `/api/sessions/:id` | 重命名 Session |
| `DELETE` | `/api/sessions/:id` | 删除 Session，并重挂直接子 Session |
| `GET` | `/api/sessions/:id/context` | 获取当前或指定 Leaf 的上下文 |

### 2.4 Agent

| Method | Path | 用途 |
| --- | --- | --- |
| `POST` | `/api/agent/new` | 创建并配置 Agent Runtime |
| `GET` | `/api/agent/:id` | 获取 Runtime Snapshot |
| `POST` | `/api/agent/:id` | 执行统一 Agent Command |
| `GET` | `/api/agent/:id/events` | 订阅 Agent SSE 事件 |

### 2.5 Models

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/models` | 获取当前可用模型和默认模型 |
| `GET` | `/api/models-config` | 读取原始模型配置 |
| `GET` | `/api/models-config/bootstrap` | 获取模型配置弹窗初始化数据 |
| `PUT` | `/api/models-config` | 覆盖原始模型配置 |
| `POST` | `/api/models-config/discover` | 根据 Provider 草稿发现并补齐模型建议 |
| `POST` | `/api/models-config/test` | 隔离测试模型配置 |

### 2.6 Auth

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/auth/providers` | 获取 OAuth Provider |
| `GET` | `/api/auth/all-providers` | 获取 OAuth 和 API Key Provider |
| `GET` | `/api/auth/api-key/:provider` | 获取 API Key 配置状态 |
| `POST` | `/api/auth/api-key/:provider` | 保存 API Key |
| `DELETE` | `/api/auth/api-key/:provider` | 删除 API Key |
| `GET` | `/api/auth/login/:provider` | 启动 OAuth SSE 流程 |
| `POST` | `/api/auth/login/:provider` | 回传 OAuth 人工输入 |
| `POST` | `/api/auth/logout/:provider` | 退出 Provider 登录 |

### 2.7 Files

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/files/[...path]?type=list` | 列出目录 |
| `GET` | `/api/files/[...path]?type=read` | 读取文本 |
| `GET` | `/api/files/[...path]?type=raw` | 读取或流式传输二进制 |
| `GET` | `/api/files/[...path]?type=binary` | `raw` 的别名 |
| `GET` | `/api/files/[...path]?type=watch` | 订阅文件变化 SSE |

### 2.8 Skills

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/skills` | 加载当前工作区可用 Skills |
| `PATCH` | `/api/skills` | 修改 Skill 的模型调用开关 |
| `POST` | `/api/skills/search` | 搜索可安装 Skill |
| `POST` | `/api/skills/install` | 安装 Skill |
| `POST` | `/api/skills/local` | 导入本地 Skill 文件 |
| `DELETE` | `/api/skills` | 移除 Skill |

### 2.9 Skill Packs

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/skill-packs` | 加载官方目录和当前已配置的 Pi Packages |
| `POST` | `/api/skill-packs/install` | 从服务端官方目录安装 Skill Pack |
| `POST` | `/api/skill-packs/install-source` | 从 npm、Git、HTTPS 或本地绝对目录安装 Skill Pack |
| `POST` | `/api/skill-packs/update` | 更新支持更新的已安装 Skill Pack |
| `POST` | `/api/skill-packs/repair` | 修复损坏的已配置 Skill Pack |
| `DELETE` | `/api/skill-packs` | 移除已安装的 Skill Pack |

### 2.10 Instructions

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/instructions/system` | 读取全局追加提示词 |
| `PUT` | `/api/instructions/system` | 保存全局追加提示词 |
| `DELETE` | `/api/instructions/system` | 删除全局追加提示词 |
| `GET` | `/api/instructions/project?cwd=...` | 读取项目 AGENTS.md |
| `PUT` | `/api/instructions/project` | 保存项目 AGENTS.md |
| `DELETE` | `/api/instructions/project` | 删除项目 AGENTS.md |

## 3. 通用数据结构

### 3.1 ThinkingLevel

```ts
type ThinkingLevel =
  | "auto"
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";
```

`auto` 在设置 Agent Runtime 时表示不强制调用 SDK 的 Thinking Level setter。

### 3.2 ImageInput

```ts
interface ImageInput {
  type: "image";
  data: string;
  mimeType: string;
}
```

`data` 是 Base64 内容，不包含 Data URL 前缀。

示例：

```json
{
  "type": "image",
  "data": "iVBORw0KGgoAAA...",
  "mimeType": "image/png"
}
```

### 3.3 AgentRuntimeState

```ts
interface AgentRuntimeState {
  sessionId: string;
  sessionFile: string;
  isStreaming: boolean;
  isCompacting: boolean;
  compactionAvailable: boolean;
  autoCompactionEnabled: boolean;
  autoRetryEnabled: boolean;
  model?: {
    id: string;
    provider: string;
  };
  contextUsage: {
    percent: number | null;
    contextWindow: number;
    tokens: number | null;
  } | null;
  systemPrompt: string;
  thinkingLevel: ThinkingLevel;
}
```

### 3.4 AgentMessage

消息通过 `role` 区分类型。

#### UserMessage

```ts
interface UserMessage {
  role: "user";
  content: string | Array<TextContent | ImageContent>;
  timestamp?: number;
}
```

#### AssistantMessage

```ts
interface AssistantMessage {
  role: "assistant";
  content: AssistantContent[];
  provider: string;
  model: string;
  stopReason?: string;
  errorMessage?: string;
  failure?: AgentFailure;
  timestamp?: number;
  usage?: TokenUsage;
}
```

模型调用失败时，`failure` 提供稳定、可供 UI 使用的错误分类：

```ts
interface AgentFailure {
  code:
    | "MODEL_REQUEST_FAILED"
    | "MODEL_AUTH_FAILED"
    | "MODEL_RATE_LIMITED"
    | "MODEL_PROTOCOL_ERROR"
    | "MODEL_TIMEOUT"
    | "MODEL_UNAVAILABLE"
    | "UNKNOWN_AGENT_ERROR";
  message: string;
  technicalMessage?: string;
  provider?: string;
  model?: string;
  retryable: boolean;
}
```

`technicalMessage` 已进行基础凭证脱敏，但客户端仍不应将其自动发送到外部服务。

`AssistantContent` 支持：

```ts
type AssistantContent =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | {
      type: "image";
      source: {
        type: "base64" | "url";
        mediaType?: string;
        data?: string;
        url?: string;
      };
    }
  | {
      type: "toolCall";
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    };
```

#### ToolResultMessage

```ts
interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName?: string;
  content: Array<TextContent | ImageContent>;
  isError?: boolean;
  timestamp?: number;
}
```

#### Summary 和扩展消息

```ts
interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp?: number;
}

interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp?: number;
}

interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | Array<TextContent | ImageContent>;
  display: boolean;
  details?: unknown;
  timestamp?: number;
}

interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode?: number;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp?: number;
}
```

## 4. Utility and Project API

### 4.1 获取 Home 目录

```http
GET /api/home
```

响应：

```json
{
  "home": "C:\\Users\\example"
}
```

### 4.2 管理项目

列出项目：

```http
GET /api/projects
```

响应为项目数组，每项包含规范路径及历史 Session 路径别名：

```json
[
  {
    "path": "C:\\workspace\\project",
    "aliases": ["C:\\workspace\\project"]
  }
]
```

添加项目：

```http
POST /api/projects
Content-Type: application/json
```

```json
{ "path": "C:\\workspace\\project" }
```

响应为新增的项目对象。移除项目使用 `DELETE /api/projects?path=...`，成功响应为 `{ "success": true }`，不会删除目录、文件或 Session。

浏览目录：

```http
GET /api/projects/browse?path=C%3A%5Cworkspace
```

```json
{
  "current": "C:\\workspace",
  "parent": "C:\\",
  "roots": ["C:\\"],
  "breadcrumbs": [
    { "name": "C:\\", "path": "C:\\" },
    { "name": "workspace", "path": "C:\\workspace" }
  ],
  "directories": [
    { "name": "project", "path": "C:\\workspace\\project" }
  ]
}
```

## 5. Session API

Session 数据来自 Pi SDK 默认 Session Storage。

### 5.1 列出 Session

```http
GET /api/sessions
```

响应类型：

```ts
interface SessionInfo {
  id: string;
  path: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId?: string;
}
```

响应示例：

```json
[
  {
    "id": "019eaae0-98ee-7d69-80e2-d35189abd636",
    "path": "C:\\Users\\example\\.pi\\agent\\sessions\\...jsonl",
    "cwd": "C:\\workspace\\project",
    "name": "修复登录问题",
    "created": "2026-06-09T05:35:06.478Z",
    "modified": "2026-06-09T08:19:00.076Z",
    "messageCount": 26,
    "firstMessage": "检查登录失败的问题",
    "parentSessionId": "019e..."
  }
]
```

### 5.2 获取 Session Detail

```http
GET /api/sessions/:id
GET /api/sessions/:id?includeState=true
```

Query：

| 参数 | 必需 | 说明 |
| --- | --- | --- |
| `includeState` | 否 | 等于字符串 `true` 时附加 Runtime Snapshot |

响应：

```ts
interface SessionDetail {
  sessionId: string;
  filePath: string;
  info: SessionInfo | null;
  tree: SessionTreeNode[];
  leafId: string | null;
  context: SessionContext;
  agentState?: {
    running: boolean;
    state?: AgentRuntimeState;
  };
}
```

`tree` 节点：

```ts
interface SessionTreeNode {
  entry: {
    id: string;
    parentId: string | null;
    type: string;
    timestamp: string;
    message?: AgentMessage;
    [key: string]: unknown;
  };
  children: SessionTreeNode[];
  label?: string;
}
```

`includeState=true` 只检查当前进程内是否已经加载 Runtime，不会为了查询而恢复 Runtime。

错误：

- `404 SESSION_NOT_FOUND`

### 5.3 重命名 Session

```http
PATCH /api/sessions/:id
Content-Type: application/json
```

请求：

```json
{
  "name": "新的会话名称"
}
```

成功响应：

```json
{
  "success": true
}
```

错误：

- `400 VALIDATION_ERROR`
- `404 SESSION_NOT_FOUND`

### 5.4 删除 Session

```http
DELETE /api/sessions/:id
```

成功响应：

```json
{
  "success": true
}
```

删除行为：

1. 销毁当前进程中的同 ID Runtime。
2. 删除 Session JSONL 文件。
3. 将直接子 Session 重挂到被删除 Session 的父 Session。
4. 如果被删除 Session 没有父 Session，则清除直接子 Session 的父引用。

错误：

- `404 SESSION_NOT_FOUND`

### 5.5 获取 Session Context

```http
GET /api/sessions/:id/context
GET /api/sessions/:id/context?leafId=:entryId
```

Query：

| 参数 | 必需 | 说明 |
| --- | --- | --- |
| `leafId` | 否 | 指定 Session Tree Entry；省略时使用当前 Leaf |

响应：

```json
{
  "context": {
    "messages": [],
    "entryIds": [],
    "thinkingLevel": "off",
    "model": {
      "provider": "new-api",
      "modelId": "qwen3-coder-next"
    }
  }
}
```

约束：

- `messages.length` 始终等于 `entryIds.length`。
- 相同索引的 `entryIds[index]` 是 `messages[index]` 对应的 Session Entry。
- Compaction Summary 使用 Compaction Entry ID。
- 指定 `leafId` 时，Context 按该分支构建，不要求该 Entry 是当前 Leaf。

错误：

- `404 SESSION_NOT_FOUND`：Session 或 `leafId` 不存在。

## 6. Agent API

推荐调用流程：

1. 调用 `POST /api/agent/new` 创建并配置 Runtime。
2. 使用返回的 `sessionId` 订阅 `/api/agent/:id/events`。
3. 收到 `connected` 事件后，通过 `POST /api/agent/:id` 发送首条 `prompt`。
4. 继续通过 `POST /api/agent/:id` 发送后续命令。
5. 页面恢复时先查询 `GET /api/agent/:id`。

### 6.1 创建并配置 Agent Runtime

```http
POST /api/agent/new
Content-Type: application/json
```

请求：

```ts
interface CreateAgentRequest {
  cwd: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
  toolNames?: string[];
}
```

示例：

```json
{
  "cwd": "C:\\workspace\\project",
  "provider": "new-api",
  "modelId": "qwen3-coder-next",
  "thinkingLevel": "medium",
  "toolNames": ["read", "bash", "edit"]
}
```

规则：

- `cwd` 必需且不能为空。
- 只有同时提供 `provider` 和 `modelId` 才会设置模型。
- 未提供 `toolNames` 时启用全部内置工具：`bash`、`read`、`edit`、`write`、`grep`、`find`、`ls`。
- `toolNames: []` 表示禁用所有内置工具。项目自有的持久化生成工具始终可用，不属于这份内置工具 allowlist。
- 此接口不会启动 Prompt。客户端必须先建立 SSE，再通过统一 command endpoint 发送首条 `prompt`。

成功响应：

```json
{
  "sessionId": "019e..."
}
```

### 6.2 获取 Runtime Snapshot

```http
GET /api/agent/:id
```

Runtime 已加载：

```json
{
  "running": true,
  "state": {
    "sessionId": "019e...",
    "sessionFile": "C:\\Users\\example\\.pi\\agent\\sessions\\...jsonl",
    "isStreaming": false,
    "isCompacting": false,
    "compactionAvailable": false,
    "autoCompactionEnabled": true,
    "autoRetryEnabled": true,
    "model": {
      "id": "qwen3-coder-next",
      "provider": "new-api"
    },
    "contextUsage": {
      "percent": 12.5,
      "contextWindow": 128000,
      "tokens": 16000
    },
    "systemPrompt": "...",
    "thinkingLevel": "medium"
  }
}
```

Runtime 未加载：

```json
{
  "running": false
}
```

注意：该接口不会从磁盘恢复 Runtime。订阅 SSE 或发送 Command 时才会按需恢复。

### 6.3 执行 Agent Command

```http
POST /api/agent/:id
Content-Type: application/json
```

所有命令都使用同一个 Endpoint，通过 `type` 区分。

#### prompt

```json
{
  "type": "prompt",
  "message": "继续检查测试",
  "images": []
}
```

响应：

```json
{
  "accepted": true
}
```

Prompt 在后台执行，结果通过 SSE 返回。

#### abort

```json
{
  "type": "abort"
}
```

终止当前 Agent 操作。

#### get_state

```json
{
  "type": "get_state"
}
```

响应为 `AgentRuntimeState`。

#### set_model

```json
{
  "type": "set_model",
  "provider": "new-api",
  "modelId": "qwen3-coder-next"
}
```

错误：

- `404 MODEL_NOT_FOUND`

#### fork

```json
{
  "type": "fork",
  "entryId": "a1b2c3d4"
}
```

响应：

```json
{
  "sessionId": "019e...",
  "sessionFile": "C:\\Users\\example\\.pi\\agent\\sessions\\...jsonl"
}
```

Fork 成功后，原 Session Runtime 会被销毁。新 Session 在需要时重新加载。

#### navigate_tree

```json
{
  "type": "navigate_tree",
  "targetId": "a1b2c3d4"
}
```

底层成功结果可能包含：

```json
{
  "editorText": "原用户消息",
  "cancelled": false
}
```

#### set_thinking_level

```json
{
  "type": "set_thinking_level",
  "level": "high"
}
```

允许值见 `ThinkingLevel`。

#### compact

```json
{
  "type": "compact",
  "customInstructions": "保留所有文件修改和待办事项"
}
```

响应可能包含：

```json
{
  "summary": "...",
  "firstKeptEntryId": "a1b2c3d4",
  "tokensBefore": 90000,
  "details": {}
}
```

#### set_auto_compaction

```json
{
  "type": "set_auto_compaction",
  "enabled": true
}
```

#### steer

```json
{
  "type": "steer",
  "message": "优先检查 API 层",
  "images": []
}
```

#### follow_up

```json
{
  "type": "follow_up",
  "message": "完成后运行测试",
  "images": []
}
```

#### get_tools

```json
{
  "type": "get_tools"
}
```

响应：

```json
{
  "active": ["read", "bash", "edit"],
  "available": [
    {
      "name": "read",
      "description": "Read a file",
      "parameters": {},
      "sourceInfo": {}
    }
  ]
}
```

`available` 的详细 Schema 由当前 Pi SDK Tool Registry 提供。

#### set_tools

```json
{
  "type": "set_tools",
  "toolNames": ["read", "bash"]
}
```

未知工具名由 Pi SDK 忽略。

#### abort_compaction

```json
{
  "type": "abort_compaction"
}
```

#### set_auto_retry

```json
{
  "type": "set_auto_retry",
  "enabled": false
}
```

#### reload_instructions

```json
{
  "type": "reload_instructions"
}
```

重载当前 Session 的系统提示词和项目指令。用于在保存 `APPEND_SYSTEM.md` 或
`AGENTS.md` 后，让当前会话立即生效。

响应为 `AgentRuntimeState`，包含重载后的最终系统提示词。

约束：

- Agent 正在流式输出或压缩中时返回 `409 AGENT_BUSY`。
- 重载失败返回 `500 INSTRUCTION_RELOAD_FAILED`。

#### 空响应命令

底层没有业务返回值的命令统一返回：

```json
{
  "success": true
}
```

### 6.4 订阅 Agent SSE

```http
GET /api/agent/:id/events
Accept: text/event-stream
```

事件格式：

```text
event: agent
data: {"type":"connected","sessionId":"019e..."}

```

连接建立时首先发送：

```json
{
  "type": "connected",
  "sessionId": "019e..."
}
```

后续事件：

```ts
type AgentEvent =
  | { type: "error"; message: string }
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "agent_error"; error: AgentFailure }
  | { type: "message_start"; message: Partial<AssistantMessage> }
  | { type: "message_update"; message: Partial<AssistantMessage> }
  | { type: "message_end"; message: AgentMessage }
  | {
      type: "tool_execution_start";
      toolCallId: string;
      toolName: string;
    }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      isError?: boolean;
    }
  | {
      type: "retry_start";
      attempt: number;
      maxAttempts: number;
      errorMessage?: string;
    }
  | { type: "retry_end" }
  | { type: "compaction_start" }
  | {
      type: "compaction_end";
      aborted?: boolean;
      errorMessage?: string;
    };
```

`agent_error` 在模型调用失败时紧随错误 `message_end` 发出。客户端应结束运行状态并显示结构化错误；错误 assistant 消息仍会持久化到 Session，供刷新后诊断。

Transport 订阅失败时还可能发送：

```json
{
  "type": "error",
  "message": "..."
}
```

SSE 每 25 秒发送一次注释 Heartbeat：

```text
:

```

客户端断开时会自动取消订阅。若 Runtime 未加载，该接口会从 Session Storage 恢复。

浏览器示例：

```ts
const events = new EventSource(`/api/agent/${sessionId}/events`);

events.addEventListener("agent", (event) => {
  const payload = JSON.parse((event as MessageEvent).data);
  console.log(payload);
});
```

## 7. Model API

### 7.1 获取可用模型

```http
GET /api/models
```

响应：

```ts
interface ModelsResponse {
  models: Array<{
    id: string;
    name: string;
    provider: string;
    contextWindow?: number;
    maxTokens?: number;
    input?: Array<"text" | "image">;
    thinkingLevels: ThinkingLevel[];
    thinkingLevelMap?: Record<string, string | null>;
  }>;
  defaultModel: {
    provider: string;
    modelId: string;
  } | null;
}
```

当前默认模型是可用模型列表中的第一项，不是单独保存的用户偏好。

### 7.2 读取 Models Config

```http
GET /api/models-config
```

响应为 `~/.pi/agent/models.json` 中的原始 JSON Object。

文件不存在或读取失败时返回：

```json
{}
```

### 7.3 获取 Models Config 初始化数据

```http
GET /api/models-config/bootstrap
```

响应聚合模型配置弹窗初始化所需数据，避免客户端逐个请求 API Key Provider 状态。

```json
{
  "config": {
    "providers": {
      "custom": {
        "api": "openai-completions"
      }
    }
  },
  "oauthProviders": [
    {
      "id": "openai-codex",
      "name": "OpenAI Codex"
    }
  ],
  "apiKeyProviders": [
    {
      "id": "anthropic",
      "name": "Anthropic",
      "configured": true,
      "source": "stored",
      "label": "Stored API key",
      "modelCount": 2
    }
  ]
}
```

`apiKeyProviders` 只包含已配置的 API Key Provider，不返回真实 API Key。

### 7.4 覆盖 Models Config

```http
PUT /api/models-config
Content-Type: application/json
```

请求体必须是 JSON Object，内容会作为完整配置覆盖写入。

```json
{
  "providers": {
    "custom": {
      "baseUrl": "https://example.com/v1",
      "models": []
    }
  }
}
```

成功响应：

```json
{
  "success": true
}
```

注意：

- 这是完整替换，不是 Merge。
- 写入采用临时文件加 Rename。
- 写入成功后，仅当前模型命中变更 Provider 或 model 的已加载 session 会被标记为过期，并在下一次 prompt 前重新加载；无法可靠判断影响范围时保守刷新全部 session，正在进行的模型调用不会被中断。
- 具体 Config Schema 由当前 Pi SDK 版本决定。

### 7.5 发现模型配置建议

```http
POST /api/models-config/discover
Content-Type: application/json
```

请求：

```json
{
  "providerName": "new-api",
  "provider": {
    "api": "openai-completions",
    "baseUrl": "https://example.com/v1",
    "apiKey": "sk-...",
    "headers": {
      "X-Custom": "value"
    }
  }
}
```

字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `providerName` | 是 | Provider ID，用于匹配 Pi 内置模型目录 |
| `provider` | 是 | Provider 草稿配置 |
| `provider.api` | 否 | API 类型；`openai-completions` 和 `openai-responses` 会尝试远程 `/models` |
| `provider.baseUrl` | 否 | 远程模型发现的基础 URL |
| `provider.apiKey` | 否 | 仅用于本次远程发现，不会写入响应 |
| `provider.headers` | 否 | 远程发现请求附加 Header，值必须是字符串 |

响应：

```json
{
  "models": [
    {
      "source": "inferred",
      "confidence": "medium",
      "verification": "unverified",
      "model": {
        "id": "gpt-4.1",
        "name": "GPT 4.1",
        "api": "openai-completions",
        "reasoning": false,
        "input": ["text", "image"],
        "contextWindow": 1047576,
        "maxTokens": 32768,
        "cost": {
          "input": 2,
          "output": 8,
          "cacheRead": 0.5,
          "cacheWrite": 1
        }
      }
    }
  ],
  "remoteError": "Model discovery failed (401)"
}
```

`remoteError` 只表示远程发现失败；如果内置目录仍能给出建议，响应仍可包含 `models`。

`verification` 当前固定为 `unverified`。Discover 只发现候选模型和补齐目录元数据，
不代表 API Key、请求协议或消息格式已经通过真实模型请求验证。

### 7.6 测试模型配置

```http
POST /api/models-config/test
Content-Type: application/json
```

请求：

```json
{
  "provider": "new-api",
  "modelId": "qwen3-coder-next",
  "config": {
    "providers": {}
  },
  "timeoutMs": 15000
}
```

字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `provider` | 是 | Provider ID |
| `modelId` | 是 | Model ID |
| `config` | 否 | 临时测试配置；必须是 Object |
| `timeoutMs` | 否 | 超时毫秒数，默认 `15000` |

响应：

```json
{
  "ok": true,
  "latencyMs": 1234,
  "responseText": "OK",
  "verification": {
    "status": "verified",
    "scenario": "basic-chat",
    "checkedAt": "2026-06-18T10:00:00.000Z",
    "latencyMs": 1234
  }
}
```

失败也通常返回 HTTP 200，并通过 `ok: false` 表示：

```json
{
  "ok": false,
  "latencyMs": 15001,
  "error": "The model request timed out.",
  "verification": {
    "status": "failed",
    "scenario": "basic-chat",
    "checkedAt": "2026-06-18T10:00:00.000Z",
    "latencyMs": 15001
  },
  "diagnostic": {
    "code": "MODEL_TIMEOUT",
    "summary": "The model request timed out.",
    "technicalMessage": "Model test timed out",
    "provider": "new-api",
    "model": "qwen3-coder-next",
    "retryable": true
  }
}
```

协议错误可能额外返回 `diagnostic.suggestedPatch`。补丁只会包含当前生效 API
协议允许的 compat 字段，默认作用于当前 Model；客户端应先展示变更内容，由用户确认后
应用并重新测试，不能静默修改配置。

测试使用临时目录、临时 Model Registry、内存 Session、禁用自动重试，并在结束后销毁。只有收到非错误 assistant 且包含文本输出时才返回 `ok: true`；`stopReason: "error"`、空输出或缺少 assistant 响应均返回 `ok: false`。
测试会发起一次真实模型请求，可能产生费用。

## 8. Auth API

Credential 默认存储在 Pi Agent 目录下的 `auth.json`。

### 8.1 获取 OAuth Provider

```http
GET /api/auth/providers
```

响应：

```json
[
  {
    "id": "openai-codex",
    "name": "OpenAI Codex"
  }
]
```

### 8.2 获取所有 Provider

```http
GET /api/auth/all-providers
```

响应：

```json
{
  "oauth": [
    {
      "id": "openai-codex",
      "name": "OpenAI Codex"
    }
  ],
  "apiKey": [
    {
      "id": "anthropic",
      "name": "Anthropic"
    }
  ]
}
```

### 8.3 获取 API Key 状态

```http
GET /api/auth/api-key/:provider
```

响应：

```json
{
  "configured": true,
  "source": "stored",
  "label": "Stored API key"
}
```

`source` 可能是：

```text
stored
runtime
environment
fallback
models_json_key
models_json_command
```

该接口不会返回真实 API Key。

### 8.4 保存 API Key

```http
POST /api/auth/api-key/:provider
Content-Type: application/json
```

请求：

```json
{
  "apiKey": "sk-..."
}
```

成功响应：

```json
{
  "success": true
}
```

### 8.5 删除 API Key

```http
DELETE /api/auth/api-key/:provider
```

成功响应：

```json
{
  "success": true
}
```

### 8.6 启动 OAuth

```http
GET /api/auth/login/:provider
Accept: text/event-stream
```

事件名：

```text
oauth
```

可能的事件：

#### auth

```json
{
  "type": "auth",
  "url": "https://provider.example/authorize",
  "instructions": "Open this URL in your browser"
}
```

#### device_code

```json
{
  "type": "device_code",
  "userCode": "ABCD-EFGH",
  "verificationUri": "https://provider.example/device",
  "intervalSeconds": 5,
  "expiresInSeconds": 900
}
```

#### progress

```json
{
  "type": "progress",
  "message": "Waiting for authorization"
}
```

#### prompt

```json
{
  "type": "prompt",
  "token": "pending-input-token",
  "message": "Enter the authorization code",
  "placeholder": "Code",
  "allowEmpty": false
}
```

#### select

```json
{
  "type": "select",
  "token": "pending-input-token",
  "message": "Select an account",
  "options": [
    {
      "id": "account-1",
      "label": "Account 1"
    }
  ]
}
```

#### error

```json
{
  "type": "error",
  "message": "OAuth provider was not found"
}
```

#### complete

```json
{
  "type": "complete"
}
```

OAuth 客户端断开时，关联的 Pending Input 会被 Reject 和清理。

### 8.7 回传 OAuth 输入

当 OAuth SSE 收到 `prompt` 或 `select` 时，使用相同 Provider 回传：

```http
POST /api/auth/login/:provider
Content-Type: application/json
```

请求：

```json
{
  "token": "pending-input-token",
  "value": "用户输入或 option id"
}
```

成功响应：

```json
{
  "success": true
}
```

错误：

- `404 PENDING_INPUT_NOT_FOUND`
- Token 不存在、已使用、已取消或属于其他 Provider 时均返回该错误。

### 8.8 Logout

```http
POST /api/auth/logout/:provider
```

响应：

```json
{
  "success": true
}
```

## 9. File API

### 9.1 路径规则

统一入口：

```http
GET /api/files/[...path]
```

目标路径有两种来源：

1. Catch-all URL Path。
2. `path` Query，存在时优先。

由于 `/api/files/[...path]` 至少需要一个 URL Segment，通过 Query 传绝对路径时可使用占位 Segment：

```text
/api/files/_?path=C%3A%5Cworkspace%5Cproject&type=list
```

目标路径必须位于已登记的 Workspace Root 中。

Workspace Root 来源：

- 服务启动时的 `process.cwd()`
- 新 Agent 的 `cwd`
- 从磁盘恢复 Runtime 时 Session 的 `cwd`

访问 Root 之外的路径返回：

```text
403 VALIDATION_ERROR
```

### 9.2 列出目录

```http
GET /api/files/[...path]?type=list
```

省略 `type` 时默认也是 `list`。

响应：

```json
[
  {
    "name": "src",
    "path": "C:\\workspace\\project\\src",
    "isDir": true,
    "size": 0,
    "modified": "2026-06-10T01:00:00.000Z"
  }
]
```

目录列表会过滤：

- `.git`
- `.next`
- `node_modules`

错误：

- `404 FILE_NOT_FOUND`
- `400 NOT_A_DIRECTORY`

### 9.3 读取文本

```http
GET /api/files/[...path]?type=read
```

响应：

```json
{
  "content": "export default function App() {}",
  "language": "typescript",
  "size": 32
}
```

支持的语言映射：

| 扩展名 | language |
| --- | --- |
| `.ts`, `.tsx` | `typescript` |
| `.js`, `.jsx` | `javascript` |
| `.json` | `json` |
| `.md` | `markdown` |
| `.css` | `css` |
| `.html` | `html` |
| `.py` | `python` |
| `.sh` | `shell` |
| `.ps1` | `powershell` |
| 其他 | `text` |

限制：

- 文本最大 `256 KiB`。
- 当前按 UTF-8 读取，不执行二进制内容检测。

错误：

- `404 FILE_NOT_FOUND`
- `400 NOT_A_FILE`
- `413 FILE_TOO_LARGE`

### 9.4 获取二进制

```http
GET /api/files/[...path]?type=raw
GET /api/files/[...path]?type=binary
```

支持 MIME：

| 扩展名 | Content-Type |
| --- | --- |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.mp3` | `audio/mpeg` |
| `.wav` | `audio/wav` |
| `.ogg` | `audio/ogg` |
| `.pdf` | `application/pdf` |
| 其他 | `application/octet-stream` |

图片最大 `10 MiB`。音频和其他二进制没有额外业务大小限制，使用 Stream 返回。

完整响应：

```http
HTTP/1.1 200 OK
Accept-Ranges: bytes
Content-Length: 12345
Content-Type: image/png
```

### 9.5 HTTP Range

请求：

```http
GET /api/files/[...path]?type=raw
Range: bytes=0-1023
```

响应：

```http
HTTP/1.1 206 Partial Content
Accept-Ranges: bytes
Content-Length: 1024
Content-Range: bytes 0-1023/12345
```

当前接受单一 Range：

```text
bytes=start-end
```

不支持多个 Range。非法或越界 Range 返回：

```text
416 VALIDATION_ERROR
```

### 9.6 Watch 文件或目录

```http
GET /api/files/[...path]?type=watch
Accept: text/event-stream
```

事件名：

```text
file
```

初始事件：

```json
{
  "type": "connected",
  "path": "C:\\workspace\\project"
}
```

变化事件：

```json
{
  "type": "change",
  "path": "C:\\workspace\\project\\src\\app.ts"
}
```

或：

```json
{
  "type": "rename",
  "path": "C:\\workspace\\project\\src\\app.ts"
}
```

客户端断开时自动关闭 Node 文件 Watcher。

订阅失败时还可能发送 `{ "type": "error", "message": "..." }`，随后关闭流。

## 10. Skill API

### 10.1 加载 Skills

```http
GET /api/skills
GET /api/skills?cwd=C%3A%5Cworkspace%5Cproject
```

`cwd` 必需，且必须是已注册的 Workspace Root。

响应：

```json
{
  "skills": [
    {
      "skillId": "d60c...",
      "name": "example-skill",
      "description": "Example skill",
      "filePath": "C:\\...\\SKILL.md",
      "displayPath": "~\\.pi\\agent\\skills\\example-skill\\SKILL.md",
      "baseDir": "C:\\...\\example-skill",
      "sourceInfo": {
        "path": "C:\\...\\skills",
        "source": "user",
        "scope": "user",
        "origin": "top-level"
      },
      "canModify": true,
      "disableModelInvocation": false,
      "version": "6f2d..."
    }
  ],
  "diagnostics": [
    {
      "severity": "warning",
      "message": "Invalid frontmatter",
      "path": "C:\\...\\SKILL.md"
    }
  ]
}
```

该接口使用与 AgentSession 相同的 Pi SDK `DefaultResourceLoader`、
`SettingsManager`、`cwd` 和 `agentDir`，因此包含 project、global、显式 path
和 package/extension 提供的技能，并保留同名资源与 diagnostics。

### 10.2 修改模型调用开关

```http
PATCH /api/skills
Content-Type: application/json
```

请求：

```json
{
  "cwd": "C:\\workspace\\project",
  "skillId": "d60c...",
  "disabled": true,
  "expectedVersion": "6f2d..."
}
```

行为：

- `disabled: true`：写入 `disable-model-invocation: true`。
- `disabled: false`：删除该 Frontmatter 字段。
- 保留其他 Frontmatter 内容。
- 保留 BOM、换行风格、注释和其他字段。
- 文件没有 Frontmatter 且需要禁用时，会创建 Frontmatter。
- `disabled: true` 只从模型 prompt 中移除技能，显式 `/skill:name` 仍可调用。
- 服务端通过 `cwd + skillId` 重新执行资源发现，不接受客户端文件路径。
- 写入前校验 realpath、symlink 和 `expectedVersion`，并使用同目录临时文件替换。

成功响应是刷新后的完整 Skill 加载结果。`409 SKILL_CONFLICT` 表示文件已被
其他进程修改，客户端应刷新后重试。

### 10.3 搜索 Skill

```http
POST /api/skills/search
Content-Type: application/json
```

请求：

```json
{
  "query": "react testing",
  "limit": 20
}
```

规则：

- `query` 必需且不能为空。
- `limit` 必须是正数，否则使用默认值 `20`。
- 先请求 `https://skills.sh/api/search`。
- 远程 API 失败时回退 `npx --yes skills find`。
- CLI 回退使用 Node 执行 npm 自带的 `npx-cli.js`，所有参数独立传递，不使用 shell。
- CLI 有超时、输出上限、ANSI 清理。
- API 和 CLI 都失败时返回 `502 SKILL_SEARCH_FAILED`。

响应：

```json
{
  "results": [
    {
      "id": "owner/repository@react-testing",
      "name": "react-testing",
      "description": "",
      "source": "owner/repository",
      "packageSpec": "owner/repository@react-testing",
      "installs": 1200
    }
  ]
}
```

### 10.4 安装 Skill

```http
POST /api/skills/install
Content-Type: application/json
```

请求：

```json
{
  "package": "owner/repository@react-testing",
  "scope": "project",
  "cwd": "C:\\workspace\\project"
}
```

字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `package` | 是 | `skills add` 接受的 Skill Package |
| `scope` | 是 | `global` 或 `project` |
| `cwd` | Project 必需 | 已注册的 Workspace Root；Global 下用于安装后验证 |

CLI：

```text
node <npm>/bin/npx-cli.js --yes skills add <package> -y --agent pi
```

Global Scope 会追加：

```text
-g
```

成功响应：

```json
{
  "installed": true,
  "skills": [
    {
      "skillId": "d60c...",
      "name": "react-testing",
      "displayPath": ".agents\\skills\\react-testing\\SKILL.md"
    }
  ]
}
```

命令成功后会重新运行 `DefaultResourceLoader`，只有发现新增或内容发生变化且 scope
正确的技能才算安装成功；返回路径来自真实发现结果。新安装技能默认关闭模型自动
调用，但仍可显式调用。正在运行的 AgentSession 不会被静默重启，新会话、恢复会话
或显式资源 reload 后生效。

错误：

- `400 VALIDATION_ERROR`
- `409 SKILL_INSTALL_BUSY`
- `500 SKILL_INSTALL_FAILED`

### 10.5 导入本地 Skill

```http
POST /api/skills/local
Content-Type: application/json
```

请求：

```json
{
  "sourceFilePath": "D:\\my-skills\\review\\SKILL.md",
  "scope": "project",
  "cwd": "C:\\workspace\\project"
}
```

字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `sourceFilePath` | 是 | 本地 skill 文件的绝对路径（`.md` 文件）或包含 `SKILL.md` 的目录路径 |
| `scope` | 是 | `global` 或 `project` |
| `cwd` | Project 必需 | 已注册的 Workspace Root |

行为：

读取 `sourceFilePath` 指定的 skill 文件或目录。如果路径是目录，则查找该目录下的
`SKILL.md`。从其 frontmatter 中解析 `name` 字段；如果没有 frontmatter 或没有
`name` 字段，目录模式回退到源目录名，文件模式回退到源文件名（不含扩展名）作为技能名。
源为目录时会递归复制整个目录（保留脚本、模板等兄弟资源，跳过符号链接、`node_modules`
和以 `.` 开头的条目）；源为 `.md` 文件时仅写入 `SKILL.md`。目标路径为
`<cwd>/.agents/skills/<name>/`（Project scope）或 `~/.agents/skills/<name>/`（Global scope）。
写入后重新运行 `DefaultResourceLoader` 验证技能已被发现。正在运行的 AgentSession 不会被
静默重启，新会话、恢复会话或显式资源 reload 后生效。

成功响应：

```json
{
  "created": true,
  "skills": [
    {
      "skillId": "d60c...",
      "name": "my-skill",
      "displayPath": ".agents\\skills\\my-skill\\SKILL.md"
    }
  ]
}
```

错误：

- `400 VALIDATION_ERROR`（路径非法、不是 .md 文件）
- `404 VALIDATION_ERROR`（源文件不存在或不可读）
- `409 VALIDATION_ERROR`（同名技能已存在）
- `409 SKILL_INSTALL_BUSY`（有其他技能操作正在运行）
- `500 SKILL_CREATE_FAILED`

### 10.6 移除 Skill

```http
DELETE /api/skills
Content-Type: application/json
```

请求：

```json
{
  "skillId": "d60c...",
  "cwd": "C:\\workspace\\project"
}
```

字段：

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `skillId` | 是 | 要移除的技能 ID |
| `cwd` | 是 | 已注册的 Workspace Root |

CLI：

```text
node <npm>/bin/npx-cli.js --yes skills remove <name> -y --agent pi
```

仅支持 project 和 user（全局）scope 的技能，不支持 temporary scope。服务端会先加载技能列表确认 skillId 存在且 scope 可移除，然后执行 CLI（user scope 追加 `-g`）删除文件、清理符号链接、更新 lock 文件。CLI 仅管理 lock 文件中记录的技能，对于手动放置的技能（`source: "auto"`），CLI 报成功但不删文件，服务端会回退到直接删除技能目录。命令成功后重新运行 `DefaultResourceLoader` 验证技能已不存在；返回移除后的完整技能列表。

错误：

- `400 VALIDATION_ERROR`
- `403 VALIDATION_ERROR`（非 project scope）
- `404 SKILL_NOT_FOUND`
- `409 SKILL_REMOVE_BUSY`
- `500 SKILL_REMOVE_FAILED`

### 10.7 Skill Pack

Skill Pack 是由 Pi Package 承载的安装和分发单元，可以包含 Skills、Extensions、
Prompts 和 Themes。目录安装、更新、修复和移除使用服务端生成的 opaque `packId`；
手动安装接口接受经过严格校验的 Package Source。

#### 10.7.1 加载 Skill Packs

```http
GET /api/skill-packs?cwd=C%3A%5Cworkspace%5Cproject
```

`cwd` 必需，且必须位于已注册的 Workspace Root 内。响应包含未安装的官方目录项和
Pi Settings 中已配置的 Package；两者都为空时返回空列表：

```json
{
  "packs": []
}
```

`status` 可为 `available`、`installed` 或 `broken`。`scope` 可为 `user`、
`project` 或 `null`。配置存在但安装路径或声明资源缺失时返回 `broken`，使用户仍可
看到并移除损坏的 Package。`version` 来自已安装目录的 `package.json`；
`availableVersion` 来自官方目录；`canUpdate` 表示 Pi 能否更新该远程 Source；
`updateAvailable` 表示已确认存在不同的可用版本。响应中的 Source 会移除 URL
凭据、查询参数和 fragment。

#### 10.7.2 安装 Skill Pack

```http
POST /api/skill-packs/install
Content-Type: application/json
```

```json
{
  "packId": "pack_6de4b2c214eb3517",
  "scope": "project",
  "cwd": "C:\\workspace\\project"
}
```

`scope` 为 `project` 或 `global`。服务端使用 `packId` 在官方目录中重新解析真实
Package Source，调用 Pi Package Manager 持久化安装，重新解析资源并校验目录声明的
Skills。校验失败时会尝试回滚本次安装。成功响应为刷新后的完整 Skill Pack 列表。

错误：

- `400 VALIDATION_ERROR`
- `404 SKILL_PACK_NOT_FOUND`
- `409 VALIDATION_ERROR`（已经安装）
- `409 SKILL_PACK_INSTALL_BUSY`
- `500 SKILL_PACK_INSTALL_FAILED`

#### 10.7.3 从 Package Source 安装

```http
POST /api/skill-packs/install-source
Content-Type: application/json
```

```json
{
  "source": "D:\\skill-packs\\release-workflows",
  "scope": "project",
  "cwd": "C:\\workspace\\project"
}
```

`source` 可以是 `npm:` 引用、`git:` 引用、显式 `http://` / `https://` / `ssh://` /
`git://` 仓库 URL，或现存的本地绝对目录。裸 npm 名称、裸 Git SCP 引用和 `git+*://`
协议不被接受，因为当前 Pi Package Manager 会把它们解释为本地相对路径。
`npm:` 后缀仅接受 registry version、tag 或不含空格的 range；URL、`file:` 和 npm alias spec
会返回 `400 VALIDATION_ERROR`。
相对路径、控制字符、不支持的协议，以及包含用户名、密码、查询参数或 fragment 的
URL 会返回 `400 VALIDATION_ERROR`。本地目录可以位于当前 Workspace 外；服务端会在
Pi 读取前把该目录注册为 Workspace Root。安装会写入对应 scope 的 Pi Settings，且
必须至少解析出一个启用资源，否则回滚本次配置。

错误：

- `400 VALIDATION_ERROR`
- `409 VALIDATION_ERROR`（已经安装）
- `409 SKILL_PACK_INSTALL_BUSY`
- `500 SKILL_PACK_INSTALL_FAILED`

#### 10.7.4 更新 Skill Pack

```http
POST /api/skill-packs/update
Content-Type: application/json
```

```json
{
  "packId": "pack_6de4b2c214eb3517",
  "cwd": "C:\\workspace\\project"
}
```

服务端根据当前 Pi Settings 解析 Source，并调用 Pi Package Manager 更新 npm 或 Git
Package。本地目录不能通过此接口更新，应直接修改源目录后重新加载。更新后必须重新
解析出健康资源；失败不会移除原 Package 配置。

错误：

- `400 VALIDATION_ERROR`
- `404 SKILL_PACK_NOT_FOUND`
- `409 VALIDATION_ERROR`（本地 Source）
- `409 SKILL_PACK_INSTALL_BUSY`
- `500 SKILL_PACK_UPDATE_FAILED`

#### 10.7.5 修复 Skill Pack

```http
POST /api/skill-packs/repair
Content-Type: application/json
```

请求体与更新接口相同。修复只接受 `broken` Pack，并使用 Pi 的非持久化 `install`
重新获取或检查原 Source，不重复写入 Settings。修复失败时 Pack 配置仍保留，以便继续
展示、重试或移除。

错误：

- `400 VALIDATION_ERROR`
- `404 SKILL_PACK_NOT_FOUND`
- `409 VALIDATION_ERROR`（Pack 当前并非 `broken`）
- `409 SKILL_PACK_INSTALL_BUSY`
- `500 SKILL_PACK_REPAIR_FAILED`

#### 10.7.6 移除 Skill Pack

```http
DELETE /api/skill-packs
Content-Type: application/json
```

```json
{
  "packId": "pack_6de4b2c214eb3517",
  "cwd": "C:\\workspace\\project"
}
```

服务端只根据当前 Pi Settings 中的 Package 配置解析 opaque `packId`，调用 Pi
Package Manager 从原 scope 移除并重新加载确认。成功响应为刷新后的完整列表。

错误：

- `400 VALIDATION_ERROR`
- `404 SKILL_PACK_NOT_FOUND`
- `409 SKILL_PACK_INSTALL_BUSY`
- `500 SKILL_PACK_REMOVE_FAILED`

上述变更都会修改本机 Pi Package 状态，且不会热重载已运行的 Agent Runtime。刷新后的
Skills 页面可立即看到新资源；新建 Agent 会加载最新资源，已有 Agent 会话保持原资源集。

## 11. Instructions API

系统提示词与项目指令管理接口。支持读取、保存和删除全局追加提示词
（`~/.pi/agent/APPEND_SYSTEM.md`）和项目指令（`<root>/AGENTS.md`）。

### 11.1 InstructionDocument

```ts
interface InstructionDocument {
  content: string;
  exists: boolean;
  filePath: string;
  revision: string;
}
```

- `content`：文件文本内容；文件不存在时为空字符串。
- `exists`：文件是否存在于磁盘。
- `filePath`：文件绝对路径。
- `revision`：文件内容的 SHA-256 指纹；文件不存在时为 `sha256:absent`。

### 11.2 读取全局追加提示词

```http
GET /api/instructions/system
```

响应：

```json
{
  "append": {
    "content": "Additional instructions...",
    "exists": true,
    "filePath": "C:\\Users\\example\\.pi\\agent\\APPEND_SYSTEM.md",
    "revision": "sha256:abc123..."
  }
}
```

### 11.3 保存全局追加提示词

```http
PUT /api/instructions/system
Content-Type: application/json
```

请求：

```json
{
  "content": "Additional instructions...",
  "expectedRevision": "sha256:abc123...",
  "force": false
}
```

| 字段 | 必需 | 说明 |
| --- | --- | --- |
| `content` | 是 | 文件文本内容 |
| `expectedRevision` | 是 | 客户端上次读取到的 revision；首次创建时传 `sha256:absent` |
| `force` | 否 | 为 `true` 时跳过 revision 冲突检查 |

响应与读取接口相同。内容超过 64 KB 时返回 `400 INSTRUCTION_TOO_LARGE`。
revision 不匹配时返回 `409 INSTRUCTION_CONFLICT`。

### 11.4 删除全局追加提示词

```http
DELETE /api/instructions/system
Content-Type: application/json
```

请求：

```json
{
  "expectedRevision": "sha256:abc123...",
  "force": false
}
```

成功响应为 `204 No Content`。文件不存在时视为已删除，仍返回 204。

### 11.5 读取项目指令

```http
GET /api/instructions/project?cwd=C%3A%5Cworkspace%5Cproject
```

`cwd` 必需，且必须是已注册的 Workspace Root。

响应：

```json
{
  "project": {
    "content": "# Project Instructions\n...",
    "exists": true,
    "filePath": "C:\\workspace\\project\\AGENTS.md",
    "revision": "sha256:def456..."
  }
}
```

### 11.6 保存项目指令

```http
PUT /api/instructions/project
Content-Type: application/json
```

请求：

```json
{
  "cwd": "C:\\workspace\\project",
  "content": "# Project Instructions\n...",
  "expectedRevision": "sha256:def456...",
  "force": false
}
```

响应与读取接口相同。`cwd` 未注册时返回 `403 PROJECT_NOT_REGISTERED`。

### 11.7 删除项目指令

```http
DELETE /api/instructions/project
Content-Type: application/json
```

请求：

```json
{
  "cwd": "C:\\workspace\\project",
  "expectedRevision": "sha256:def456...",
  "force": false
}
```

成功响应为 `204 No Content`。

### 11.8 追加提示词组合顺序

Pi ResourceLoader 在创建 Agent Runtime 时显式组合追加提示词来源：

1. 全局 `~/.pi/agent/APPEND_SYSTEM.md`
2. 项目 `<cwd>/.pi/APPEND_SYSTEM.md`（如果外部工具已创建）

全局来源始终生效，不会被项目级文件遮蔽。项目 `AGENTS.md` 由 Pi SDK 默认
发现逻辑加载，不在此显式组合范围内。

保存指令文件后，新建会话会自动使用最新文件。已有会话需要通过
`reload_instructions` 命令显式重载才能生效。

## 12. Generation API

内容生成与聊天共用同一种持久化 Pi Session。生成请求创建 SQLite 中的 Generation Run，进程内 Worker 负责供应商提交、轮询、下载与恢复。旧的 `/api/content-generation/*`、JSON Session/Job 和可编辑 HTTP 模板接口已删除。

### 12.1 查询生成路由

```http
GET /api/generation/routes
```

仅返回启用的、由应用管理的 Route。每项包含 `id`、`name`、`capability`、`providerId`、`enabled`、`isDefault`、`revision`、`defaults` 与供应商无关的 `inputSchema`。供应商 operation、credential reference 和 adapter 配置不会返回。

`inputSchema` 定义 Prompt 规则、语义参数和素材槽位。客户端必须按这些稳定语义字段构建输入，不得依赖 RunningHub 的原始请求字段。

### 12.2 注册素材并创建或列出 Run

浏览器文件先登记为 workspace 文件：

```http
POST /api/sessions/:id/generation-assets
Content-Type: multipart/form-data

file=<binary>
```

单文件上限 50 MiB，写入 `<workspace>/.po-agent/generation-inputs/`。绝对路径和 workspace 外路径会被拒绝。

```http
GET  /api/sessions/:id/generation-runs
POST /api/sessions/:id/generation-runs
Content-Type: application/json
```

`POST` 示例：

```json
{
  "capability": "image-to-video",
  "routeId": "runninghub-seedance-2-image-to-video",
  "prompt": "镜头缓慢推进人物",
  "idempotencyKey": "client-request-019f...",
  "source": "direct-ui",
  "parameters": {
    "durationSeconds": 5,
    "aspectRatio": "16:9"
  },
  "assets": [
    {
      "slot": "firstFrameUrl",
      "ref": {
        "type": "workspace-file",
        "relativePath": ".po-agent/generation-inputs/first-frame.png"
      }
    }
  ]
}
```

- `routeId` 可省略；此时选择 capability 的默认 Route。
- `idempotencyKey` 必填且最长 200 字符；相同 key 与相同请求返回原 Run，不会重复创建供应商任务；内容冲突返回 `409 GENERATION_IDEMPOTENCY_CONFLICT`。
- `assets[].slot` 使用 `firstFrameUrl`、`imageUrls` 等语义槽位。
- `assets[].ref` 支持同 Session Artifact 或 workspace-relative 文件。
- HTTP 来源只允许 `direct-ui` 或 `api`。

只有已经持久化的 Pi Session 可以创建 Run。首次创建时，服务端把 Session 元数据投影到 SQLite；Pi 消息树仍由 Pi Session 文件保存。响应为 `{ created, run, jobs, artifacts }`，不包含凭证、lease 或 adapter 快照。

### 12.3 查询、取消和重试 Run

```http
GET  /api/generation-runs/:id
POST /api/generation-runs/:id/cancel
POST /api/generation-runs/:id/retry
Content-Type: application/json
```

Run 状态：

```text
queued | running | succeeded | failed | cancel_requested | cancelled
```

Provider Job 状态：

```text
created | uploading | submitting | submitted | polling | downloading |
succeeded | failed | submission_unknown | cancelled
```

`submission_unknown` 表示提交可能已到达供应商但本地未收到确认，Worker 不会自动重提，以避免重复计费。

RunningHub 当前不支持远端取消。取消接口停止本地推进；已提交的远端任务仍可能运行和计费。重试请求体为 `{ "idempotencyKey": "retry-request-..." }`，保留 Run ID 并创建 `attempt + 1` 的 Job。

### 12.4 RunningHub 凭证

```http
GET    /api/generation/credentials/runninghub
PUT    /api/generation/credentials/runninghub
DELETE /api/generation/credentials/runninghub
```

响应只返回 `{ "hasCredential": true }`。`PUT` 接受 `{ "apiKey": "..." }`。API Key 保存于服务端凭证文件，不进入 SQLite、Run、Job、Artifact、日志或 HTTP 响应；未保存文件凭证时可使用服务端 `RUNNINGHUB_API_KEY` 环境变量。

### 12.5 持久化执行行为

- Session 元数据、Run、Provider Job、Route 和 Artifact 使用 `<agent-data-dir>/po-agent.sqlite`。
- Worker 使用 lease claim 推进到期 Job，页面断开不会取消 Run。
- 轮询失败保留 remote task ID 并延迟重试。
- `submitting` 阶段中断后，lease 过期时转为 `submission_unknown`，不会自动重提。
- 成功产物下载到 `<workspace>/.po-agent/generated/<runId>/`。

### 12.6 Agent 内容生成工具

每个持久化 Pi Session 注册：

```text
generate_image
generate_video
get_generation
cancel_generation
```

生成工具只接收供应商无关的 `prompt`、可选 `routeId`、`parameters` 与 `assets`，不会接收 RunningHub workflow、HTTP 字段、上传 URL 或 API Key。工具调用用 Session ID 与 Pi tool-call ID 构造持久化幂等键；恢复或重放时返回同一个 Run。

工具最多等待 30 秒并通过 Pi `onUpdate` 报告状态。超时或 Agent 中止只结束等待，不取消 Worker 中的 Run。`get_generation` 与 `cancel_generation` 只能访问当前 Session 的 Run。

成功结果的 `ToolResultMessage.details` 保留 `runId`、`status`、`artifacts` 和可选错误，Chat UI 直接渲染这些结构化数据，不解析供应商 JSON 或工具文本。

## 13. SSE 通用行为

Agent、OAuth 和 File Watch 使用相同的 SSE Transport。

响应 Header：

```http
Cache-Control: no-cache, no-transform
Connection: keep-alive
Content-Type: text/event-stream; charset=utf-8
X-Accel-Buffering: no
```

每个事件格式：

```text
event: <eventName>
data: <JSON>

```

事件名：

| API | eventName |
| --- | --- |
| Agent Events | `agent` |
| OAuth Login | `oauth` |
| File Watch | `file` |

每 25 秒发送 Heartbeat 注释。客户端关闭连接后，服务端会：

1. 清除 Heartbeat。
2. 调用订阅 Cleanup。
3. Abort 内部 Signal。
4. 关闭 Stream。

## 14. 完整 Agent 调用示例

### 14.1 创建 Session

```bash
curl -X POST http://localhost:3000/api/agent/new \
  -H "Content-Type: application/json" \
  -d '{
    "cwd": "C:\\workspace\\project",
    "message": "分析这个项目",
    "provider": "new-api",
    "modelId": "qwen3-coder-next"
  }'
```

返回：

```json
{
  "sessionId": "019e..."
}
```

### 14.2 订阅事件

```bash
curl -N http://localhost:3000/api/agent/019e.../events
```

### 14.3 发送后续 Prompt

```bash
curl -X POST http://localhost:3000/api/agent/019e... \
  -H "Content-Type: application/json" \
  -d '{
    "type": "prompt",
    "message": "继续，并运行测试"
  }'
```

### 14.4 页面恢复

先获取磁盘 Session：

```http
GET /api/sessions/019e...?includeState=true
```

再订阅：

```http
GET /api/agent/019e.../events
```

订阅会在 Runtime 不存在时从 Session 文件恢复。

## 15. 当前已知限制

1. API 没有面向公网的身份认证和访问控制。
2. Runtime Registry、Workspace Roots 和 OAuth Pending Input 都保存在单进程内存中。
3. 服务重启后 Runtime Snapshot 变为未加载，但 Session 仍可从磁盘恢复。
4. 普通成功响应没有统一 `{ success, data }` 包装，只有错误响应统一包装。
5. 无业务返回值的 Agent Command 统一返回 `{ "success": true }`。
6. Model Test 会执行真实模型请求，可能产生费用。
7. Models Config PUT 是完整覆盖，不是增量更新。
8. Models Config Discovery 只能可靠发现模型 ID；上下文窗口、输出 token、价格、图片输入和推理能力会优先从内置目录补齐，否则使用保守默认值。
9. Agent Runtime 支持 `reload_instructions` 命令热重载系统提示词和项目指令；
   Skill 设置在新建、恢复或已有 reload 能力的 Session 中生效。
10. File API 仅过滤 `.git`、`.next`、`node_modules`，没有读取 `.gitignore`。
11. 文本读取固定使用 UTF-8，没有编码探测。
12. Range 只支持一个显式区间，不支持多 Range 和标准后缀区间语义。
13. 当前默认模型是可用模型列表第一项，不是持久化的用户默认选择。

## 16. 实现位置

| 内容 | 目录 |
| --- | --- |
| Next.js Route Handler | `src/app/api` |
| HTTP JSON 和错误转换 | `src/server/transport/http` |
| SSE Transport | `src/server/transport/sse` |
| Application Service | `src/server/application` |
| Domain Contracts | `src/server/domain` |
| Port Interfaces | `src/server/ports` |
| Pi SDK、文件系统和进程适配器 | `src/server/infrastructure` |
| 依赖组装 | `src/server/composition/container.ts` |
