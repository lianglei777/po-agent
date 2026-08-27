# RunningHub 内容生成 API 接入手册

> 适用范围：向 Po Agent 增加新的 RunningHub 图片或视频生成 API。
> 当前实现：`runninghub-standard-v1` Catalog。
> 目标：标准 API 只新增 Catalog 定义和测试，不修改执行服务、组合根或任务 Worker。

## 1. 接入前先做协议判断

先阅读 RunningHub API 文档，并确认以下信息：

- 提交任务的相对路径，例如 `/openapi/v2/vendor/model/text-to-video`
- 能力类型：文生图、图生图、文生视频、图生视频或多模态生视频
- Prompt 是否必填、最大长度
- 参数名、类型、默认值、枚举值和数值范围
- RunningHub 请求体中的真实字段名
- 素材字段接受单个 URL 还是 URL 数组
- 单个素材的类型、数量和大小限制
- 提交响应、任务查询和结果下载是否符合现有 RunningHub 标准协议

满足以下条件时，API 可以只通过 Catalog 接入：

1. 使用 Bearer API Key。
2. 提交接口是 `/openapi/v2/` 下的相对路径。
3. 素材可以先通过 RunningHub 标准上传接口转换成下载 URL。
4. 提交响应能被现有 Adapter 识别为任务 ID、任务状态或输出列表。
5. 任务通过 `/openapi/v2/query` 和 `taskId` 查询。
6. 请求体可以表达为 Prompt、普通参数和素材 URL 的有限映射。

如果任意一项不满足，先阅读本文的“何时需要扩展 Adapter”章节，不要把供应商特例硬编码进通用请求构造器。

## 2. 需要修改的文件

标准 API 通常只需要修改：

- `src/server/infrastructure/content-generation/runninghub/runninghub-catalog.ts`
- `src/server/infrastructure/content-generation/runninghub/runninghub-catalog.test.ts`
- `src/server/infrastructure/content-generation/runninghub/runninghub-routes.test.ts`
- `src/features/content-generation/content-generation-center.test.ts`

如果公开能力、使用说明或约束发生变化，再同步：

- `docs/agent-api-reference.md`

标准 API 不应修改：

- `generation-execution-service.ts`
- `generation-run-service.ts`
- `generation-provider.ts`
- `container.ts`
- `runninghub-adapter.ts`

## 3. 命名规则

一个模型在系统中有三个相关标识：

| 字段 | 示例 | 规则 |
| --- | --- | --- |
| `operation` | `example-video-1-text-to-video` | RunningHub Provider 内唯一、稳定，不要复用 |
| `route.id` | `runninghub-example-video-1-text-to-video` | 全系统唯一，固定以 `runninghub-` 开头 |
| `product` | `Example Video 1.0` | 用于 UI 分组，同产品的不同能力保持一致 |

建议的 operation 后缀：

- `text-to-image`
- `image-to-image`
- `text-to-video`
- `image-to-video`
- `multimodal-video`
- `reference-to-video`

标识一旦发布，应视为持久化协议。修改展示名称不能顺便修改 operation 或 route ID。

## 4. Catalog 条目的组成

每个 API 对应一个 `RunningHubOperationDefinition`：

```ts
defineOperation({
  operation: "example-video-1-text-to-video",
  route: routeMeta({
    id: "runninghub-example-video-1-text-to-video",
    name: "Example Video 1.0 文生视频",
    description: "用于模型选择界面的完整说明。",
    tags: ["文生视频", "最高1080P", "5–10秒"],
    product: "Example Video 1.0",
    capability: "text-to-video",
  }),
  inputSchema: {
    // 描述用户可以输入什么，以及如何校验。
  },
  protocol: standard(
    "/openapi/v2/example/video-1/text-to-video",
    [
      // 描述系统输入如何映射成 RunningHub 请求体。
    ],
  ),
})
```

这三部分分别负责：

- `route`：模型在产品中的名称、分组、能力和版本。
- `inputSchema`：前端表单以及服务端输入校验。
- `protocol`：提交 endpoint 和白名单式请求字段映射。

不要在 `inputSchema` 中直接使用供应商字段名，除非它本身就是清晰稳定的业务名称。供应商字段差异应放在 `protocol.fields` 中。

## 5. 文生视频模板

下面的模板可直接复制后按 API 文档调整：

```ts
function exampleVideoOperations(): RunningHubOperationDefinition[] {
  return [
    defineOperation({
      operation: "example-video-1-text-to-video",
      route: routeMeta({
        id: "runninghub-example-video-1-text-to-video",
        name: "Example Video 1.0 文生视频",
        description: "Example Video 1.0 文生视频，支持 720P/1080P、5–10 秒时长和多种画幅。",
        tags: ["文生视频", "最高1080P", "5–10秒"],
        product: "Example Video 1.0",
        capability: "text-to-video",
      }),
      inputSchema: {
        prompt: { required: true, maxLength: 5_000 },
        parameters: [
          selectField("resolution", "分辨率", ["720P", "1080P"], "720P"),
          selectField("durationSeconds", "时长", [5, 10], 5),
          selectField("aspectRatio", "画面比例", ["16:9", "9:16", "1:1"], "16:9"),
          booleanField("generateAudio", "生成音频", false),
          optionalSeedField(),
        ],
      },
      protocol: standard("/openapi/v2/example/video-1/text-to-video", [
        prompt(),
        parameter("resolution", "resolution", "720P"),
        parameter("durationSeconds", "duration", 5, "string"),
        parameter("aspectRatio", "ratio", "16:9"),
        parameter("generateAudio", "audio", false),
        parameter("seed", "seed", null),
      ]),
    }),
  ];
}
```

然后把它加入 `RUNNINGHUB_OPERATIONS`：

```ts
export const RUNNINGHUB_OPERATIONS = validateCatalog([
  // 现有条目
  ...exampleVideoOperations(),
]);
```

同一产品如果有文生视频、图生视频和多模态视频，应放在同一个 `xxxOperations()` 函数中。

## 6. 图生视频模板

```ts
defineOperation({
  operation: "example-video-1-image-to-video",
  route: routeMeta({
    id: "runninghub-example-video-1-image-to-video",
    name: "Example Video 1.0 图生视频",
    description: "使用首帧图片生成视频，可选尾帧并支持 5–10 秒时长。",
    tags: ["图生视频", "首帧/尾帧", "5–10秒"],
    product: "Example Video 1.0",
    capability: "image-to-video",
  }),
  inputSchema: {
    prompt: { required: false, maxLength: 5_000 },
    parameters: [
      selectField("resolution", "分辨率", ["720P", "1080P"], "720P"),
      selectField("durationSeconds", "时长", [5, 10], 5),
    ],
    assets: [
      mediaSlot("firstFrameUrl", "首帧图片", "image", 1, 20 * MIB, IMAGE_TYPES, true),
      mediaSlot("lastFrameUrl", "尾帧图片", "image", 1, 20 * MIB, IMAGE_TYPES),
    ],
  },
  protocol: standard("/openapi/v2/example/video-1/image-to-video", [
    prompt(),
    asset("firstFrameUrl", "imageUrl", "first"),
    asset("lastFrameUrl", "endImageUrl", "first"),
    parameter("resolution", "resolution", "720P"),
    parameter("durationSeconds", "duration", 5, "string"),
  ]),
})
```

`mediaSlot()` 的最后一个参数表示是否必填。素材上传和 URL 准备由 `prepareAssets()` 统一处理，新模型不需要实现上传代码。

## 7. 多素材模板

当 API 接受多个参考图片、视频或音频时：

```ts
inputSchema: {
  prompt: { required: true, maxLength: 5_000 },
  parameters: [
    selectField("resolution", "分辨率", ["720P", "1080P"], "720P"),
  ],
  assets: [
    mediaSlot("imageUrls", "参考图片", "image", 5, 20 * MIB, IMAGE_TYPES),
    mediaSlot("videoUrls", "参考视频", "video", 3, 50 * MIB, VIDEO_TYPES),
    mediaSlot("audioUrls", "参考音频", "audio", 1, 15 * MIB, AUDIO_TYPES),
  ],
},
protocol: standard("/openapi/v2/example/video-1/multimodal-video", [
  prompt(),
  asset("imageUrls", "imageUrls", "list"),
  asset("videoUrls", "videoUrls", "list"),
  asset("audioUrls", "audioUrls", "list"),
  parameter("resolution", "resolution", "720P"),
])
```

只有 API 接受数组时才使用 `"list"`。如果 API 只接受一个 URL，应将 `maxFiles` 设为 1，并使用 `"first"`。

## 8. 请求字段映射规则

### Prompt

```ts
prompt()
```

会把 `generation.prompt` 写入供应商请求的 `prompt` 字段。

### 普通参数

```ts
parameter(systemKey, vendorKey, fallback, serialize)
```

例如：

```ts
parameter("durationSeconds", "duration", 5, "string")
```

表示：

- 系统字段：`durationSeconds`
- RunningHub 字段：`duration`
- 未提供时使用：`5`
- 提交前转换成字符串：`"5"`

`serialize` 目前只支持：

- `identity`：保留 JSON 类型，默认行为。
- `string`：非空值调用 `String(value)`。

如果空值不应该出现在请求中，可以直接声明字段：

```ts
{
  source: "parameter",
  key: "seed",
  vendorKey: "seed",
  fallback: null,
  omitWhenEmpty: true,
}
```

### 素材

```ts
asset(systemSlot, vendorKey, serialize)
```

- `first`：取该 slot 排序后的第一个素材 URL；没有素材时为 `null`。
- `list`：生成按素材顺序排列的 URL 数组；没有素材时为空数组。

### 安全约束

请求构造器只会发送 `protocol.fields` 明确声明的字段。用户提交的未知参数不会透传给 RunningHub。

不得在 Catalog 中保存：

- 完整绝对 URL
- API Key 或 Authorization header
- 用户凭据
- 任意可执行代码
- 无限制透传的请求对象

endpoint 必须是 `/openapi/v2/` 下的相对路径。

## 9. Input Schema 规则

常用字段构造器：

```ts
selectField(key, label, values, defaultValue)
optionalSelectField(key, label, values, defaultValue?)
durationField(min, max, defaultValue)
textField(key, label, maxLength)
urlField(key, label)
booleanField(key, label, defaultValue)
multiSelectField(key, label, options)
seedField()
optionalSeedField()
numberField(key, label, defaultValue, min, max)
mediaSlot(key, label, mediaType, maxFiles, maxBytes, acceptedTypes, required?)
```

需要遵守：

- Schema 的默认值必须和 `parameter()` fallback 一致。
- select 默认值必须存在于 options 中。
- 每个 Schema parameter key 必须唯一。
- 每个 asset slot key 必须唯一。
- protocol 引用的 parameter 和 asset 必须在 Schema 中存在。
- 每个供应商 `vendorKey` 必须唯一，避免请求字段互相覆盖。
- 文件数量、大小和 MIME 类型必须按 API 文档收紧，不能使用无依据的宽松上限。
- API 至少需要一个素材但不限制具体 slot 时，使用 `at-least-one-asset` constraint。
- 互斥参数使用 `mutually-exclusive-parameters` constraint。

## 10. 默认模型和默认参数

不要随意添加：

```ts
catalogDefault: true
```

每种 capability 只能有一个 Catalog 默认模型。普通新模型应省略它。只有明确替换某能力的默认模型时，才从旧模型移除并添加到新模型。

默认情况下，所有带 `defaultValue` 的参数都会进入 route defaults。如果某些默认值只用于表单展示，不应自动写入任务参数，可以指定：

```ts
defaultParameterKeys: ["resolution", "outputFormat"]
```

## 11. revision 和兼容性

`routeMeta()` 当前为全新 route 提供默认 revision。新增 route 通常不需要显式填写 revision。

已经发布的 route 如果修改以下内容，必须递增 revision：

- endpoint
- 请求字段映射或序列化方式
- Input Schema、默认值或约束
- capability 或其他系统契约

例如：

```ts
route: routeMeta({
  // 其他字段
  revision: 9,
})
```

不要仅因为修改文案、标签或排版机械地提升 revision，除非需要把更新同步到已经持久化的 route。

应用启动时，route seeding 会：

- 插入全新 route。
- 仅在 Catalog revision 更高时更新已有 route。
- 保留用户已经选择的 `enabled` 和 `isDefault` 状态。

新任务会冻结当前 `executionConfig`。因此以后修改 Catalog 不会改变已经创建的任务及其重试行为。

## 12. 必须补充的测试

### 12.1 Catalog 注册测试

在 `runninghub-catalog.test.ts` 中验证：

```ts
const route = createRunningHubRoutes().find(
  (item) => item.providerOperation === "example-video-1-text-to-video",
);

expect(route).toMatchObject({
  id: "runninghub-example-video-1-text-to-video",
  capability: "text-to-video",
  product: "Example Video 1.0",
});
```

同时更新 Catalog 和 route 数量断言。不要照抄文档中的历史数量，应以新增后的实际条目数为准。

### 12.2 请求映射测试

至少验证一次完整请求体：

```ts
const config = resolveRunningHubExecutionConfig(
  "example-video-1-text-to-video",
  {},
);

expect(buildRunningHubRequest(config, {
  prompt: "一辆汽车在雨夜行驶",
  parameters: {
    resolution: "1080P",
    durationSeconds: 10,
    aspectRatio: "16:9",
    unknownVendorField: "must-not-leak",
  },
}, [])).toEqual({
  prompt: "一辆汽车在雨夜行驶",
  resolution: "1080P",
  duration: "10",
  ratio: "16:9",
  audio: false,
  seed: null,
});
```

测试应覆盖：

- 系统字段到供应商字段的重命名。
- fallback 默认值。
- 数字转字符串等序列化规则。
- 单素材或多素材 URL 映射。
- 未知字段不会泄漏。

### 12.3 Route 列表测试

更新 `runninghub-routes.test.ts` 中的：

- route 总数。
- product 分组列表；仅在增加新产品时更新。
- 新模型的特殊 Schema 和 defaults 断言。

更新 `content-generation-center.test.ts` 中的完整 route ID 列表，确保 UI 能稳定识别新的模型顺序。

### 12.4 Adapter 集成测试

如果新 API 有容易出错的 endpoint、请求字段或素材组合，在 `runninghub-adapter.test.ts` 增加 fetch mock，验证：

- 最终提交 URL。
- Authorization 没有进入快照或日志。
- 最终 JSON 请求体。
- 提交响应能够转换成系统任务状态。

## 13. 本地验证和发布

开发期间先运行最小测试：

```powershell
npx vitest run `
  src/server/infrastructure/content-generation/runninghub/runninghub-catalog.test.ts `
  src/server/infrastructure/content-generation/runninghub/runninghub-routes.test.ts `
  src/server/infrastructure/content-generation/runninghub/runninghub-adapter.test.ts `
  src/features/content-generation/content-generation-center.test.ts
```

交付前必须运行：

```powershell
npm run check
npm run build
```

重新启动应用后，新 route 会自动 seed 到数据库。全新 route 默认处于禁用状态，需要在内容生成设置中启用。不要通过手工修改数据库绕过 seeding。

## 14. 何时需要扩展 Adapter

出现以下情况时，Catalog 本身不够：

- 鉴权方式不是现有 Bearer API Key。
- 上传接口、上传格式或上传响应不同。
- endpoint 不属于现有受信任的 `/openapi/v2/` 范围。
- 请求体包含当前有限映射无法表达的深层嵌套结构。
- 一个字段需要复杂计算，或多个系统字段需要合并成一个供应商字段。
- 提交不是标准异步任务。
- 提交响应无法由现有 `normalizeResponse()` 识别。
- 查询接口不是 `/openapi/v2/query`，或不接受 `{ taskId }`。
- 状态、错误或输出结构完全不同。
- 需要特殊签名、multipart 提交、SSE 或流式响应。

正确处理方式：

1. 明确新的协议边界，例如 `runninghub-special-v1`。
2. 为新协议增加独立的配置解析和 request builder。
3. 在 Adapter 的协议分派位置实现特殊提交或查询行为。
4. 为新协议添加完整测试。
5. 保持 `runninghub-standard-v1` 无供应商特例。

不要采用以下做法：

```ts
if (operation === "某个模型") {
  // 在通用 Adapter 中临时拼特殊请求
}
```

只有当模型真正属于不同协议时才增加抽象；单纯字段名不同应继续由 Catalog 映射解决。

## 15. 接入完成检查清单

- [ ] operation 和 route ID 唯一、稳定、命名符合规则。
- [ ] endpoint 是受信任的 `/openapi/v2/` 相对路径。
- [ ] capability 与实际输入类型一致。
- [ ] Prompt 必填性和最大长度与 API 文档一致。
- [ ] 参数类型、枚举值、默认值和范围与 API 文档一致。
- [ ] Schema 默认值与 protocol fallback 一致。
- [ ] 所有 protocol parameter 都在 Schema 中声明。
- [ ] 所有 protocol asset 都有对应 asset slot。
- [ ] 单素材使用 `first`，多素材使用 `list`。
- [ ] MIME 类型、文件数量和大小限制已经收紧。
- [ ] 没有 API Key、绝对 URL或任意字段透传。
- [ ] 没有重复设置某个 capability 的 `catalogDefault`。
- [ ] 修改已有契约时提升了 revision。
- [ ] Catalog 数量和 route ID 列表测试已同步。
- [ ] 最终请求体测试覆盖重命名、fallback 和序列化。
- [ ] 新 route 启动后可见，并能在设置中启用。
- [ ] `npm run check` 通过。
- [ ] `npm run build` 通过。

## 16. 相关实现

- Catalog：`src/server/infrastructure/content-generation/runninghub/runninghub-catalog.ts`
- 请求构造器：`src/server/infrastructure/content-generation/runninghub/runninghub-request-builder.ts`
- Adapter：`src/server/infrastructure/content-generation/runninghub/runninghub-adapter.ts`
- Provider Module：`src/server/infrastructure/content-generation/runninghub/runninghub-provider-module.ts`
- Route seeding：`src/server/application/content-generation/seed-generation-routes.ts`
- 总体设计：`docs/designs/content-generation-provider-catalog-design.md`
