# Provider 与模型配置可用性闭环设计

## 1. 背景

Po Agent 允许用户通过 Model Config 的 “Add Provider / Discover Models” 配置自定义 Provider 和模型。当前流程可以发现模型 ID、补齐部分模型元数据并保存配置，但“配置成功”不等于“模型实际可用”。

已出现的典型问题是：

1. 用户配置了一个兼容 OpenAI Completions 的 Provider。
2. Discover 能发现 `deepseek-v4-pro`，API Key 和基础地址也有效。
3. Pi 根据默认兼容性判断发送了 `developer` role。
4. 上游只接受 `system`、`user`、`assistant`、`tool` 等角色，因此真实请求返回 HTTP 400。
5. Chat 没有完整展示模型返回的 `errorMessage`，用户只看到没有结果，开发者也缺少定位依据。

这类问题不能通过按模型 ID 硬编码 `supportsDeveloperRole: false` 根治。硬编码只能修复已知模型，无法覆盖其他 Provider、代理网关、模型别名和后续协议差异，还可能把只属于某个 API 协议的兼容字段错误地应用到其他协议。

本设计建立以下完整闭环：

```text
协议约束配置
    ↓
能力与目录探测
    ↓
最小真实请求验证
    ↓
结构化诊断
    ↓
用户确认配置补丁
    ↓
重新验证
    ↓
进入 Chat 使用
```

## 2. 目标

1. 用户只能配置当前 API 协议实际支持的 `compat` 字段。
2. 明确区分“发现了模型”和“验证模型可用”，不再把 Discover 结果当作可用性证明。
3. 保存前同时在客户端和服务端清理不属于当前协议的兼容字段。
4. 使用真实、低成本的模型请求验证认证、端点、协议和关键兼容能力。
5. 将上游错误转换为稳定、可展示、可排查的诊断信息。
6. 对可识别的兼容问题生成最小配置补丁，由用户确认后应用并重新验证。
7. Chat 请求失败时展示可行动的错误，不再静默丢弃 `errorMessage`。
8. 移除按模型 ID 注入兼容配置的长期方案，使配置行为由协议和验证结果驱动。

## 3. 非目标

1. 不尝试在 Discover 阶段穷举所有模型能力。
2. 不保证一次验证覆盖长上下文、图片、全部工具调用和所有推理模式。
3. 不自动修改用户配置或在后台静默重试不同协议参数。
4. 不把 API Key、Authorization Header 或完整上游响应写入日志、响应或 UI。
5. 不为每个厂商维护一套独立、不可复用的 Provider 特判。
6. 不把验证状态写入 Pi 的 `models.json`；验证状态属于应用运行数据，不属于模型定义。

## 4. 核心原则

### 4.1 协议决定配置字段

模型的生效协议为：

```text
effectiveApi = model.api ?? provider.api
```

`compat` 可配置字段必须根据 `effectiveApi` 决定。不能因为某个字段存在于 Pi 的某个类型中，就向所有协议暴露该字段。

### 4.2 自动发现是建议，不是事实

Discover 返回的是候选模型和元数据建议。它可以证明：

- Provider 地址可访问，或本地目录中存在对应 Provider。
- 找到了一个或多个模型 ID。
- 某些模型元数据可以从可信目录补齐。

它不能证明：

- 当前 API Key 有模型调用权限。
- 当前模型接受 Pi 生成的消息结构。
- Provider 支持 `developer` role、推理参数、流式 usage 或工具字段。
- 模型能够成功返回 Assistant 内容。

因此 Discover 结果统一标记为 `unverified`。

### 4.3 真实请求是可用性的最终依据

只有完成一次最小真实请求，并收到可接受的 Assistant 终止结果，才能把模型标记为 `verified`。

HTTP 200 本身不是成功。验证还必须检查：

- 返回中存在 Assistant 消息。
- `stopReason` 不是错误终止。
- 没有 `errorMessage`。
- 至少包含文本内容，或存在协议允许的有效完成结果。

### 4.4 诊断与修复分离

系统可以根据错误生成建议，但不能直接改写用户配置。建议必须包含：

- 稳定错误码。
- 面向用户的摘要。
- 已脱敏的技术信息。
- 建议修改的配置路径和值。
- 修改原因。
- 重新验证入口。

用户确认后，系统才应用补丁并重新测试。

### 4.5 未知能力保持 Auto

布尔兼容字段使用三态语义：

| UI 值 | 持久化值 | 含义 |
| --- | --- | --- |
| Auto | 不写入字段 | 交给 Pi 根据端点、目录或默认行为判断 |
| Enabled | `true` | 用户明确声明支持 |
| Disabled | `false` | 用户明确声明不支持 |

不能把“探测不到”自动解释为 `false`。缺乏证据时保留 Auto，真实请求失败后再给出建议。

## 5. 协议约束配置

Pi 的 `Model<TApi>` 使用条件类型限制 `compat`：

```ts
compat?: TApi extends "openai-completions"
  ? OpenAICompletionsCompat
  : TApi extends "openai-responses"
    ? OpenAIResponsesCompat
    : TApi extends "anthropic-messages"
      ? AnthropicMessagesCompat
      : never;
```

Po Agent 应建立一份共享的“协议兼容字段注册表”，作为以下行为的唯一来源：

- Provider 和 Model 配置 UI。
- 客户端保存前清理。
- Transport 输入校验。
- 服务端持久化前清理。
- 诊断建议合法性检查。
- 测试用例。

注册表描述字段名、类型、可选值、默认语义、适用协议和 UI 帮助信息，但不包含 Provider 或模型 ID 特判。

### 5.1 `openai-completions`

允许配置：

| 字段 | 类型 |
| --- | --- |
| `supportsStore` | 三态布尔 |
| `supportsDeveloperRole` | 三态布尔 |
| `supportsReasoningEffort` | 三态布尔 |
| `supportsUsageInStreaming` | 三态布尔 |
| `maxTokensField` | `max_completion_tokens` / `max_tokens` / Auto |
| `requiresToolResultName` | 三态布尔 |
| `requiresAssistantAfterToolResult` | 三态布尔 |
| `requiresThinkingAsText` | 三态布尔 |
| `requiresReasoningContentOnAssistantMessages` | 三态布尔 |
| `thinkingFormat` | `openai` / `openrouter` / `deepseek` / `together` / `zai` / `qwen` / `qwen-chat-template` / Auto |
| `openRouterRouting` | 结构化 JSON |
| `vercelGatewayRouting` | 结构化 JSON |
| `zaiToolStream` | 三态布尔 |
| `supportsStrictMode` | 三态布尔 |
| `cacheControlFormat` | `anthropic` / Auto |
| `sendSessionAffinityHeaders` | 三态布尔 |
| `supportsLongCacheRetention` | 三态布尔 |

### 5.2 `openai-responses`

允许配置：

| 字段 | 类型 |
| --- | --- |
| `sendSessionIdHeader` | 三态布尔 |
| `supportsLongCacheRetention` | 三态布尔 |

### 5.3 `anthropic-messages`

允许配置：

| 字段 | 类型 |
| --- | --- |
| `supportsEagerToolInputStreaming` | 三态布尔 |
| `supportsLongCacheRetention` | 三态布尔 |
| `sendSessionAffinityHeaders` | 三态布尔 |
| `supportsCacheControlOnTools` | 三态布尔 |
| `forceAdaptiveThinking` | 三态布尔 |

### 5.4 其他协议

当前 Pi 类型没有为 `google-generative-ai` 暴露 `compat`。UI 不展示兼容配置，保存时移除其 `compat`。

未来新增协议时，必须先扩展协议注册表及测试，不能默认复用 `openai-completions` 字段。

## 6. Provider 与 Model 的覆盖关系

Provider 和 Model 都可以配置 `compat`：

```text
effectiveCompat = provider.compat + model.compat
```

同名字段以 Model 为准。语义如下：

- Provider compat：该端点下模型的共同兼容规则。
- Model compat：单个模型对 Provider 默认规则的覆盖。
- Model 的 Auto：删除 Model 层字段，重新继承 Provider。
- Provider 的 Auto：删除 Provider 层字段，交给 Pi 自动判断。

UI 应同时展示：

- 当前生效 API。
- 字段来自 Provider、Model 还是 Auto。
- Model 覆盖 Provider 时的明确标记。

当 Provider 或 Model 的 API 改变时：

1. 重新计算 `effectiveApi`。
2. 找出不属于新协议的 compat 字段。
3. 在 UI 中告知用户将移除哪些字段。
4. 用户确认后清理不兼容字段。
5. 将已有验证状态标记为 `stale`。

服务端仍必须再次清理，不能信任客户端已经正确处理。

## 7. 配置生命周期

### 7.1 状态定义

每个 Provider/Model 组合在应用中具有以下验证状态：

| 状态 | 含义 |
| --- | --- |
| `unverified` | 已添加或已发现，但没有完成真实请求验证 |
| `testing` | 正在执行真实请求 |
| `verified` | 当前配置指纹下验证成功 |
| `failed` | 当前配置指纹下验证失败，并有诊断结果 |
| `stale` | 曾验证成功，但影响请求的配置已变化 |

验证状态应保存在 Po Agent 自己的运行数据中，而不是写入 Pi `models.json`。

### 7.2 配置指纹

验证状态与配置指纹绑定。指纹至少包含：

- Provider 名称。
- Provider API。
- Provider base URL。
- Provider compat。
- Model ID。
- Model API 覆盖。
- Model compat。
- 认证配置的非敏感版本标识。

不允许把 API Key 原文放入指纹、日志或响应。认证变更可通过凭据更新时间、不可逆摘要或内部版本号使状态失效。

以下变更会把 `verified` 变为 `stale`：

- API、base URL 或模型 ID 改变。
- Provider 或 Model compat 改变。
- API Key/OAuth 凭据改变。
- 与请求格式有关的模型元数据改变。

## 8. Discover：目录与连接探测

Discover 负责生成模型建议，不负责宣布模型可用。

### 8.1 数据来源

按可靠性从高到低：

1. Provider 远程模型列表。
2. Pi 内置模型目录。
3. 已知 Provider 的静态目录。
4. 根据模型 ID 推断的保守默认值。

每条建议保留：

```ts
interface ModelDiscoverySuggestion {
  verification: "unverified";
  model: ModelEntry;
}
```

### 8.2 Discover 的成功标准

满足以下任一条件即可返回建议：

- 远程模型列表请求成功并返回模型。
- 远程请求失败，但本地目录存在可用建议。

如果发生降级，结果必须明确返回 warning，不能把目录回退伪装成远程连接成功。

### 8.3 Discover 不进行的操作

- 不发送 Chat Completion。
- 不自动试错 compat 参数。
- 不根据模型名称写入未验证的兼容结论。
- 不把模型标记为 `verified`。

目录中明确携带的 compat 元数据可以作为初始建议展示，但仍需真实请求验证。

## 9. 真实请求验证

### 9.1 验证输入

验证使用尚未保存的 Provider 和 Model 草稿，因此用户可以先测试再决定是否保存。

请求包含：

- Provider 名称与草稿。
- Model 草稿。
- 可选的验证场景，第一阶段仅支持 `basic-chat`。

凭据只在服务端解析，不能由验证响应返回。

### 9.2 最小验证请求

`basic-chat` 使用低成本、确定性的请求：

- 简短 system/developer 指令。
- 简短 user 消息。
- 很小的输出 token 上限。
- 不启用工具。
- 不要求长上下文。
- 不主动启用高推理等级。
- 使用与正常 Chat 相同的 Pi 模型构造和消息映射路径。

验证必须尽可能复用生产 Chat 的请求生成路径，否则测试成功也不能代表实际 Chat 可用。

### 9.3 成功条件

验证成功必须同时满足：

1. 请求完成且没有抛出上游错误。
2. 存在 Assistant 响应。
3. Assistant 没有 `errorMessage`。
4. `stopReason` 不表示 error、aborted 或 rejected。
5. 响应内容符合最小场景预期。

验证结果包含耗时，但不返回完整原始请求和敏感 Header。

### 9.4 后续扩展场景

在基础闭环稳定后，可按需增加：

- `streaming-usage`
- `reasoning`
- `tool-call`
- `image-input`
- `long-context`

这些场景必须独立显示验证结果，不能因为 `basic-chat` 成功就推断全部能力成功。

## 10. 可诊断错误

### 10.1 统一诊断结构

Model Test 和 Chat 共享稳定的错误分类：

```ts
interface ModelDiagnostic {
  code:
    | "MODEL_AUTH_FAILED"
    | "MODEL_NOT_FOUND"
    | "MODEL_RATE_LIMITED"
    | "MODEL_TIMEOUT"
    | "MODEL_UNAVAILABLE"
    | "MODEL_PROTOCOL_ERROR"
    | "MODEL_RESPONSE_INVALID"
    | "MODEL_REQUEST_FAILED"
    | "UNKNOWN_MODEL_ERROR";
  summary: string;
  technicalMessage?: string;
  provider?: string;
  model?: string;
  retryable: boolean;
  suggestedPatch?: {
    scope: "provider" | "model";
    api: string;
    changes: Record<string, unknown>;
    reason: string;
  };
}
```

`code` 供程序和测试使用，`summary` 面向用户，`technicalMessage` 面向排查。UI 不通过匹配 `summary` 决定行为。

### 10.2 错误信息处理

上游 `errorMessage` 不能被忽略。处理流程为：

```text
Pi / 上游错误
    ↓
基础脱敏
    ↓
错误分类
    ↓
提取稳定诊断字段
    ↓
Model Test JSON 或 Agent SSE
    ↓
UI 错误卡片
```

基础脱敏至少处理：

- Bearer Token。
- 常见 API Key 格式。
- Authorization Header。
- URL 中的敏感 query 参数。
- 请求体中的 credential 字段。

服务端日志可以记录错误码、Provider、Model、HTTP 状态和请求 ID，但不能记录凭据和完整请求体。

### 10.3 兼容问题识别

第一阶段支持以下高价值诊断：

| 上游错误特征 | 前提协议 | 建议补丁 |
| --- | --- | --- |
| 不支持 `developer` role | `openai-completions` | `compat.supportsDeveloperRole = false` |
| 不支持 `reasoning_effort` | `openai-completions` | `compat.supportsReasoningEffort = false` |
| 不支持 `max_completion_tokens` | `openai-completions` | `compat.maxTokensField = "max_tokens"` |
| 不支持 `stream_options.include_usage` | `openai-completions` | `compat.supportsUsageInStreaming = false` |
| Tool 定义拒绝 `strict` | `openai-completions` | `compat.supportsStrictMode = false` |
| Tool result 缺少 `name` | `openai-completions` | `compat.requiresToolResultName = true` |
| Tool 上不支持 `cache_control` | `anthropic-messages` | `compat.supportsCacheControlOnTools = false` |
| 不支持 eager tool input streaming | `anthropic-messages` | `compat.supportsEagerToolInputStreaming = false` |

生成补丁前必须检查：

1. 建议字段属于当前 `effectiveApi`。
2. 当前配置没有显式设置相反值；若有，诊断只解释冲突，不覆盖。
3. 补丁只包含解决当前错误所需的最小变更。
4. 原始错误经过脱敏。

无法可靠识别时，只返回诊断，不生成补丁。

### 10.4 补丁应用

UI 提供“应用建议并重新测试”，执行顺序为：

1. 展示补丁路径、旧值、新值和原因。
2. 用户确认。
3. 在 Model 层应用补丁，避免影响同一 Provider 下的其他模型。
4. 重新计算配置指纹。
5. 再次执行真实请求。
6. 验证成功后标记为 `verified`。

用户可以手动选择把同一设置提升到 Provider 层，但系统不默认扩大影响范围。

## 11. Chat 错误展示

即使模型未验证，用户仍可选择在 Chat 中使用；系统应显示风险提示，但不强制阻断高级用户。

模型请求失败时，Chat 必须：

- 保留失败的 Assistant 消息。
- 显示稳定错误摘要和错误码。
- 显示 Provider、Model 和是否可重试。
- 允许展开已脱敏技术信息。
- 提供复制诊断信息的操作。
- 对存在兼容建议的错误，提供进入 Model Config 的入口。

Chat 不直接自动改配置。配置修复仍在 Model Config 中完成，以避免聊天流程产生隐式全局副作用。

## 12. API 合同建议

### 12.1 Discover

`POST /api/models-config/discover`

响应示例：

```json
{
  "models": [
    {
      "source": "remote",
      "confidence": "high",
      "verification": "unverified",
      "model": {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "api": "openai-completions"
      }
    }
  ],
  "warnings": []
}
```

### 12.2 Model Test

`POST /api/models-config/test`

成功响应：

```json
{
  "success": true,
  "verification": {
    "status": "verified",
    "scenario": "basic-chat",
    "latencyMs": 842,
    "checkedAt": "2026-06-18T10:00:00.000Z"
  }
}
```

可诊断失败响应：

```json
{
  "success": false,
  "verification": {
    "status": "failed",
    "scenario": "basic-chat",
    "checkedAt": "2026-06-18T10:00:00.000Z"
  },
  "diagnostic": {
    "code": "MODEL_PROTOCOL_ERROR",
    "summary": "上游接口不接受 developer 消息角色。",
    "technicalMessage": "HTTP 400: messages[0].role must be one of system, user, assistant, tool",
    "provider": "custom-deepseek",
    "model": "deepseek-v4-pro",
    "retryable": false,
    "suggestedPatch": {
      "scope": "model",
      "api": "openai-completions",
      "changes": {
        "compat.supportsDeveloperRole": false
      },
      "reason": "该端点只接受 system role。"
    }
  }
}
```

模型不兼容属于一次验证的业务结果，接口可返回 HTTP 200 和 `success: false`。请求体非法、Provider 不存在等传输或资源错误仍使用标准 HTTP 错误响应。

### 12.3 保存配置

`PUT /api/models-config`

保存流程：

1. Transport 校验基础结构和协议枚举。
2. 根据 Provider/Model 的生效协议过滤 compat。
3. 校验枚举值和复杂 JSON 结构。
4. 拒绝类型错误和危险字段。
5. 持久化清理后的配置。
6. 将受影响模型的验证状态标记为 `stale`。

服务端不能原样持久化客户端提交的任意 `compat` 对象。

## 13. 模块边界

遵循现有依赖方向：

```text
domain <- ports <- application <- transport
domain/ports <- infrastructure
```

建议职责如下：

### Domain

- API 协议、验证状态和诊断类型。
- 与厂商 SDK 无关的配置补丁结构。
- 验证成功/失败的业务结果。

### Ports

- 读取和写入模型配置。
- Discover 模型建议。
- 执行隔离的模型验证。
- 可选的验证状态存储接口。

### Application

- 编排 Discover、Test、保存和状态失效。
- 不解析 Pi 错误文本，不直接依赖 Pi 类型。

### Infrastructure

- Pi 模型构造和真实请求。
- Pi 消息与完成结果映射。
- 上游错误提取、脱敏和厂商兼容诊断。
- Pi `models.json` 持久化。

### Transport

- 校验未受信任的 Provider、Model 和 compat 输入。
- 将应用结果映射为稳定 HTTP JSON。
- 不包含模型 ID 特判和 Pi 请求逻辑。

### Frontend

- 按协议渲染 compat 字段。
- 展示来源、验证状态和诊断。
- 预览并应用建议补丁。
- 保存前清理仅作为用户体验优化，服务端校验仍是最终边界。

共享的协议字段注册表必须放在前后端都可依赖、且不包含 React、Next.js 或 Pi SDK 类型的位置，避免 UI 导入 `src/server`，也避免在多个组件复制协议合同。

## 14. 迁移策略

### 阶段一：建立约束和诊断

1. 增加协议兼容字段注册表。
2. Provider 和 Model UI 按协议展示 compat。
3. 保存前后进行协议清理和类型校验。
4. Model Test 返回严格结果和结构化诊断。
5. Chat 展示结构化错误。

### 阶段二：形成修复闭环

1. 增加建议补丁。
2. 支持“应用建议并重新测试”。
3. 增加 `unverified/testing/verified/failed/stale` 状态。
4. 保存或配置变化时使验证状态失效。

### 阶段三：移除临时特判

当 Model Test、诊断和补丁闭环稳定后：

1. 删除按 `deepseek-v4*` 模型 ID 注入 `supportsDeveloperRole` 的逻辑。
2. Discover 只保留目录明确提供的 compat 元数据。
3. Runtime 只消费最终配置，不再偷偷修正模型。
4. 用回归测试确保未配置 compat 时错误可见、建议准确、应用后可验证成功。

已有合法 compat 配置保持不变。已有不属于当前协议的字段在用户下一次保存时提示并清理；服务端读取时应忽略这些字段，避免旧配置导致运行时污染。

## 15. 安全与成本控制

- Model Test 明确提示会产生真实请求和少量费用。
- 同一个模型测试期间禁用重复提交。
- 支持 AbortSignal、超时和组件卸载清理。
- 验证默认使用最小 token 上限。
- 不在响应中返回请求 Header、API Key 或完整原始请求。
- 错误复制内容必须使用脱敏后的 `technicalMessage`。
- 诊断匹配不能仅依赖单个自然语言片段，应综合 HTTP 状态、错误字段、参数名和协议。
- 未识别错误不得生成猜测性补丁。

## 16. 测试策略

### 16.1 协议注册表

- 每个协议只暴露自己的字段。
- `openai-completions` 才允许 `supportsDeveloperRole`。
- 不支持 compat 的协议会移除整个对象。
- 三态 Auto 不写入持久化配置。
- Model 覆盖 Provider，删除 Model 字段后恢复继承。

### 16.2 Transport

- 拒绝未知 API。
- 拒绝 compat 字段类型错误。
- 清理或拒绝跨协议字段。
- 复杂 routing JSON 必须符合允许的对象结构。
- 响应中不出现凭据。

### 16.3 Infrastructure

- HTTP 200 但 Assistant 含 `errorMessage` 时验证失败。
- 空 Assistant 响应验证失败。
- error stop reason 验证失败。
- 正常文本完成验证成功。
- 常见上游错误映射到稳定诊断码。
- 诊断内容完成脱敏。
- 建议补丁只包含当前协议允许的字段。

### 16.4 Application

- Discover 结果始终是 `unverified`。
- 配置指纹变化使 `verified` 变成 `stale`。
- 应用补丁后重新验证。
- 验证失败不会持久化隐式配置修改。

### 16.5 Frontend

- 切换协议后字段列表正确变化。
- Model 层清晰显示继承和覆盖状态。
- Test 按钮有 busy guard 和费用提示。
- 失败卡片显示摘要、错误码和技术信息。
- 建议补丁可预览、确认、应用和重新测试。
- Chat 能展示 Assistant 的结构化失败。
- 中英文文案同步。

### 16.6 回归场景

以不支持 `developer` role 的 OpenAI Completions 兼容端点为回归场景：

1. Discover 找到模型，但状态为 `unverified`。
2. 第一次 Model Test 失败。
3. UI 显示 `MODEL_PROTOCOL_ERROR`。
4. 系统建议 Model 级 `supportsDeveloperRole: false`。
5. 用户应用建议并重新测试。
6. 第二次验证成功，状态为 `verified`。
7. Chat 使用同一配置可以正常返回内容。

## 17. 验收标准

满足以下条件时，本方案视为完成：

1. 不同 API 协议只显示并保存各自合法的 compat 字段。
2. Discover 不再被展示为模型可用验证。
3. Model Test 使用真实请求，并严格检查 Assistant 结果。
4. 上游 `errorMessage` 会进入结构化诊断，不会被静默丢弃。
5. 已知兼容错误能够生成最小、合法、可审阅的建议补丁。
6. 用户可以应用建议并重新测试。
7. Chat 对模型失败提供明确、脱敏、可复制的错误信息。
8. Runtime 不再按模型 ID 静默注入 `supportsDeveloperRole`。
9. 客户端和服务端都能阻止跨协议 compat 污染。
10. 相关单元测试、API 合同测试、UI 交互验证、`npm run check` 和 `npm run build` 全部通过。

## 18. 关键决策摘要

| 问题 | 决策 |
| --- | --- |
| 能否仅根据 API 协议发现 `supportsDeveloperRole`？ | 不能。协议只能决定“该字段是否适用”，不能证明具体端点是否支持。 |
| 不确定时是否默认写 `false`？ | 不写，保持 Auto。只有用户配置、可信目录元数据或真实请求诊断才能形成覆盖值。 |
| 所有协议是否都暴露 `supportsDeveloperRole`？ | 否，仅 `openai-completions`。 |
| Discover 是否代表模型可用？ | 否，只代表发现候选模型或目录建议。 |
| 什么代表模型可用？ | 当前配置指纹下的最小真实请求验证成功。 |
| 系统是否自动修复配置？ | 否，生成可审阅补丁，用户确认后应用并重测。 |
| 补丁默认写 Provider 还是 Model？ | 默认写 Model，避免扩大影响范围；用户可主动提升到 Provider。 |
| `errorMessage` 如何处理？ | 脱敏、分类、结构化传输，并在 Model Test 与 Chat 中展示。 |

