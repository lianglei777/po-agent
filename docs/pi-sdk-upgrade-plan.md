# Pi SDK 0.75.5 → 0.84.1 升级计划

## 一、目标与范围

将以下直接依赖从 `0.75.5` 升级到 `0.84.1`：

```json
{
  "@earendil-works/pi-ai": "^0.84.1",
  "@earendil-works/pi-coding-agent": "^0.84.1",
  "typebox": "^1.3.7"
}
```

本次升级保持以下应用行为和公共 HTTP/SSE 合同不变：

- 模型列表、模型发现和真实模型测试继续工作。
- API Key 继续持久化，应用重启后仍然可用。
- OAuth Provider 列表、登录、交互输入、取消和退出继续工作。
- 新建、恢复、分支、重命名、删除和读取 Session 的行为不变。
- Agent SSE 继续发送累计的 `message_start`、`message_update` 和权威的
  `message_end` 消息。
- 模型配置更新后，已有 Runtime 在下一次 Prompt 前刷新模型定义。
- Skills、项目指令、自定义工具、压缩、重试和桌面 standalone 打包继续工作。

本次升级不改变领域层、端口层或公共 API 数据结构；主要修改位于 Pi SDK
基础设施适配器和 composition root。

## 二、已核实的 0.84.1 API 事实

以下结论已根据 `@earendil-works/pi-coding-agent@0.84.1`、
`@earendil-works/pi-ai@0.84.1` 和传递依赖
`@earendil-works/pi-agent-core@0.84.1` 的发布包类型与实现核实。

### 2.1 ModelRuntime 成为 SDK 的模型和认证入口

- `AuthStorage` 不再从 `@earendil-works/pi-coding-agent` 公共入口导出。
- `ModelRuntime.create(options)` 是异步的。
- `createAgentSession()` 接受 `modelRuntime`，旧的 `authStorage` 和
  `modelRegistry` 选项已移除。
- `AgentSession.modelRuntime` 和兼容用的 `AgentSession.modelRegistry` 均存在。
- `ModelRegistry` 仍公开导出，但旧的 `ModelRegistry.create(...)` 已移除；其新构造
  方式为 `new ModelRegistry(modelRuntime)`。
- 应用基础设施优先直接使用 `ModelRuntime`：
  - `getProviders()`
  - `getModels(provider?)`
  - `getModel(provider, modelId)`
  - `getAvailable(provider?, options?)`
  - `getProviderAuthStatus(provider)`
  - `login(provider, authType, interaction)`
  - `logout(provider, options?)`
  - `refresh(options?)`

`getAvailable()` 是异步方法，所有调用都必须 `await`。

### 2.2 凭证持久化与 Runtime API Key 是两种语义

- `ModelRuntime.login()` 和 `logout()` 通过 Runtime 使用的 `CredentialStore` 持久化修改。
- `ModelRuntime.setRuntimeApiKey()` 和 `removeRuntimeApiKey()` 只操作进程内覆盖，
  不应作为 Po Agent 的 API Key 保存/删除实现。
- `ModelRuntime.create({ authPath })` 内部会使用 SDK 的文件凭证存储，但该存储对象
  不从公共入口暴露，应用无法通过它直接执行通用持久化写入。
- 内置和 models.json Provider 均提供公开的 API-key 登录交互；调用
  `modelRuntime.login(provider, "api_key", interaction)` 会持久化凭证并同步 Runtime。

因此，Po Agent 通过公开的 `login()`/`logout()` 完成 API Key 和 OAuth 持久化，继续
使用 `ModelRuntime.create({ authPath })` 的 SDK 文件存储实现。不得导入 SDK 私有路径，
也不得用 `setRuntimeApiKey()` 冒充持久化保存。

### 2.3 OAuth 交互接口已统一

新版登录调用为：

```typescript
await modelRuntime.login(providerId, "oauth", {
  signal,
  prompt: async (prompt) => "...",
  notify: (event) => {},
});
```

旧版 `onAuth`、`onDeviceCode`、`onProgress`、`onPrompt`、
`onManualCodeInput` 和 `onSelect` 回调需要适配到：

- `AuthInteraction.notify(AuthEvent)`
- `AuthInteraction.prompt(AuthPrompt)`

### 2.4 SDK 事件仍包含累计 message

0.84.1 删除累计 `message` 的变更只作用于 JSON/RPC 输出协议。

Po Agent 使用 `AgentSession.subscribe()`；其 SDK `AgentSessionEvent` 中的
`message_update` 仍同时包含：

```typescript
{
  type: "message_update";
  message: AgentMessage;
  assistantMessageEvent: AssistantMessageEvent;
}
```

因此现有 `event.message` 映射可以保留，不需要在 Po Agent 中自行累积
`text_delta`、`thinking_delta` 或 `toolcall_delta`，也不需要改变现有 SSE 合同。

### 2.5 SessionManager 当前用法仍兼容

0.84.1 仍支持项目当前使用的 API：

- `SessionManager.listAll()` 无参数调用
- `SessionManager.create()` / `open()` / `inMemory()`
- `getSessionId()` / `getLeafId()` / `getBranch()` / `getEntries()`
- `appendSessionInfo()`
- `createBranchedSession()`
- `buildSessionContext(entries, leafId)`

`appendSessionInfo()` 和 `appendLabelChange()` 语义不同，不应互相替换。
`pi-session-repository.ts` 预计不需要生产代码修改，只需通过现有回归测试验证。

### 2.6 其他已核实事项

- `getModels`、`getProviders`、`getSupportedThinkingLevels`、
  `validateToolArguments` 和相关模型类型仍从 `@earendil-works/pi-ai` 根入口导出。
- `ModelRuntime.refresh()` 和 `ModelRegistry.refresh()` 均为异步方法，返回
  `ModelsRefreshResult`。
- `typebox` 在目标 Pi 包中固定为 `1.3.7`；项目直接依赖也应同步升级，避免工具
  Schema 使用不同版本。
- 当前自定义工具已经使用新版参数顺序
  `(toolCallId, params, signal, onUpdate)`，无需为此迁移。
- 当前 `DefaultResourceLoader` 已显式传入 `cwd`、`agentDir` 和
  `SettingsManager`，方向符合新版要求，但仍需回归验证资源 reload 和 Skill
  `sourceInfo` 保留逻辑。

## 三、目标架构

### 3.1 共享 ModelRuntime

正式应用中的以下三个适配器必须共享同一个 `ModelRuntime` 实例：

```text
Promise<ModelRuntime>
    ├── PiCredentialProvider
    ├── PiModelProvider
    └── PiAgentRuntimeFactory
```

这样可以保证：

- 保存或删除凭证后，模型列表和 Agent Session 使用一致的认证状态。
- `models.json` 刷新不会发生在彼此隔离的 Runtime 中。
- 新建和恢复的 Agent Session 使用同一套 Provider、模型和凭证配置。
- 并发请求不会重复创建多个正式 `ModelRuntime`。

### 3.2 保持 composition root 同步接口

当前所有 Route Handler 都同步导入 `container`。不要把 `container` 改成
`Promise<AppContainer>`，避免扩大修改范围。

在 `createContainer()` 中同步创建并共享一个初始化 Promise：

```typescript
const modelRuntime = ModelRuntime.create({
  authPath,
  modelsPath,
});

const credentials = new PiCredentialProvider(modelRuntime);
const models = new PiModelProvider(modelRuntime);
const runtimeFactory = new PiAgentRuntimeFactory(modelRuntime);
```

各适配器在异步方法中执行 `await this.modelRuntime`。初始化 Promise 拒绝时应保持
原始错误，供现有 HTTP 错误边界处理；不要静默重试或创建第二个 Runtime。

### 3.3 模型测试使用隔离 Runtime

`PiModelProvider.testConfig()` 必须为临时 `models.json` 创建独立
`ModelRuntime`，不能刷新正式应用 Runtime：

```typescript
const testRuntime = await ModelRuntime.create({
  authPath,
  modelsPath: temporaryModelsPath,
  allowModelNetwork: false,
});
```

随后使用 `testRuntime.getModel()` 查找模型，并把 `testRuntime` 显式传入
`createAgentSession()`。测试 Runtime 从相同 `authPath` 读取凭证，但不得写入凭证或
修改正式模型状态。

## 四、逐文件实施计划

### 阶段 1：依赖升级和编译基线

修改 `package.json` 与 `package-lock.json`：

```powershell
npm install @earendil-works/pi-coding-agent@0.84.1 `
  @earendil-works/pi-ai@0.84.1 `
  typebox@1.3.7
```

随后确认：

```powershell
npm ls @earendil-works/pi-coding-agent @earendil-works/pi-ai typebox
npm run typecheck
```

记录初次 typecheck 的错误列表，以实际编译错误为准补充迁移，不根据旧文档猜测 API。

### 阶段 2：验证 SDK 凭证持久化路径

通过 `ModelRuntime.create({ authPath })` 使用 SDK 的文件凭证存储，并通过公开
`login()`/`logout()` 完成所有写入。新增聚焦测试确认 API Key 使用
`login(provider, "api_key", interaction)`，OAuth 使用相同 Runtime，并且不会调用
仅进程内生效的 `setRuntimeApiKey()`。

### 阶段 3：改造 PiCredentialProvider

修改 `src/server/infrastructure/pi/pi-credential-provider.ts`：

- 构造函数接收共享 `Promise<ModelRuntime>`。
- `listOAuthProviders()`：从 `runtime.getProviders()` 中筛选
  `provider.auth.oauth`，使用 Provider 的 `id` 和 `name`。
- `listApiKeyProviders()`：从 Runtime 的模型或 Provider 集合构造列表；继续保持当前
  排序和展示名称行为。
- `getApiKeyStatus()`：使用 `runtime.getProviderAuthStatus(provider)`。
- `setApiKey()`：确认 Provider 支持 API-key login，然后调用
  `runtime.login(provider, "api_key", interaction)`；`prompt()` 返回用户提交的 Key。
- `removeApiKey()`：调用 `runtime.logout(provider)` 持久化删除并同步 Runtime。
- `startOAuth()`：确认 Provider 支持 OAuth，然后将新版 `notify`/`prompt` 映射到
  现有 `OAuthCallbacks`。
- `logout()`：调用 `runtime.logout(provider, { signal? })`，由 Runtime 通过 Store
  持久化删除并同步模型状态。

新增 `pi-credential-provider.test.ts`，覆盖 Provider 分类、API Key 持久化、删除、
OAuth 事件映射、交互输入、取消、未知 Provider 和退出失败。

### 阶段 4：改造 PiModelProvider

修改 `src/server/infrastructure/pi/pi-model-provider.ts`：

- 删除 `AuthStorage` 和旧 `ModelRegistry.create()`。
- 构造函数接收共享 `Promise<ModelRuntime>` 和凭证 Store。
- `listAvailable()` 使用 `await runtime.getAvailable()`。
- 模型映射、thinking 默认值和 `getSupportedThinkingLevels()` 保持现有行为。
- `discoverModels()` 继续使用 pi-ai 根入口的 `getProviders()` 和 `getModels()`。
- `readConfig()` / `writeConfig()` 的公共行为保持不变。
- `testConfig()` 使用独立临时 `ModelRuntime`，并在 `createAgentSession()` 中显式传入
  `modelRuntime: testRuntime`。
- 临时目录、timeout、abort 和 `session.dispose()` 的 cleanup 行为必须保留。

新增 `pi-model-provider.test.ts`，重点覆盖：

- 可用模型的异步读取和映射。
- 空模型列表默认值为 `null`。
- 临时配置模型查找与真实测试 Session 的 Runtime 注入。
- 测试配置不污染正式 Runtime。
- timeout 时 abort，最后始终 dispose 并删除临时目录。

### 阶段 5：改造 PiAgentRuntimeFactory 和模型刷新

修改 `src/server/infrastructure/pi/pi-agent-runtime.ts`：

- `PiAgentRuntimeFactory` 构造函数接收共享 `Promise<ModelRuntime>`。
- `create()` 中 await Runtime，并传给 `createAgentSession({ modelRuntime })`。
- 保留当前 SessionManager、ResourceLoader、工具 allowlist 和 custom tools 逻辑。
- `set_model` 可以继续通过 `session.modelRegistry.find()` 查找，也可以统一改为
  `session.modelRuntime.getModel()`；优先选择改动更小且类型清晰的方式。
- `refreshModelConfigIfNeeded()` 必须 await 刷新：

```typescript
const result = await this.session.modelRuntime.refresh({
  allowNetwork: false,
});
```

- `result.aborted` 或 `result.errors` 非空时，不得更新
  `appliedModelConfigRevision`，应转换为明确的 `AppError`。
- 刷新成功后重新获取当前模型并调用 `session.setModel()`。
- 保留 revision 快照语义：刷新期间出现新的 invalidation 时，本次只提交开始时的
  `targetRevision`，下一次 Prompt 继续刷新。
- 保留 `message_update` 的 `event.message` 映射，不新增增量缓冲区。

更新测试：

- `pi-agent-runtime-factory.test.ts` 验证同一个 `modelRuntime` 被传入
  `createAgentSession()`。
- `pi-agent-runtime.test.ts` 保留累计 `message_update` 映射测试。
- 新增刷新成功、Provider error、aborted、模型消失以及刷新期间二次 invalidation 测试。

### 阶段 6：composition root 注入

修改 `src/server/composition/container.ts`：

- 通过唯一的 `authPath` 使用 SDK 文件 `CredentialStore`。
- 创建唯一的 `Promise<ModelRuntime>`。
- 注入 `PiCredentialProvider`、`PiModelProvider` 和 `PiAgentRuntimeFactory`。
- 保持 `createContainer()`、`AppContainer` 和导出的 `container` 为同步对象。
- 保持开发环境 `globalThis.__piAgentContainer` 缓存，避免热更新重复创建 Runtime。

添加或更新 composition 测试，确认三个适配器共享同一个 Runtime Promise；不要把
SDK 类型泄漏到 application 或 transport 层。

### 阶段 7：无需预设修改、但必须回归验证的适配器

以下文件不应仅因旧计划中的推测而修改：

- `pi-session-repository.ts`
- `model-discovery.ts`
- `pi-resource-loader.ts`
- `pi-agent-settings-store.ts`
- `pi-skill-provider.ts`
- `pi-skill-pack-provider.ts`

先运行其现有测试和 typecheck。只有在 0.84.1 的实际类型或行为测试失败时才做最小
修复，并为非平凡行为添加回归测试。

## 五、实施顺序与反馈检查

```text
1. 升级依赖并记录 typecheck 基线
2. 验证并测试 ModelRuntime 的公开凭证持久化路径
3. 改造 PiCredentialProvider
4. 改造 PiModelProvider 和隔离模型测试 Runtime
5. 注入共享 Runtime 到 PiAgentRuntimeFactory
6. 修复异步模型刷新和错误处理
7. 更新 composition root
8. 运行 Pi 基础设施聚焦测试
9. 运行完整 check、build 和桌面准备验证
10. 执行手工端到端烟测
```

开发期间优先运行最小检查，例如：

```powershell
npx vitest run src/server/infrastructure/pi/pi-credential-provider.test.ts
npx vitest run src/server/infrastructure/pi/pi-model-provider.test.ts
npx vitest run src/server/infrastructure/pi/pi-agent-runtime.test.ts
npx vitest run src/server/infrastructure/pi/pi-agent-runtime-factory.test.ts
npx vitest run src/server/infrastructure/pi/pi-session-repository.test.ts
npm run typecheck
```

## 六、最终验收

### 6.1 自动检查

必须依次通过：

```powershell
npm run check
npm run build
npm run desktop:prepare
```

然后检查 standalone 中目标包是否被正确收集：

```powershell
npm ls @earendil-works/pi-coding-agent @earendil-works/pi-ai typebox
```

如桌面准备脚本没有覆盖真实 Electron 启动，至少额外执行一次开发模式或打包目录烟测，
确认 Pi 的动态资源和传递依赖在 standalone 环境可加载。

### 6.2 手工烟测

在不暴露真实凭证的前提下验证：

1. 打开模型配置页并读取模型列表。
2. 保存 API Key，刷新页面并重启应用，状态仍为已配置。
3. 删除 API Key，刷新页面并重启应用，状态仍为未配置。
4. 完成一个 OAuth 登录；覆盖 URL、device code、文本输入或选择输入中实际出现的流程。
5. 取消一次 OAuth 登录，确认请求和待输入状态都被清理。
6. OAuth 退出后重启应用，状态保持退出。
7. 执行模型测试，确认成功、Provider 错误和 timeout 均有正确反馈。
8. 新建会话并观察文本、thinking 和 tool call 的流式更新。
9. 恢复已有会话，执行 follow-up、steer、abort、压缩和 fork。
10. 修改 `models.json` 后，在已有会话下一次 Prompt 前刷新并继续使用相同模型。
11. 验证 Skills、项目/全局指令 reload 和自定义生成工具。
12. 从 `.next/standalone` 或桌面打包目录启动应用并重复最小聊天流程。

## 七、主要风险与回退边界

### 7.1 凭证并发与持久化

所有凭证写入必须经过 `ModelRuntime.login()`/`logout()`，由 SDK 的 Store 锁和同步逻辑
处理。不得绕过 Runtime 直接改写 `auth.json`，也不得使用仅进程内生效的 Runtime API Key。

### 7.3 模型刷新失败

`ModelsRefreshResult` 把 Provider 错误作为结果返回而不是统一抛出。若忽略该结果，应用会
错误地标记 revision 已应用。任何错误或 abort 都必须保留待刷新 revision。

### 7.4 版本漂移

升级后必须检查 lockfile 实际解析版本。不要只修改 semver 范围后假设所有 Pi 子包和
`typebox` 已对齐。

### 7.5 回退边界

如果升级无法在一个连贯变更中保证凭证持久化和真实聊天可用，应整体回退 Pi 包与相应
适配器修改，不能保留“依赖已升级但认证暂时只在内存生效”的中间状态。

## 八、完成标准

只有同时满足以下条件，升级才算完成：

- 直接依赖和 lockfile 均解析到目标版本。
- 应用不再从公共入口导入已移除的 `AuthStorage`，也不导入 SDK 私有路径。
- 正式模型、认证和 Agent Session 共用同一 Runtime 生命周期。
- API Key 与 OAuth 凭证的保存、删除、刷新和重启持久化均已验证。
- 现有 HTTP/SSE 合同没有静默变化。
- Session、ResourceLoader、Skills、Settings 和自定义工具回归通过。
- `npm run check`、`npm run build` 和 `npm run desktop:prepare` 全部通过。
- 手工烟测覆盖模型配置、认证、聊天流、Session 恢复和桌面 standalone。
