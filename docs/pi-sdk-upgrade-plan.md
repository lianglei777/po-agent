# Pi SDK 0.75.5 → 0.84.1 升级修改计划

## 一、破坏性变更总览

| 严重度 | 变更 | 影响文件 |
|--------|------|----------|
| **严重** | `AuthStorage` 移除，由 `ModelRuntime` 替代 | `pi-model-provider.ts`, `pi-credential-provider.ts` |
| **严重** | `message_update` 事件不再包含累积 `message` 字段，改为仅发送 `assistantMessageEvent` 增量 | `pi-agent-runtime.ts` |
| **高** | `ModelRegistry.refresh()` 签名变更（接受 `ModelsRefreshOptions`，返回 `ModelsRefreshResult`） | `pi-agent-runtime.ts`, `pi-model-provider.ts` |
| **高** | `ModelRegistry.getApiKeyAndHeaders()` 返回值变为 `string | null` | `pi-model-provider.ts`（间接） |
| **中** | `SessionManager` 部分方法签名可能变更（`listAll()` 需要传 `cwd`，`getLeafId()` → `getLeafEntry()`） | `pi-session-repository.ts`, `pi-agent-runtime.ts` |
| **中** | `createAgentSession()` 新增 `modelRuntime` 选项，替代隐式 `AuthStorage` 依赖 | `pi-agent-runtime.ts`, `pi-model-provider.ts` |
| **低** | `pi-ai` 入口点可能重组（`getModels`/`getProviders` 路径可能变化） | `pi-model-provider.ts`, `model-discovery.ts` |
| **低** | TypeBox 升级到 1.3.7 | `pi-agent-runtime.ts`（`Type.Unsafe` 用法） |
| **无** | `AgentHarness` 导入路径变更 | 项目未使用，无影响 |
| **无** | `compat.sendSessionIdHeader` 移除 | 项目未使用，无影响 |

---

## 二、逐文件修改计划

### 1. `pi-model-provider.ts` — 严重，核心改造

**当前代码问题：**

```4:15:src/server/infrastructure/pi/pi-model-provider.ts
import {
  AuthStorage,
  createAgentSession,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  getModels,
  getProviders,
  getSupportedThinkingLevels,
} from "@earendil-works/pi-ai";
```

**需要修改的内容：**

- **`AuthStorage` → `ModelRuntime`**：`AuthStorage.create(path)` 是同步的，但 `ModelRuntime.create({ authPath, modelsPath })` 是异步的。当前 `private readonly auth = AuthStorage.create(...)` 是字段初始化，需要改为异步工厂模式或在构造函数中初始化。

- **`ModelRegistry.create(auth, modelsPath)` → `ModelRuntime.create({ authPath, modelsPath })`**：`ModelRuntime` 合并了 `AuthStorage` + `ModelRegistry` 的职责。`registry.getAvailable()` → `modelRuntime.getAvailable()`，`registry.find(provider, id)` → `modelRuntime.getModel(provider, id)`。

- **`registry.getAll()` 和 `registry.getProviderDisplayName(id)`**：需要确认 `ModelRuntime` 是否有等价方法。`getProviders()` 可能返回包含 display name 的 provider 列表。

- **`getModels`, `getProviders`, `getSupportedThinkingLevels` 导入路径**：可能需要从 `@earendil-works/pi-ai` 的子路径导入，或确认仍在根导出。安装新版后需验证。

- **`SessionManager.inMemory(directory)`**：在 `testConfig` 方法中使用，需确认签名是否变更（可能需要传 `cwd`）。

- **`createAgentSession` 调用**：需要传入 `modelRuntime` 选项。

**建议改造方向：**

```typescript
// 改为异步工厂
export class PiModelProvider implements ModelProvider {
  private readonly modelRuntime: ModelRuntime;

  private constructor(modelRuntime: ModelRuntime) {
    this.modelRuntime = modelRuntime;
  }

  static async create(): Promise<PiModelProvider> {
    const modelRuntime = await ModelRuntime.create({
      authPath: path.join(getAgentDir(), "auth.json"),
      modelsPath: path.join(getAgentDir(), "models.json"),
    });
    return new PiModelProvider(modelRuntime);
  }

  async listAvailable(): Promise<ModelInfo[]> {
    return this.modelRuntime.getAvailable().map((model) => ({
      // ... 映射逻辑基本不变
    }));
  }
}
```

**影响范围**：`container.ts` 中的 `new PiModelProvider()` 需要改为 `await PiModelProvider.create()`。

---

### 2. `pi-credential-provider.ts` — 严重，核心改造

**当前代码问题：**

```12:14:src/server/infrastructure/pi/pi-credential-provider.ts
  private readonly auth = AuthStorage.create(
    path.join(getAgentDir(), "auth.json"),
  );
```

**需要修改的内容：**

- **`AuthStorage` → `ModelRuntime`**：同上，需要异步初始化。

- **方法映射**（需验证精确 API）：
  - `auth.getOAuthProviders()` → `modelRuntime.getProviders()` 后过滤 OAuth 类型
  - `auth.getAuthStatus(provider)` → `modelRuntime.checkAuth(provider)`
  - `auth.set(provider, { type: "api_key", key })` → **关键问题**：`modelRuntime.setRuntimeApiKey(provider, key)` 不持久化到磁盘，而当前代码需要持久化。需要确认是否有持久化 API。
  - `auth.remove(provider)` → `modelRuntime.removeRuntimeApiKey(provider)`（同样不持久化）
  - `auth.login(provider, callbacks)` → `ModelRuntime` 文档中未显示 `login` 方法，需要确认 OAuth 登录 API 的位置
  - `auth.logout(provider)` → 同上

- **关键风险**：`setRuntimeApiKey` 不持久化到磁盘，而项目需要持久化 API key。可能需要：
  1. 确认 `ModelRuntime` 是否有持久化 API
  2. 或直接操作 `auth.json` 文件
  3. 或使用 `CredentialStore` 接口

**建议改造方向**：与 `PiModelProvider` 共享同一个 `ModelRuntime` 实例（通过 `container.ts` 注入），避免重复创建。

---

### 3. `pi-agent-runtime.ts` — 严重，事件处理重写

**需要修改的内容：**

#### a) `message_update` 事件处理（第 343-347 行）

当前代码：
```343:347:src/server/infrastructure/pi/pi-agent-runtime.ts
    case "message_update": {
      const message = mapPiMessage(event.message);
      return message.role === "assistant"
        ? { type: "message_update", message }
        : null;
    }
```

新版 `message_update` 不再有 `event.message`，改为 `event.assistantMessageEvent`（增量 delta）。

**迁移方案**：在 `PiAgentRuntime` 中维护一个累积缓冲区：
- `message_start` 时初始化缓冲区
- `message_update` 时追加 delta（`text_delta` → 追加文本，`thinking_delta` → 追加思考）
- 每次收到 delta 后，用累积内容构造部分 `AgentMessage`，映射为 `{ type: "message_update", message }`
- `message_end` 时用权威消息清空缓冲区

这保持了现有 SSE 协议不变（前端仍收到累积 `message_update`），但需要在 `mapEvents` 函数中引入状态。

#### b) `ModelRegistry.refresh()` 签名变更（第 254 行）

当前代码：
```254:254:src/server/infrastructure/pi/pi-agent-runtime.ts
    this.session.modelRegistry.refresh();
```

新版 `refresh()` 接受 `ModelsRefreshOptions` 并返回 `ModelsRefreshResult`。需要：
- 添加 `await`（如果变为异步）
- 处理返回的 `{ aborted, errors }` 结果
- 或改用 `this.session.modelRuntime.refresh({ providers, signal })`

#### c) `modelRegistry.find()` → `modelRuntime.getModel()`（第 110, 256 行）

需要确认 `AgentSession` 上是 `modelRegistry` 还是 `modelRuntime` 属性。

#### d) `SessionManager` 用法（第 36-37, 134, 136 行）

```36:37:src/server/infrastructure/pi/pi-agent-runtime.ts
    const manager = input.sessionFile
      ? SessionManager.open(input.sessionFile)
      : SessionManager.create(input.cwd);
```

- `SessionManager.open()` 和 `SessionManager.create()` 应该仍可用
- `manager.getSessionId()`（第 136 行）可能需要改为从 `manager.getLeafEntry()` 获取
- `manager.createBranchedSession(command.entryId)`（第 126 行）需确认是否仍存在

#### e) `createAgentSession` 调用（第 48-58 行）

需要传入 `modelRuntime` 选项。`modelRuntime` 实例需要从外部注入（通过 `CreateRuntimeInput` 或工厂构造函数）。

---

### 4. `pi-session-repository.ts` — 中等，API 签名验证

**需要修改的内容：**

#### a) `SessionManager.listAll()`（第 39 行）

```39:39:src/server/infrastructure/pi/pi-session-repository.ts
    const sessions = await SessionManager.listAll();
```

新版可能需要传 `cwd` 参数：`SessionManager.listAll(cwd)` 或 `SessionManager.listAll(getAgentDir())`。

#### b) `manager.getLeafId()`（第 67 行）

SDK 文档显示 `sm.getLeafEntry()` 而非 `sm.getLeafId()`。可能需要改为 `manager.getLeafEntry()?.id`。

#### c) `manager.getSessionId()`（第 136 行，在 `pi-agent-runtime.ts` 中）

SDK 文档中未显示此方法。可能已移除或重命名。

#### d) `manager.appendSessionInfo(name)`（第 91 行）

SDK 文档显示 `sm.appendLabelChange(id, "checkpoint")`。可能是重命名。

#### e) `buildSessionContext(manager.getEntries(), leafId)`（第 155 行）

`buildSessionContext` 仍从 `@earendil-works/pi-coding-agent` 导出，但参数签名可能变更。

#### f) `manager.getBranch(leafId)`（第 154 行）

需确认是否仍存在。

**总体策略**：这个文件大量使用 `SessionManager` 实例方法。虽然 `SessionManager` 仍然导出，但部分方法名/签名可能变更。安装新版后需要逐一验证。

---

### 5. `model-discovery.ts` — 低，导入路径验证

```1:1:src/server/infrastructure/pi/model-discovery.ts
import type { Api, Model } from "@earendil-works/pi-ai";
```

`Api` 和 `Model` 类型导入应该不受影响（类型导出通常稳定）。但 `pi-model-provider.ts` 中的 `getModels`, `getProviders`, `getSupportedThinkingLevels` 函数导入可能需要调整路径。

---

### 6. `container.ts` — 中等，依赖注入调整

```49:50:src/server/composition/container.ts
  const credentials = new PiCredentialProvider();
  const models = new PiModelProvider();
```

需要改为异步初始化：
```typescript
const modelRuntime = await ModelRuntime.create({
  authPath: path.join(getAgentDir(), "auth.json"),
  modelsPath: path.join(getAgentDir(), "models.json"),
});
const credentials = new PiCredentialProvider(modelRuntime);
const models = new PiModelProvider(modelRuntime);
```

但 `createContainer()` 当前是同步函数。需要：
1. 改为异步函数 `async function createContainer()`
2. 或在内部使用同步初始化模式（如果 `ModelRuntime.create()` 有同步变体）
3. 或延迟初始化

这会影响 `container` 的导出方式（可能需要改为 `Promise<AppContainer>` 或使用顶层 await）。

---

### 7. 测试文件 — 需同步更新

以下测试文件需要更新以匹配新 API：
- `pi-model-provider.test.ts` — `AuthStorage`/`ModelRegistry` mock 改为 `ModelRuntime` mock
- `pi-credential-provider.test.ts` — 同上
- `pi-agent-runtime.test.ts` — 事件 mock 需匹配新 `message_update` 结构
- `pi-agent-runtime-factory.test.ts` — `createAgentSession` mock 需包含 `modelRuntime`
- `pi-session-repository.test.ts` — `SessionManager` 方法 mock 需匹配新签名

---

## 三、修改优先级和依赖关系

```
阶段 1: 安装新版 SDK，验证 API 签名
  └─ npm install @earendil-works/pi-coding-agent@0.84.1 @earendil-works/pi-ai@0.84.1
  └─ 读取新版 .d.ts 确认上述假设

阶段 2: 核心基础设施改造（无外部依赖）
  ├─ pi-model-provider.ts (AuthStorage → ModelRuntime)
  ├─ pi-credential-provider.ts (AuthStorage → ModelRuntime)
  └─ container.ts (依赖注入调整)

阶段 3: 运行时和事件处理改造
  ├─ pi-agent-runtime.ts (message_update 事件重写, refresh() 异步化)
  └─ pi-session-repository.ts (SessionManager API 签名更新)

阶段 4: 导入路径和次要修复
  ├─ model-discovery.ts (导入路径验证)
  └─ pi-agent-runtime-factory.test.ts 等 (测试更新)

阶段 5: 验证
  ├─ npm run check
  └─ npm run build
```

---

## 四、关键风险点

1. **`ModelRuntime` 的持久化问题**：`setRuntimeApiKey` 不持久化到磁盘，而项目需要持久化 API key。这是最大的不确定点，需要安装后验证 `ModelRuntime` 是否有持久化 API，或是否需要直接操作 `auth.json`。

2. **OAuth 登录/登出 API**：`ModelRuntime` 文档中未显示 `login`/`logout` 方法。OAuth 流程可能需要使用其他 API。

3. **`message_update` 事件重写复杂度**：需要在运行时适配层维护消息累积状态，将 delta 流转换为累积消息格式。这改变了 `mapEvents` 函数的无状态特性。

4. **`container.ts` 异步化**：`createContainer()` 改为异步会影响整个应用的初始化流程。

5. **`SessionManager` 方法名变更**：`getLeafId` → `getLeafEntry`、`appendSessionInfo` → `appendLabelChange` 等变更需要逐一验证。

---

## 五、建议的下一步

1. **先安装新版 SDK**：`npm install @earendil-works/pi-coding-agent@0.84.1 @earendil-works/pi-ai@0.84.1`
2. **读取新版 `.d.ts` 类型定义**：确认上述所有 API 假设
3. **从阶段 2 开始实施**：先改造 `pi-model-provider.ts` 和 `pi-credential-provider.ts`，因为它们是其他文件的基础依赖
