# 千问 AI 平台内容生成 Provider 集成设计

> 状态：Ready for implementation  
> 日期：2026-08-27  
> 范围：Po Agent 接入千问 AI 平台图像与视频生成 API，并完成多供应商设置与凭据边界

## 1. 背景

Po Agent 已通过 `GenerationProvider`、Provider Module、供应商 Catalog、Provider Job 和 execution config 快照建立了供应商无关的内容生成执行链路。RunningHub 已迁移到受信 TypeScript Catalog，设置页、凭据接口和环境变量回退也已完成多供应商泛化。

千问 AI 平台的图像与视频 API 共享 DashScope 鉴权和任务协议，但存在以下差异：

- Z-Image 同步返回图片，其他生成接口主要使用异步 Task；
- 图像模型存在 `messages/content` 与旧版 `prompt/results` 两类结构；
- 视频模型共享提交 Endpoint，但 `input` 中允许的 prompt、media、audio 和素材类型不同；
- 本地素材要先按目标模型获取临时 OSS Policy，再生成有账号与模型作用域的 `oss://` 引用；
- Wan 3.0 与 MiniMax-H3 是 All-in-One 模型，一个供应商模型对应多个 Po Agent capability。

因此，千问不能复用 RunningHub Catalog，也不应促使项目建立任意 HTTP DSL。本设计在现有 Provider Module 边界内增加一套有限的 DashScope Profile，并先把设置与凭据入口改成真正的多供应商实现。

原始资料与协议矩阵见 [`docs/QwenApis/README.md`](../QwenApis/README.md)，跨供应商稳定边界见 [`content-generation-provider-catalog-design.md`](./content-generation-provider-catalog-design.md)。

## 2. 目标

1. 新增一个千问供应商只在固定 Provider Module 列表注册一次。
2. 设置页、凭据 API 和 Composer 可用性判断不再硬编码 RunningHub。
3. 千问 Catalog 用有限 Profile 描述同协议模型，不能配置任意网络行为。
4. 同步图片和异步图片/视频共用现有 `GenerationProvider` port。
5. 本地素材通过 `prepareAssets()` 转换为带有效期的不透明 `oss://` 引用。
6. Provider Job 始终使用创建时冻结的模型、Profile、Endpoint ID 和参数语义。
7. 新 Route 默认关闭，不改变现有 RunningHub Route、默认模型或用户设置。
8. 请求、响应和上传审计不暴露 API Key、Policy、Signature 或签名 URL 参数。

## 3. 非目标

- 不在运行时解析 `docs/QwenApis` 或远程网页来创建 Route。
- 不允许用户输入任意 DashScope Endpoint、Header、请求模板或 JSONPath。
- 不一次性接入文档中的全部旧模型。
- 不在第一批实现 Wan 3.0 的文件/网页生视频和复杂 `reference_voice` 绑定。
- 不把千问模型 ID、OSS 字段或 Task 状态暴露到 Agent 工具和 Pipeline 领域合同。
- 不引入 DashScope SDK；现有 `fetch`、`FormData` 和项目错误边界足以完成协议实现。
- 不执行真实付费 API 作为常规测试。

## 4. 当前基础与缺口

### 4.1 可以直接复用

- `GenerationProvider.submit()` 可以返回 `pending` 或 `succeeded`，能够同时承载异步 Task 和 Z-Image 同步结果。
- `prepareAssets()` 已接收 operation、冻结的 execution config、素材和 credential。
- `PreparedGenerationAsset.reference` 是不透明 JSON，并支持 `expiresAt`。
- Job 已冻结 `executionConfig`，重启、恢复和重试不必重新读取当前 Catalog。
- Worker 已支持 Provider 返回 `retryAfterMs` 和多个输出。
- Provider enabled 数据表按任意 `provider_id` 存储，不需要数据库迁移。
- Route enabled 与 capability 默认 Route 已经是供应商无关状态。

### 4.2 必须先消除的硬编码

- `GenerationProviderModule` 没有展示和凭据描述；
- `FileGenerationCredentialStore` 只为 `runninghub:default` 回退 `RUNNINGHUB_API_KEY`；
- 前端 API 和设置 Store 只保存一个 RunningHub enabled/credential 状态；
- Route Handler 固定为 RunningHub 文件；
- Composer Options 用手写 Map 判断 RunningHub 凭据；
- application 的 Provider 设置方法尚未拒绝未知 `providerId`。

这些问题不会阻止 Adapter 注册，但会导致每增加一个供应商都要复制设置组件、API 文件和凭据分支，所以必须在千问实现之前解决。

## 5. 总体架构

```text
Qwen API Reference (review only)
              |
              v
       Qianwen Catalog
              |
              v
Qianwen Provider Module ---> trusted Provider Directory
              |                         |
              v                         v
       Qianwen Adapter       Provider Settings Service
              |                         |
              +------------+------------+
                           |
                           v
             existing Generation application
                           |
                           v
             Provider Job / Worker / Artifacts
```

依赖方向保持：

```text
domain <- ports <- application <- transport
                  ^
                  |
            infrastructure
                  ^
                  |
             composition
```

千问请求、响应、OSS Policy、供应商错误和 Task 类型只能存在于 infrastructure。Application 只处理项目自己的 Route、Job、prepared asset、状态和产物。

## 6. 通用 Provider 描述与设置

### 6.1 Provider Module

扩展 composition 中的 Module 描述：

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

首批模块：

```ts
runninghub -> runninghub:default -> RUNNINGHUB_API_KEY
qianwen    -> qianwen:default    -> DASHSCOPE_API_KEY
```

`reference` 与环境变量只来自仓库内固定 Module。浏览器只提交 `providerId` 和凭据值，不能提交 credential ref 或环境变量名来影响服务端读取位置。

### 6.2 Provider Directory 与 Application Service

从固定 Module 列表构建只读 Provider Directory，并增加专门的 Provider Settings Service：

```ts
interface GenerationProviderDirectory {
  list(): GenerationProviderDescriptor[];
  get(providerId: string): GenerationProviderDescriptor | undefined;
}
```

该 Service 负责：

- 列出受信 Provider；
- 拒绝未知 `providerId`；
- 读取和修改 Provider enabled；
- 根据 descriptor 服务端映射 credential ref；
- 读取、保存和删除凭据；
- 只返回 `hasCredential`，永不返回凭据值。

同时把 `hasCredential()` 与 `setCredential()` 纳入 `GenerationCredentialStore` port，Route Handler 不再依赖具体文件存储类的额外方法。

### 6.3 HTTP 合同

新增列表接口并把现有固定 Route Handler 改为动态段：

```text
GET    /api/generation/providers
GET    /api/generation/providers/[providerId]
PATCH  /api/generation/providers/[providerId]

GET    /api/generation/credentials/[providerId]
PUT    /api/generation/credentials/[providerId]
DELETE /api/generation/credentials/[providerId]
```

`runninghub` 的现有 URL 不变，只是由动态 Route Handler 接管。列表响应建议为：

```ts
interface GenerationProviderDescriptorDto {
  providerId: string;
  displayName: string;
  enabled: boolean;
  credential?: {
    kind: "api-key";
    hasCredential: boolean;
    environmentVariable: string;
  };
}
```

设置页按 descriptor 渲染 Provider 卡片和各自 Route 分组。UI 行为保持通用；新增供应商只允许增加必要的中英文词典内容，不能增加新的供应商专用设置组件。

Composer Options 从 Provider Directory 批量取得 enabled 和 credential 状态，不再维护手写供应商 Map。

### 6.4 凭据文件

第一阶段保持 `generation-credentials.json` 的 version 1 格式，不迁移数据库。File Store 构造时接收受信的 `credentialRef -> environmentVariable` 映射：

```ts
new FileGenerationCredentialStore(filePath, environment, credentialEnvironmentMap)
```

Store 不再出现供应商 `if`。保存的凭据优先于环境变量；删除保存值后重新回退环境变量，这一行为保持兼容。

## 7. Qianwen Provider Module

建议目录：

```text
src/server/infrastructure/content-generation/qianwen/
  catalog/
    z-image.ts
    wan-image.ts
    wan-2-7.ts
    wan-3-0.ts
    minimax-h3.ts
    happyhorse.ts
    index.ts
  qianwen-adapter.ts
  qianwen-catalog.ts
  qianwen-catalog-validator.ts
  qianwen-provider-constants.ts
  qianwen-provider-module.ts
  qianwen-request-builder.ts
  qianwen-response-normalizer.ts
  qianwen-task-client.ts
  qianwen-upload-client.ts
```

常量：

```ts
QIANWEN_PROVIDER_ID = "qianwen"
QIANWEN_CREDENTIAL_REF = "qianwen:default"
QIANWEN_API_ORIGIN = "https://dashscope.aliyuncs.com/api/v1"
```

## 8. Qianwen Catalog

### 8.1 Definition

Catalog 使用 TypeScript 和 `satisfies`，不新增 YAML 运行时依赖：

```ts
interface QianwenOperationDefinition {
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
    endpointId: QianwenEndpointId;
    vendorModel: QianwenModelId;
    submitMode: "sync" | "async-task";
    requestProfile: QianwenRequestProfile;
    resultProfile: QianwenResultProfile;
    parameterKeys: string[];
    assetBindings?: QianwenAssetBinding[];
    pollIntervalMs?: number;
    mapperId?: QianwenCustomMapperId;
  };
}
```

### 8.2 受信 Endpoint ID

Catalog 不保存完整 URL，只能选择：

```ts
type QianwenEndpointId =
  | "multimodal-generation"
  | "image-generation"
  | "legacy-text-to-image"
  | "video-synthesis";
```

Adapter 内部固定映射：

```text
multimodal-generation -> /services/aigc/multimodal-generation/generation
image-generation      -> /services/aigc/image-generation/generation
legacy-text-to-image  -> /services/aigc/text2image/image-synthesis
video-synthesis       -> /services/aigc/video-generation/video-synthesis
```

查询路径不能来自 Catalog：

```text
GET /tasks/{taskId}
```

当前本地 API 参考只明确给出了 SDK 取消示例，没有提供足够完整的 HTTP 取消合同。首批 Qianwen Adapter 因此不实现可选 `cancel()`；用户取消只停止 Po Agent 本地推进，并明确提示远端任务可能继续运行和计费。补充并验证官方 HTTP Task Cancel 文档后，再单独实现远端取消。

### 8.3 有限 Profile

```ts
type QianwenRequestProfile =
  | "messages-text-v1"
  | "legacy-text-image-v1"
  | "prompt-media-video-v1";

type QianwenResultProfile =
  | "choices-content-image-v1"
  | "results-url-image-v1"
  | "video-url-v1";
```

Profile 的职责：

| Profile | 固定行为 |
| --- | --- |
| `messages-text-v1` | 将项目 prompt 放入单个 user message 的 text content；只发送 Catalog 白名单参数 |
| `legacy-text-image-v1` | 将项目 prompt 放入 `input.prompt`；兼容旧图像参数结构 |
| `prompt-media-video-v1` | 构造 `input.prompt`、可选 `negative_prompt`/`audio_url` 和按 binding 生成的 `media` |
| `choices-content-image-v1` | 提取 `choices[].message.content[].image` |
| `results-url-image-v1` | 提取 `results[].url` |
| `video-url-v1` | 提取 `output.video_url` |

媒体类型差异由受限的 `assetBindings` 描述，例如：

```ts
[
  { slot: "firstFrame", mediaType: "first_frame", cardinality: "first" },
  { slot: "lastFrame", mediaType: "last_frame", cardinality: "first" },
  { slot: "referenceImages", mediaType: "reference_image", cardinality: "list" },
]
```

无法由这些固定规则准确表达的 `reference_voice` 等组合使用带版本的 `mapperId`，不能在通用 Builder 中添加 operation 特判。

### 8.4 冻结的 execution config

Catalog 编译到 Route 的 `adapterConfig`：

```json
{
  "protocol": "dashscope-media-v1",
  "version": 1,
  "endpointId": "video-synthesis",
  "vendorModel": "wan3.0-video",
  "submitMode": "async-task",
  "requestProfile": "prompt-media-video-v1",
  "resultProfile": "video-url-v1",
  "parameterKeys": ["resolution", "ratio", "duration", "promptExtend", "watermark", "seed"],
  "assetBindings": [],
  "pollIntervalMs": 15000
}
```

Provider Job 创建时冻结此对象。Adapter 的 prepare、submit、poll 和 cancel 只解析快照，不按 operation 回查当前 Catalog。

### 8.5 Catalog 校验

应用启动前至少验证：

- operation、Route ID 唯一；
- Provider ID、credential ref 固定；
- Endpoint ID、模型 ID、Profile 和 mapper ID 属于受信联合类型；
- sync Route 不声明轮询配置；
- async Route 必须声明合法轮询间隔；
- request/result Profile 与 Endpoint 组合合法；
- parameterKeys 全部存在于 Input Schema，且未知参数不会透传；
- assetBindings 全部指向已声明 slot，slot cardinality 与 `multiple` 一致；
- 每个 slot 只绑定一次，绑定顺序稳定；
- Schema 默认值属于枚举且落在范围内；
- 同 capability 不产生重复 `catalogDefault`。

## 9. 临时 OSS 素材准备

### 9.1 流程

```text
ProviderInputAsset
      |
      v
GET /uploads?action=getPolicy&model=<frozen vendorModel>
      |
      v
validate HTTPS upload_host + append multipart fields + file last
      |
      v
POST upload_host (without DashScope Authorization)
      |
      v
PreparedGenerationAsset.reference = {
  kind: "dashscope-oss",
  url: "oss://...",
  vendorModel: "..."
}
```

`expiresAt` 使用上传完成时间加 48 小时并预留安全余量，例如记录为 47 小时。尚未提交的 Job 恢复时，现有 Execution Service 会重新准备已过期引用。

### 9.2 不变量

- 同一次 `advance()` 内的 Policy 请求、上传和模型提交使用同一份已解析 credential；
- Policy 的 `model` 必须等于冻结 execution config 的 `vendorModel`；
- prepared reference 的 `vendorModel` 必须在 submit 前再次比对；
- 不接受 Catalog、用户参数或 prepared asset 覆盖 upload host；
- upload host 仅允许 HTTPS 和经过验证的阿里云 OSS Host；
- 上传请求不携带 DashScope Authorization、Cookie 或应用自定义 Header；
- 禁止或逐跳验证重定向；
- multipart 的 `file` 必须最后 append；
- 一次 Policy/上传只处理一个文件；多个文件保持 slot、bindingId 与 order；
- 只有请求实际包含 `oss://` 时才添加 `X-DashScope-OssResourceResolve: enable`；
- Policy、Signature、OSSAccessKeyId 和上传表单不进入 prepared reference；
- API Key 更新发生在已上传、未提交的极小恢复窗口时，若账号不同可能导致供应商拒绝访问；失败 Job 通过显式重试重新准备素材，不跨 Job 复用上传结果。

## 10. 提交、轮询和结果归一化

### 10.1 Header

Adapter 固定添加：

```text
Authorization: Bearer <credential>
Content-Type: application/json
```

异步提交额外添加：

```text
X-DashScope-Async: enable
```

包含临时 OSS 引用时额外添加：

```text
X-DashScope-OssResourceResolve: enable
```

Catalog 无权声明或覆盖这些 Header。

### 10.2 提交结果

- 同步成功：返回 `state: "succeeded"` 与图片 outputs；Worker 直接下载并完成 Run。
- 异步成功：提取 `output.task_id`，返回 `state: "pending"`。
- HTTP 非 2xx 或 2xx 中的供应商业务错误：转换为稳定 `AppError`/Provider failed result。
- 请求已发送但无法确认响应：继续使用现有 `submission_unknown` 防重复付费语义。

### 10.3 Task 状态

| DashScope | Provider 结果 |
| --- | --- |
| `PENDING`、`RUNNING` | `pending` |
| `SUCCEEDED` | `succeeded` |
| `FAILED` | `failed` |
| `CANCELED` | `failed`，错误码归一化为供应商侧取消 |
| `UNKNOWN` | `failed`，标记任务过期或不可查询 |
| 未知新状态 | 协议错误，不猜测为成功 |

图片异步 Route 返回 `retryAfterMs: 5000`，视频 Route 返回 `retryAfterMs: 15000`。后续如响应提供明确 Retry-After，可以在受限范围内覆盖 Catalog 默认值。

### 10.4 下载

- 只下载结果 Profile 解析出的 URL；
- 仅允许 HTTPS；
- Host 必须符合 DashScope 结果存储 allowlist；
- 禁止携带 API Key 和 Cookie；
- 禁止或逐跳校验重定向；
- 保持现有文件大小、保存目录和 checksum 行为；
- 结果 URL 只有约 24 小时有效，成功后必须立即下载，不能把远端 URL 当永久产物。

## 11. Route 建模

### 11.1 All-in-One 模型拆分

Wan 3.0 和 MiniMax-H3 虽然共用一个供应商 API，但在 Po Agent 中按用户意图拆分 Route：

```text
text-to-video
image-to-video
multimodal-to-video
```

拆分后可以复用现有表单、Planner、Agent Tool 和 Pipeline capability，不需要把复杂条件全部塞进一个万能 Route。

### 11.2 输入约束

首批 Route 优先选择现有 Schema 能准确表达的组合：

- 文生视频：prompt 必填，无素材；
- 首帧图生视频：一个必填图片 slot，可选尾帧 slot；
- 参考生视频：prompt 和一组明确数量上限的参考素材；
- 多模态视频：使用 `at-least-one-asset` 表达至少一个素材。

如果某 Route 必须表达“prompt 或素材至少一个”“素材组互斥”或“跨 slot 总数上限”，应先增加供应商无关、UI 可解释的 constraint，并在 transport 与 application 同时校验。不要只在 Qianwen Adapter 中拒绝，也不要为了一个模型建立任意条件 DSL。

## 12. 模型落地顺序

### 12.1 第一条端到端 Route

先实现：

```text
qianwen-wan-3-0-text-to-video
```

它验证 Provider 注册、凭据、异步提交、Task 轮询、视频下载和审计快照，但不依赖素材上传，最适合作为第一条付费 smoke Route。

### 12.2 MVP Catalog

第一条 Route 稳定后加入：

| Route | 模型 | 能力 | 验证目标 |
| --- | --- | --- | --- |
| `qianwen-z-image-turbo-text-to-image` | `z-image-turbo` | 文生图 | 同步提交与 choices 图片结果 |
| `qianwen-wan-2-6-text-to-image` | `wan2.6-t2i` | 文生图 | 异步图片与多输出 |
| `qianwen-wan-3-0-image-to-video` | `wan3.0-video` | 图生视频 | OSS 上传与首帧绑定 |
| `qianwen-wan-3-0-multimodal-to-video` | `wan3.0-video` | 多模态生视频 | 多素材顺序与 media 类型映射 |

所有 Route 初始 `enabled: false`，不设置 `catalogDefault`。

### 12.3 第二批视频

- Wan 2.7 T2V：固定 `wan2.7-t2v-2026-06-12`；
- Wan 2.7 I2V：固定 `wan2.7-i2v-2026-04-25`；
- Wan 2.7 R2V：固定 `wan2.7-r2v-2026-06-12`；
- HappyHorse 1.1 T2V、I2V、R2V；
- MiniMax-H3 T2V、I2V、Multimodal；
- Wan 3.0 Prime 作为独立 Route，而不是替换普通版。

### 12.4 最后处理

- Wan 2.5、2.2、2.1 和 WanX legacy image Profile；
- Wan 3.0 文件/网页生视频；
- 参考素材与 `reference_voice` 的稳定绑定；
- 当前本地资料尚未覆盖的千问 Image 2.x/3.x、Wan 2.7 Image。

## 13. 错误与审计

建议稳定错误类别：

```text
GENERATION_CREDENTIAL_NOT_FOUND
GENERATION_PROVIDER_UNAVAILABLE
GENERATION_UPLOAD_POLICY_FAILED
GENERATION_UPLOAD_FAILED
GENERATION_PROVIDER_REJECTED
GENERATION_PROVIDER_PROTOCOL_ERROR
GENERATION_TASK_EXPIRED
GENERATION_DOWNLOAD_FAILED
```

供应商 `request_id` 保留在脱敏 response snapshot 方便排查。快照规则必须覆盖：

- Authorization、API Key、Cookie；
- policy、signature、OSSAccessKeyId；
- URL query 中的 token、secret、authorization、signature 和临时访问参数；
- 超过现有大小上限的请求/响应正文。

本地 `oss://` 引用可以保存在 prepared asset 中，但展示给 UI 的审计快照应按远程临时引用处理，不作为用户可复制的长期 URL。

## 14. 测试策略

### 14.1 通用 Provider 设置

- Registry 拒绝重复和未知 providerId；
- 两个 Provider 能被列表 API 同时返回；
- 动态设置/凭据 API 保持 RunningHub URL 兼容；
- `providerId` 不能转换为任意 credential ref；
- stored credential 优先于环境变量，删除后回退环境变量；
- Composer Options 只返回 provider enabled、route enabled 且 credential 可用的 Route；
- 设置页可独立保存、删除和切换两个 Provider，不串状态。

### 14.2 Catalog 与 Builder

- 每种 Profile 至少一条完整请求快照测试；
- 未知参数不进入请求；
- sync/async Header 正确；
- asset slot 到 media type/order 的映射稳定；
- 模型快照、Endpoint ID、默认值和限制符合本地 API 参考；
- Catalog validator 覆盖重复 ID、非法 Profile 组合和不存在字段。

### 14.3 上传

- Policy 请求使用冻结 vendorModel；
- 上传 Host、协议和重定向校验；
- multipart 字段值正确且 file 最后；
- 上传请求不泄漏 DashScope Authorization；
- `oss://`、vendorModel 和 expiresAt 正确；
- 过期 prepared asset 会重新准备；
- Policy、Signature 和签名 query 在快照中脱敏。

### 14.4 状态与下载

- 所有 Task 状态映射；
- 2xx 业务错误不会误报成功；
- Z-Image 同步成功不进入 poll；
- 图片与视频采用不同轮询间隔；
- 多图结果产生多个 artifact；
- 下载 Host、重定向和 Content-Type 校验；
- 供应商返回的 CANCELED、UNKNOWN 和 submission unknown 保持明确语义。

### 14.5 真实 API Smoke

真实调用必须由单独命令和显式环境开关启用，并提示会产生费用。常规 `npm run check` 不调用外部生成 API。Smoke 顺序：

1. Wan 3.0 短时长文生视频；
2. Z-Image 单图；
3. Wan 3.0 单首帧图生视频；
4. 多素材视频。

## 15. 实施阶段与验收

当前进度（2026-08-27）：PR 1 至 PR 5 已完成；已实现通用 Provider 设置、Wan 3.0 视频、临时 OSS、Z-Image、Wan 2.6 图片，以及 Wan 2.7、HappyHorse 1.1、MiniMax-H3 的九条视频 Route。真实付费 Smoke 由开发者手动执行，不属于常规自动化检查。下一阶段进入 PR 6 Legacy 与生产加固。

### PR 1：通用 Provider 设置与凭据

- 扩展 Module descriptor；
- 增加 Provider Directory 和 Settings Service；
- 动态 Provider/credential Route Handler；
- 泛化 File Credential Store、Composer Options、前端 Store 与设置 UI；
- 更新 contracts、i18n、公共 API 文档与测试。

验收：RunningHub 行为完全兼容；注册一个测试 Provider 后，无需新增供应商专用 UI/API 代码即可展示、启用和保存凭据。

### PR 2：Qianwen 核心 Adapter 与首条 Route

- 新增 Module、Catalog、validator、Task client、Builder 和 normalizer；
- 实现 Wan 3.0 文生视频；
- 完成异步提交、轮询、下载、错误与快照测试。

验收：使用 mock 完成端到端 Job；可选真实 smoke 成功后产物立即保存到 workspace。

### PR 3：临时 OSS 与 Wan 3.0 素材 Route

- 实现 Upload Client 和 `prepareAssets()`；
- 增加 Wan 3.0 图生视频与多模态 Route；
- 完成上传安全、过期恢复和素材顺序测试。

验收：本地图片可以经过 `oss://` 提交，临时凭据不进入持久化和日志。

### PR 4：图片 Profile

- 增加 Z-Image 同步 Route；
- 增加 Wan 2.6 异步文生图；
- 验证同步完成、多图输出和 5 秒轮询。

验收：同步与异步图片均生成本地 artifact，不改变 Worker 状态机。

### PR 5：扩充视频模型

- 加入 Wan 2.7、HappyHorse、MiniMax-H3；
- 对 All-in-One 模型继续拆分 capability Route；
- 只为无法准确声明的组合增加固定 mapper。

验收：同协议模型只增加 Catalog 条目和聚焦测试，不修改 application、Worker 或 HTTP 设置逻辑。

### PR 6：Legacy 与生产加固

- 增加旧版图片 Profile；
- 完善 Provider 级并发、退避和限流；
- 增加可选集成测试、运行指标和故障排查文档。

验收：限流和恢复语义可测试，旧模型不会污染首选模型列表或成为默认 Route。

每个代码 PR 在交付前运行：

```powershell
npm run check
```

涉及 Next.js Route Handler、设置页面或生产运行时的 PR 还必须运行：

```powershell
npm run build
```

## 16. 完成定义

千问平台接入完成需同时满足：

- 设置、凭据和 Composer 可用性不含供应商硬编码；
- Qianwen Module 在固定受信列表注册一次；
- Catalog 是 Route、Schema 和执行协议的唯一生产来源；
- 同步、异步、上传、轮询和下载均由有限 Profile 或固定 mapper 实现；远端取消需在补齐官方 HTTP 合同后另行实现；
- 所有任务使用冻结 execution config；
- 新 Route 默认关闭且不抢占现有默认 Route；
- 所有外部输入、动态 Host、重定向和输出 URL 均在边界验证；
- API Key、OSS 临时凭据和签名 URL 不出现在响应、日志或审计快照；
- contracts、前端 API、transport、测试、`architecture.md` 和 `agent-api-reference.md` 同步；
- `npm run check` 通过；涉及 Next.js 行为时 `npm run build` 通过。
