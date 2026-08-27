# RunningHub API Catalog 设计方案

> 状态：Draft，等待 Review  
> 日期：2026-08-26  
> 范围：Po Agent 内置 RunningHub 内容生成 API 的注册、参数建模、请求映射与文档辅助接入

## 1. 背景

当前项目通过以下三个位置共同描述一条 RunningHub 生成 API：

- `runninghub-routes.ts` 注册 Route、产品分组、Capability、默认参数和版本；
- `runninghub-input-schemas.ts` 描述 Prompt、参数、素材槽位与输入约束；
- `runninghub-adapter.ts` 注册 Endpoint，并把项目语义字段转换为 RunningHub 请求体。

这种实现边界清晰、类型安全，也能阻止用户把任意 URL 或 HTTP 模板接入付费执行链路。但随着模型数量增加，同一个 operation ID 需要在多个位置重复维护，新增普通 API 时容易发生以下问题：

- Route 已注册，但 Adapter 遗漏 Endpoint；
- Schema 枚举和实际请求字段不一致；
- 默认值不符合 Schema；
- 素材槽位名称和供应商字段名称混用；
- 相似模型产生大量重复 `switch` 分支和重复测试；
- API 文档已经存在，但仍需要人工重复抄写参数表。

项目需要一种更快的内置 API 接入方式，同时继续保留当前的安全边界和显式代码审查流程。

## 2. 目标

本方案目标如下：

1. 一条标准 RunningHub API 只在一份受信 Catalog 定义中描述。
2. 从 Catalog 自动产生 Route、Input Schema、默认参数、Endpoint 和请求体映射。
3. 新增普通 API 时不再分别修改多个 `switch` 和测试列表。
4. 支持从 RunningHub Markdown 文档生成待审查的 Catalog 草稿。
5. 保持项目内部字段与供应商字段隔离。
6. 保持 Route ID、operation ID、用户启用状态和默认路由行为稳定。
7. 对少数非标准 API 保留显式自定义 Mapper。
8. 在任务提交前发现错误，避免无效请求产生付费任务。

## 3. 非目标

本方案不做以下事情：

- 不恢复用户可编辑的通用 HTTP Provider 模板；
- 不允许用户在设置页填写任意 Endpoint；
- 不在运行时读取未经代码审查的 Markdown 并直接执行；
- 不尝试把所有供应商协议抽象成一套万能 DSL；
- 不改变 `GenerationProvider`、Generation Run、Provider Job、轮询和持久化的核心边界；
- 不让 RunningHub 字段名称进入 contracts、application、Agent 工具或 Pipeline 领域模型；
- 不自动猜测会影响计费、素材绑定或生成结果的业务语义。

## 4. 设计原则

### 4.1 Catalog 是生产事实来源

生产代码使用仓库内受类型检查的 TypeScript Catalog。Markdown 文档只用于生成草稿和人工对照，不能直接成为运行时配置。

### 4.2 项目语义与供应商协议分离

Catalog 同时描述两类名称：

- 项目语义字段，例如 `durationSeconds`、`generateAudio`、`firstFrameUrl`；
- RunningHub 字段，例如 `duration`、`generateAudioSwitch`、`firstImageUrl`。

UI、Agent 和 Pipeline 只读取项目语义字段。只有 RunningHub infrastructure 能读取供应商字段。

### 4.3 声明覆盖常规差异，代码处理真正的特殊行为

Catalog 适合表达：

- Endpoint；
- Prompt 长度；
- 文本、数字、布尔、单选和多选参数；
- 参数重命名；
- 数字转字符串等有限转换；
- 单文件和文件列表素材；
- 必填、数量、类型和大小限制；
- 已支持的组合约束；
- 标准 RunningHub 提交、查询和输出协议。

以下行为继续使用显式代码：

- 非标准鉴权或上传；
- 非标准状态查询；
- 深层嵌套或条件复杂的请求体；
- 与标准 RunningHub 响应不同的结果解析；
- 需要额外外部调用才能计算的字段；
- Catalog 无法准确表达的供应商兼容逻辑。

## 5. 建议目录结构

```text
src/server/infrastructure/content-generation/runninghub/
  catalog/
    seedream-v5-pro.ts
    seedance-2.ts
    seedance-2-5.ts
    minimax-h3.ts
    pixverse-v6.ts
    wan-2-7.ts
    wan-3.ts
    index.ts

  runninghub-catalog.ts
  runninghub-catalog-validator.ts
  runninghub-request-builder.ts
  runninghub-custom-mappers.ts
  runninghub-adapter.ts
  runninghub-routes.ts

scripts/
  generate-runninghub-catalog-draft.mjs

docs/RunningHubAPIs/
  ...
```

每个产品一个 Catalog 文件，避免形成单个超大配置文件。`catalog/index.ts` 只负责按稳定顺序汇总定义。

## 6. Catalog 数据模型

### 6.1 Operation 定义

建议使用 TypeScript 对象和 `satisfies`，不新增 YAML 解析依赖。

```ts
interface RunningHubOperationDefinition {
  operation: string;
  endpoint: RunningHubEndpointPath;
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
  prompt: {
    required: boolean;
    minLength?: number;
    maxLength?: number;
  };
  parameters?: RunningHubParameterDefinition[];
  assets?: RunningHubAssetDefinition[];
  constraints?: GenerationInputConstraint[];
  request?:
    | { mode: "declarative" }
    | { mode: "custom"; mapper: RunningHubCustomMapperId };
}
```

`description` 用于用户在选择或确认前了解模型适用场景；`tags` 来自模型文档中的短说明，但必须拆分为独立、可排序、可限制数量的短文本，禁止把带 `｜` 的整段字符串直接作为单个标签。两者由 Catalog 进入 Route 持久化与公开 DTO，所有 UI 入口和自动选路共享同一事实来源。

`endpoint` 必须是相对路径，并由类型和运行时校验限制在 `/openapi/v2/` 下。Catalog 不接受完整 Origin，实际请求始终使用 Adapter 内固定的 RunningHub Origin。

### 6.2 参数定义

```ts
interface RunningHubParameterDefinition {
  key: string;
  vendorKey: string;
  label: string;
  type: GenerationParameterType;
  required?: boolean;
  defaultValue?: JsonValue;
  options?: GenerationParameterOption[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  format?: "url";
  serialize?: "identity" | "string";
  omitWhenEmpty?: boolean;
}
```

第一阶段只支持经过审计的有限转换：

- `identity`：保持原始 JSON 类型；
- `string`：把数字或字符串转换为供应商字符串。

不允许在 Catalog 中保存任意 JavaScript 表达式。复杂转换使用自定义 Mapper。

### 6.3 素材定义

```ts
interface RunningHubAssetDefinition {
  key: string;
  vendorKey: string;
  label: string;
  mediaType: "image" | "video" | "audio";
  required?: boolean;
  minFiles?: number;
  maxFiles: number;
  maxFileSizeBytes: number;
  acceptedTypes: string[];
  serialize: "first" | "list";
}
```

示例：项目内部使用 `audioUrls` 数组槽位，而 Wan 2.7 请求只接受单个 `audioUrl`：

```ts
{
  key: "audioUrls",
  vendorKey: "audioUrl",
  label: "背景音频",
  mediaType: "audio",
  maxFiles: 1,
  maxFileSizeBytes: 15 * MIB,
  acceptedTypes: ["audio/mpeg", "audio/wav", "audio/mp4"],
  serialize: "first",
}
```

### 6.4 完整示例

```ts
export const pixVerseV6TextToVideo = defineRunningHubOperation({
  operation: "pixverse-v6-text-to-video",
  endpoint: "/openapi/v2/pixverse-v6/text-to-video",
  route: {
    id: "runninghub-pixverse-v6-text-to-video",
    name: "PixVerse V6 文生视频",
    product: "PixVerse V6",
    capability: "text-to-video",
    revision: 1,
  },
  prompt: {
    required: true,
    maxLength: 20_480,
  },
  parameters: [
    selectParameter({
      key: "resolution",
      vendorKey: "resolution",
      label: "分辨率",
      values: ["360p", "540p", "720p", "1080p"],
      defaultValue: "720p",
    }),
    selectParameter({
      key: "durationSeconds",
      vendorKey: "duration",
      label: "时长",
      values: range(1, 15),
      defaultValue: 5,
    }),
    booleanParameter({
      key: "generateAudio",
      vendorKey: "generateAudioSwitch",
      label: "生成音频",
      defaultValue: true,
    }),
  ],
});
```

## 7. 生成的运行时结构

### 7.1 Route 生成

`createRunningHubRoutes()` 不再手写 Route 数组，而是遍历 Catalog：

```ts
export function createRunningHubRoutes(now = new Date().toISOString()) {
  return RUNNINGHUB_OPERATIONS.map((definition) =>
    generationRouteFromDefinition(definition, now),
  );
}
```

转换过程负责：

- 生成 `GenerationRoute`；
- 从参数定义提取 `defaults`；
- 从参数和素材定义生成 `GenerationInputSchema`；
- 保持 `enabled: false`；
- 使用显式 `catalogDefault`；
- 填入固定 Provider ID 和 credential reference。

用户保存的 `enabled` 和 `isDefault` 状态继续由现有 Route seed 逻辑保留。

### 7.2 请求体生成

标准请求构造器按定义完成以下转换：

```text
GenerationInput.prompt                  -> prompt
parameter.key                           -> parameter.vendorKey
serialize: identity                     -> 原值
serialize: string                       -> String(value)
asset.serialize: first                  -> 第一个已上传 URL 或 null
asset.serialize: list                   -> 按 binding order 排列的 URL 数组
```

请求构造器必须：

- 只读取 Catalog 中声明的字段；
- 不透传未知 parameters；
- 保持显式素材顺序；
- 按定义决定空值是省略还是 `null`；
- 继续使用现有审计快照脱敏；
- 不读取用户提供的 Endpoint、Header 或 credential 字段。

### 7.3 自定义 Mapper

特殊 API 使用固定 ID 选择仓库内代码：

```ts
request: {
  mode: "custom",
  mapper: "seedance-2-5-multimodal",
}
```

```ts
const CUSTOM_MAPPERS = {
  "seedance-2-5-multimodal": buildSeedance25MultimodalRequest,
} satisfies Record<RunningHubCustomMapperId, RunningHubRequestMapper>;
```

Catalog 不能直接保存函数路径或任意动态 import。

## 8. Markdown 草稿生成

### 8.1 命令

建议增加：

```powershell
npm run runninghub:add -- docs/RunningHubAPIs/20260901/model/text-to-video.md
```

脚本读取文档中的：

- 请求 Endpoint；
- 参数名称；
- 参数类型；
- 必填状态；
- 枚举值；
- 数值和文本范围；
- 文件数量；
- 单文件大小；
- 可识别的媒体类型。

### 8.2 输出

脚本默认输出到临时草稿目录，而不是直接修改生产 Catalog：

```text
.runninghub-drafts/
  model-text-to-video.ts
  model-text-to-video.report.md
```

TypeScript 草稿包含可确定字段。报告列出无法可靠判断的项目，例如：

- 建议的项目 capability；
- 项目语义字段名称；
- 默认值；
- 数字是否需要序列化为字符串；
- 素材应该映射为 `first` 还是 `list`；
- 首尾帧、互斥、总时长等组合约束；
- 是否需要自定义 Mapper；
- 文档内部的矛盾或缺失值。

### 8.3 人工确认清单

草稿进入 Catalog 前必须确认：

1. Route ID 和 operation ID 稳定且没有复用旧语义。
2. Capability 与产品行为一致。
3. 默认参数不会意外增加费用或改变输出类型。
4. 素材槽位能被 Direct Generate、Agent 和 Pipeline 正确绑定。
5. 参数名称是项目语义，而不是供应商字段的机械复制。
6. 文件大小使用项目真实上限，而不是无法实现的供应商上限。
7. URL、文档和外部内容输入具有明确安全约束。
8. 非标准接口已切换为自定义 Mapper。

## 9. Catalog 自动校验

增加统一的 Catalog 测试和启动前开发校验：

### 9.1 唯一性

- Route ID 唯一；
- operation ID 唯一；
- 产品内 Route 名称唯一；
- Endpoint 与 operation 的组合唯一；
- 同一 capability 只有一个 `catalogDefault`。

### 9.2 Schema 一致性

- 每个默认值都能通过参数 Schema；
- Select 默认值必须存在于 options；
- `min <= max`；
- 素材 `minFiles <= maxFiles`；
- 单文件槽位不能声明 `serialize: list` 和错误的 multiple 语义；
- constraint 引用的参数和素材槽位必须存在；
- 项目字段 key 在同一 operation 内唯一；
- vendor key 在不允许重复时唯一。

### 9.3 安全

- Endpoint 必须以 `/openapi/v2/` 开头；
- Catalog 不允许定义 Origin、Authorization Header 或 API Key；
- URL 参数必须声明 URL 格式和应用级校验；
- 输出下载仍使用 Adapter 固定 allowlist；
- request/response snapshot 继续执行统一脱敏和大小限制。

### 9.4 请求契约

每个 declarative operation 自动生成最小合法请求测试，验证：

- Endpoint 可被 Adapter 找到；
- Prompt 被写入；
- 参数映射到正确 vendor key；
- `string` 转换正确；
- `first` 和 `list` 素材序列化正确；
- 未声明的项目字段不会泄漏到请求体。

特殊 Mapper 继续维护少量针对性测试。

## 10. 新增 API 的目标工作流

Catalog 完成后，新增标准 API 的流程为：

1. 将 RunningHub Markdown 文档放入 `docs/RunningHubAPIs/`。
2. 运行 `npm run runninghub:add -- <document>`。
3. 阅读生成报告，补充 capability、语义字段、默认值和特殊约束。
4. 把确认后的定义移动到对应产品 Catalog 文件。
5. 为特殊行为补一条自定义 Mapper 测试；标准 API 不重复手写测试。
6. 运行 `npm run check`。
7. 使用真实凭证时，仅对新增 operation 做一次手动 smoke test。

对于标准接口，预期修改范围缩小为一个 Catalog 定义和必要的中英文标签；Route、Schema、Adapter path 和普通请求测试不再分别修改。

## 11. 迁移方案

### Phase 1：建立 Catalog 类型和校验器

- 增加 Catalog 类型、helper 和 validator；
- 保留现有 Route 与 Adapter 实现；
- 先用测试验证 Catalog 能表达现有接口；
- 不改变运行时行为。

### Phase 2：迁移简单接口

优先迁移字段规则简单的接口：

- Seedream v5 Pro；
- PixVerse V6；
- MiniMax H3 文生视频；
- Wan 3.0 图生视频。

让新请求构造器和旧实现产生相同请求快照。

### Phase 3：迁移素材和组合约束接口

- MiniMax H3 图生视频和多模态视频；
- Wan 2.7；
- Wan 3.0 参考生视频；
- Seedance 图生视频和多模态视频。

组合约束继续由 application 的供应商无关 Schema 校验执行。

### Phase 4：收敛旧代码

- `runninghub-routes.ts` 改为从 Catalog 生成；
- 删除已迁移 operation 的请求体 `switch`；
- Adapter 从 Catalog 查询 Endpoint；
- 保留必要的自定义 Mapper；
- 增加 Catalog 与自定义 Mapper 覆盖率检查。

### Phase 5：增加 Markdown 草稿生成器

- 实现 Markdown 参数表解析；
- 生成 TypeScript 草稿和不确定项报告；
- 增加解析器 fixture；
- 不把草稿自动加入生产 Catalog。

## 12. 兼容性和迁移约束

- 已存在 Route ID 不得变化，否则历史 Run 和用户设置会失去关联；
- 已存在 operation ID 不得变化，否则持久化 Provider Job 无法恢复；
- 请求体迁移必须通过现有 Adapter 快照测试；
- Catalog revision 只在 Route 契约实际变化时增加；
- Route seed 继续保留用户的 `enabled` 与 `isDefault`；
- Catalog 文件顺序不得承担默认路由语义；
- 设置页继续读取 `product` 自动分组，不增加模型专用 UI；
- Agent 和 Pipeline 继续通过 Route Schema 获取参数和素材能力。

## 13. 风险与控制

### 风险：DSL 逐渐变成另一种编程语言

控制方式：只保留少量固定转换；出现复杂条件时立即使用自定义 Mapper，不继续扩张 DSL。

### 风险：Markdown 解析结果被误认为可靠

控制方式：只生成草稿；报告必须显示所有推断和缺失项；生产 Catalog 仍需代码审查。

### 风险：一个定义同时承担 Route 和协议后边界混乱

控制方式：Catalog 位于 RunningHub infrastructure；转换后只向上暴露供应商无关的 `GenerationRoute`。application 和 contracts 不依赖 Catalog 类型。

### 风险：自动默认值导致意外计费

控制方式：生成脚本不自动决定成本相关默认值；所有默认值必须人工确认并通过 Catalog 校验。

### 风险：历史任务无法恢复

控制方式：保持 Route ID、operation ID 和 Adapter operation lookup 稳定；迁移前后使用持久化恢复测试验证。

## 14. 验收标准

方案实施完成后应满足：

- 现有 18 条 RunningHub Route 全部由 Catalog 产生；
- 标准 API 不再在 Route、Schema、Endpoint 和 request `switch` 中重复注册；
- 每个 operation 都通过自动一致性和最小请求测试；
- 特殊接口通过固定自定义 Mapper 接入；
- 新增一个普通 API 时通常只新增一个 Catalog 定义；
- Markdown 工具能生成草稿和不确定项报告；
- UI、Agent、Pipeline、持久化 Worker 和公开 HTTP 合同保持兼容；
- `npm run check` 和 `npm run build` 通过；
- 真实 API smoke test 不暴露凭证，也不绕过现有付费确认和审计机制。

## 15. Review 待决策项

1. Catalog 使用“每产品一个 TypeScript 文件”还是“每 operation 一个文件”？本方案推荐每产品一个文件。
2. 可选字段为空时，默认发送 `null` 还是省略？建议按 operation 显式声明 `omitWhenEmpty`。
3. 参数标签继续由 Schema 提供中文 fallback，还是 Catalog 只保存稳定 key 并完全由 i18n dictionary 翻译？建议逐步转为稳定 key + dictionary。
4. Markdown 草稿目录使用 `.runninghub-drafts/`，还是输出到 `docs/RunningHubAPIs/drafts/`？建议使用默认不参与生产构建的 `.runninghub-drafts/`。
5. 是否在第一阶段迁移全部 18 条 Route，还是先并行保留新旧实现做请求快照对比？建议分阶段迁移并短期并行对比。
6. 是否需要为 Catalog 增加 JSON 导出，供非 TypeScript 工具读取？当前没有明确需求，建议暂不增加。
