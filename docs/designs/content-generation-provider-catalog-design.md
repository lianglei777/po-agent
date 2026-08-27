# Content Generation Provider Module 与 Catalog 设计

> 状态：Approved for implementation
> 日期：2026-08-27
> 范围：Po Agent 内容生成供应商注册、模型 Catalog、资产准备、执行快照与渐进式多供应商接入

## 1. 背景

Po Agent 当前已经建立供应商无关的 `GenerationRoute`、Generation Run、Provider Job、Worker、Chat 和 Pipeline 边界，但 RunningHub 的一条模型 API 仍需要在 Route、Input Schema、Endpoint 与请求映射中重复注册。模型数量增长后，这种重复维护容易出现 operation 遗漏、默认值漂移、素材槽位与供应商字段混用等问题。

RunningHub 和千问 AI 平台都提供大量内容生成模型，并具有相对稳定的供应商内协议。它们适合使用声明式 Catalog 减少模型级接入成本，但两者的上传、请求体、任务查询和输出结构并不相同：

- RunningHub 使用固定上传端点、相对扁平的模型请求体和统一查询端点；
- 千问 AI 的临时文件需要按账号和模型获取 OSS 上传凭证，调用时还需要启用 OSS 资源解析；
- 千问 AI 的媒体任务共享 DashScope Task 生命周期，但不同模型族使用 `prompt/media`、`messages/content` 或直接 `input` 等不同请求结构；
- 未来供应商还可能使用文件 ID、Base64、签名鉴权、同步结果或其他任务协议。

因此，本设计不建立跨供应商的任意 HTTP DSL，而是引入两层扩展：

1. **Provider Module**：一个供应商只接入一次 Adapter、凭证、运行策略和 Route 集合。
2. **Provider Catalog**：同一供应商内的标准模型通过受限声明接入，特殊模型使用固定 ID 选择仓库内代码。

## 2. 目标

1. RunningHub 标准 API 只在一条 Catalog 定义中描述 Route、Schema、Endpoint 和请求映射。
2. 新增同协议模型时不修改 application、Worker、Route Handler 或请求 `switch`。
3. 新增供应商时只增加一个 Provider Module，不修改生成领域核心。
4. Provider Job 在创建时冻结执行配置，恢复和重试不受当前 Catalog 漂移影响。
5. 资产准备支持 URL、临时 OSS、文件 ID 等供应商私有引用，而不是固定为 URL。
6. 资产准备可以读取 operation、模型和执行配置，并保留绑定范围与有效期。
7. 保持付费开关、Route ID、operation ID、用户默认 Route、审计和下载安全边界。
8. Markdown 或网页 API Reference 只生成待审查草稿，不能直接进入付费执行链路。

## 3. 非目标

- 不恢复用户可编辑的通用 HTTP Provider。
- 不允许 Catalog 定义任意 Origin、Authorization Header、JavaScript 表达式、JSONPath 或动态 import。
- 不要求 RunningHub 与千问 AI 共用同一个请求 Catalog 类型。
- 不在第一阶段实现千问 AI Provider；第一阶段只建立可承载它的边界并迁移 RunningHub。
- 不在第一阶段把标准 Catalog 改成运行时加载的 JSON/YAML。
- 不把复杂媒体探测、计费推断或业务语义交给文档解析器自动决定。

## 4. 稳定架构

```text
contracts <- domain <- ports <- application
                         ^            |
                         |            v
                  Provider Module -> infrastructure
                         |
                         v
                    composition
```

生成核心只认识：

- `GenerationRoute` 与供应商无关的 `GenerationInputSchema`；
- `GenerationRun`、`ProviderJob` 和 `GenerationArtifact`；
- `GenerationProvider` port；
- 不透明的 Provider execution config 与 prepared asset reference。

每个 Provider Module 拥有：

- Adapter；
- Provider 专属 Catalog 与编译器；
- 资产准备策略；
- 请求和结果 Profile；
- Provider 运行策略；
- 凭证描述与受信配置。

## 5. Provider Module

Provider Module 是 composition 元数据，不属于 domain 或 application：

```ts
interface GenerationProviderModule {
  providerId: string;
  displayName: string;
  credential?: {
    reference: string;
    kind: "api-key";
    environmentVariable: string;
  };
  createProvider(): GenerationProvider;
  createRoutes(now?: string): GenerationRoute[];
}
```

生产 Composition 从固定受信列表构造 Route 与 Adapter：

```ts
const modules = [runningHubProviderModule];
const routes = modules.flatMap((module) => module.createRoutes());
const providers = modules.map((module) => module.createProvider());
```

未来加入千问 AI 时只增加 `qianwenProviderModule`。Provider Module 列表不能由客户端、数据库或未经审查的文件动态扩展。

固定 Module 还会编译为只读 Provider Directory。Provider 设置与凭据 application service 必须通过该 Directory 校验 ID，并在服务端完成 `providerId -> credential reference` 映射；HTTP 客户端无权提交 credential ref 或环境变量名。

## 6. Provider 执行快照

### 6.1 当前问题

Provider Job 已保存 `routeRevision` 与 `resolvedConfigSnapshot`，但执行时 Adapter 只接收 operation、GenerationInput、资产和 credential。Adapter 仍可能按当前代码或当前 Catalog 查找 Endpoint 和 Mapper，因此升级后恢复的旧 Job 可能使用新协议执行。

### 6.2 新不变量

Job 创建时必须冻结：

```ts
resolvedConfigSnapshot: {
  parameters: Record<string, JsonValue>;
  executionConfig: JsonValue;
}
```

`executionConfig` 来自已验证的 `GenerationRoute.adapterConfig`。Provider 的 `prepareAssets`、`submit`、`poll` 和 `cancel` 都必须接收同一个快照，不能重新从当前 Catalog 查询执行语义。

历史 Job 兼容读取旧的 `adapterConfig` 字段。新 Job 只写 `executionConfig`。

对于自定义 Mapper，快照保存稳定且带版本的 ID，例如：

```json
{
  "requestMode": "custom",
  "mapperId": "seedance-2-5-multimodal@1"
}
```

不兼容 Mapper 变更必须产生新 ID 或 Route revision，不能静默修改旧版本语义。

## 7. 供应商资产准备

### 7.1 Port

`upload` 改名为 `prepareAssets`，并接收 operation 与 execution config：

```ts
prepareAssets(input: {
  operation: string;
  executionConfig: JsonValue;
  assets: ProviderInputAsset[];
  credential: string;
}): Promise<PreparedGenerationAsset[]>;
```

### 7.2 不透明引用

准备后的资产不再固定为 `url: string`：

```ts
interface PreparedGenerationAsset {
  slot: string;
  bindingId?: string;
  order?: number;
  name: string;
  mimeType: string;
  reference: JsonValue;
  expiresAt?: string;
}
```

RunningHub 使用：

```json
{ "kind": "url", "url": "https://..." }
```

未来千问 AI 可使用：

```json
{
  "kind": "dashscope-oss",
  "url": "oss://dashscope-instant/...",
  "vendorModel": "wan3.0-video"
}
```

Application 只持久化和传递 reference。Adapter 负责解释、校验作用域和决定是否添加固定协议 Header。

### 7.3 有效期和重试

- 新 Job 默认重新准备资产，不跨 Provider、credential 或 vendor model 复用。
- 尚未提交的 Job 恢复时，Provider 可以检查 `expiresAt` 并重新准备已过期资产。
- 已获得 remote task ID 后只执行 poll，不重新准备或提交。
- 临时 Policy、Signature、AccessKey 和上传凭证必须从审计快照中脱敏。

## 8. RunningHub Catalog

### 8.1 Definition

RunningHub Catalog 仍位于 infrastructure：

```ts
interface RunningHubOperationDefinition {
  operation: string;
  route: {
    id: string;
    name: string;
    description: string;
    tags: string[];
    product: string;
    capability: GenerationCapability;
    revision: number;
    catalogDefault?: boolean;
  };
  inputSchema: GenerationInputSchema;
  protocol: {
    version: 1;
    endpoint: RunningHubEndpointPath;
    request:
      | { mode: "declarative"; fields: RunningHubRequestField[] }
      | { mode: "custom"; mapperId: RunningHubCustomMapperId };
  };
}
```

Route defaults只从 `inputSchema.parameters[].defaultValue` 提取；不得在 Route 和参数定义中重复声明同一默认值。

### 8.2 受限请求字段

第一阶段只支持：

- Prompt；
- 参数重命名；
- `identity` 与 `string` 两种序列化；
- `first` 与 `list` 两种素材序列化；
- 显式 fallback；
- 空值发送或省略。

不支持条件表达式、任意函数或任意对象模板。无法准确表达的 operation 使用固定 custom mapper。

### 8.3 编译结果

一个 definition 同时生成：

- `GenerationRoute`；
- defaults；
- `adapterConfig` 中可持久化的 RunningHub execution config；
- Adapter 请求构造规则。

Adapter 只使用 Job 的 execution config，不从全局 Catalog 查询 Endpoint 或字段映射。

## 9. 未来千问 AI Catalog

千问 AI Provider 不复用 RunningHub definition，而使用固定协议 Profile：

```ts
type QianwenRequestProfile =
  | "prompt-media-v1"
  | "messages-content-v1"
  | "direct-input-v1"
  | "custom";

type QianwenResultProfile =
  | "video-url-v1"
  | "results-list-v1"
  | "choices-content-v1"
  | "custom";
```

Catalog 只能选择受信 Profile 和 Endpoint ID，不能声明任意 Header 或 Origin。`X-DashScope-Async`、OSS Resource Resolve 和 Task API path 由 Adapter 根据固定 Profile 添加。

稳定 `providerOperation` 表示 Po Agent 执行语义；`vendorModel` 是供应商请求字段，两者不得混用。一个 vendor model 可以由多个 capability Route 共享。

## 10. 输入约束

第一阶段保持现有约束。后续接入千问 AI 前，增加少量 UI 可理解的供应商无关约束：

- Prompt 或某组素材至少一个；
- 素材组互斥；
- 多槽位素材总数上限。

需要读取媒体时长、分辨率或其他文件元数据的复杂规则使用固定 preflight validator，不扩张成通用条件 DSL。

## 11. Provider 运行策略

未来 Provider Module 可声明：

```ts
interface ProviderRuntimePolicy {
  defaultPollIntervalMs: number;
  maxPollIntervalMs: number;
  maxConcurrentSubmissions?: number;
  maxConcurrentPolls?: number;
}
```

第一阶段保持现有 Worker 调度行为，但 Provider result 可以返回 `retryAfterMs`，为后续按供应商限流和退避保留兼容路径。

## 12. 安全

- Provider Module 与 Catalog 均为仓库内受信代码。
- RunningHub Endpoint 必须是 `/openapi/v2/` 下的相对路径，Origin 固定在 Adapter。
- execution config 不能包含 credential、Authorization Header 或用户提供的 Origin。
- 请求构造器只读取声明字段，不透传未知 parameters。
- prepared asset reference 由对应 Adapter 解释，不能作为通用任意请求配置。
- 动态上传 Host 必须使用 HTTPS allowlist、禁止凭证转发和重定向，并单独脱敏临时上传凭据。
- 下载 URL 继续由各 Provider Adapter 执行 allowlist 校验。
- request/response snapshot 继续执行统一脱敏和大小限制。

## 13. 文档导入

导入器按 Provider 实现：

```text
catalog-importers/
  runninghub-markdown-importer.ts
  qianwen-api-reference-importer.ts
```

导入器统一产生 draft 与 uncertainty report，但不能直接修改生产 Catalog 或启用 Route。实现顺序仍然是先验证手写 Catalog，再开发导入器。

## 14. 迁移计划

### Phase 1：冻结执行配置与泛化资产准备

- `upload` 改为 `prepareAssets`；
- prepared asset 改为 opaque reference；
- execution config 传入 prepare、submit、poll 与 cancel；
- 增加旧 Job snapshot 兼容读取；
- 更新 Worker 和 Provider 测试。

### Phase 2：建立 RunningHub Catalog

- 增加 definition、helper、validator 与 request builder；
- 将现有 18 条 Route 迁移到 Catalog；
- Route、Schema、Endpoint 和 request mapping 不再分别注册；
- 迁移前后请求快照保持一致。

### Phase 3：Provider Module 注册

- Composition 从固定模块列表构造 Routes 与 Providers；
- 移除 Container 对 RunningHub 类和 Route 工厂的直接依赖；
- 保持现有 RunningHub HTTP 设置与凭证合同兼容。

### Phase 4：通用 Provider 设置与凭证 UI

- 增加受信 Provider descriptor；
- 增加通用 Provider 与 credential Route Handler；
- 设置页按 descriptor 渲染；
- 旧 RunningHub 端点保留兼容期。

### Phase 5：接入千问 AI

- 增加 Qianwen Adapter、Catalog、资产准备与 Task API normalization；
- 先用一条 Wan 3.0 Route 验证边界；
- 再逐步增加同协议模型。

### Phase 6：Catalog 草稿生成器

- RunningHub Markdown importer；
- 千问 API Reference importer；
- 内容哈希、来源和不确定项报告；
- 不自动进入生产 Catalog。

## 15. 验收标准

本次实现完成 Phase 1 至 Phase 3，并满足：

- 18 条 RunningHub Route 全部来自一份 Catalog 聚合；
- 标准 operation 不再出现在 Route、Schema、Endpoint 和 request `switch` 四个位置；
- Job 执行使用创建时冻结的 execution config；
- prepared asset 使用 opaque reference 并保持显式 binding order；
- Composition 通过 Provider Module 注册 RunningHub；
- Route ID、operation ID、revision、默认值、请求体、用户开关和公共 DTO 保持兼容；
- Catalog 自动校验唯一性、默认值、Endpoint 和请求字段引用；
- 现有 Adapter、Worker、Run、Chat 与 Pipeline 测试通过；
- `npm run check` 与 `npm run build` 通过。
