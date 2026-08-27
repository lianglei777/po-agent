# 千问 AI 平台图像与视频 API 资料索引

> 状态：已完成首轮人工归一化  
> 校对日期：2026-08-27  
> 用途：保存千问 AI 平台原始 API 参考快照，并为 Po Agent 的受信 TypeScript Catalog 提供人工对照依据

本目录是供应商资料，不是生产运行时配置。Po Agent 不会在运行时解析这里的 Markdown，也不会根据文档自动创建或启用付费 Route。正式执行语义必须经过人工评审后写入 `src/server/infrastructure/content-generation/qianwen/` 下的受信 Catalog。

## 1. 文档清单

| 分类 | 文档 | 主要模型 | 创建方式 | 查询方式 |
| --- | --- | --- | --- | --- |
| 文件上传 | [临时文件上传](./upload-file.md) | 调用时指定目标模型 | `GET /uploads?action=getPolicy&model=...` 后 multipart 上传 | 不适用 |
| 图像生成 | [Z-Image](./image-generation/Z-Image.md) | `z-image-turbo` | 同步 POST | 不轮询 |
| 图像生成 | [Wan V2](<./image-generation/Wan V2.md>) | `wan2.6-t2i` 及旧版 Wan 文生图 | 异步 POST | `GET /tasks/{task_id}` |
| 文生视频 | [Wan 2.7](<./video-generation/text-to-video/Wan 2.7.md>) | `wan2.7-t2v` | 异步 POST | `GET /tasks/{task_id}` |
| 文生视频 | [HappyHorse](./video-generation/text-to-video/HappyHorse.md) | `happyhorse-1.1-t2v`、`happyhorse-1.0-t2v` | 异步 POST | `GET /tasks/{task_id}` |
| 图生视频 | [Wan 2.7](<./video-generation/image-to-video/Wan 2.7.md>) | `wan2.7-i2v` | 异步 POST | `GET /tasks/{task_id}` |
| 图生视频 | [HappyHorse](./video-generation/image-to-video/HappyHorse.md) | `happyhorse-1.1-i2v`、`happyhorse-1.0-i2v` | 异步 POST | `GET /tasks/{task_id}` |
| 参考生视频 | [Wan 2.7](<./video-generation/reference-to-video/Wan 2.7.md>) | `wan2.7-r2v` | 异步 POST | `GET /tasks/{task_id}` |
| 参考生视频 | [Wan 3.0](<./video-generation/reference-to-video/Wan 3.0.md>) | `wan3.0-video`、`wan3.0-video-prime` | 异步 POST | `GET /tasks/{task_id}` |
| 参考生视频 | [MiniMax-H3](./video-generation/reference-to-video/MiniMax-H3.md) | `MiniMax/MiniMax-H3` | 异步 POST | `GET /tasks/{task_id}` |
| 参考生视频 | [HappyHorse](./video-generation/reference-to-video/HappyHorse.md) | `happyhorse-1.1-r2v`、`happyhorse-1.0-r2v` | 异步 POST | `GET /tasks/{task_id}` |

## 2. 规范化协议矩阵

文档中的模型数量较多，但底层协议差异可以收敛为有限 Profile。Profile 名称是 Po Agent 内部设计名称，不是千问公开 API 字段。

| Profile | 适用模型 | Submit | 请求形状 | 成功输出 | 轮询建议 |
| --- | --- | --- | --- | --- | --- |
| `sync-messages-image-v1` | Z-Image | 同步 | `model + input.messages + parameters` | `output.choices[].message.content[].image` | 无 |
| `async-messages-image-v1` | Wan 2.6 文生图 | 异步 | `model + input.messages + parameters` | `output.choices[].message.content[].image` | 约 5 秒 |
| `async-legacy-image-v1` | Wan 2.5、2.2、2.1、WanX 旧版文生图 | 异步 | `model + input.prompt + parameters` | `output.results[].url` | 约 5 秒 |
| `async-video-v1` | Wan 2.7、Wan 3.0、MiniMax-H3、HappyHorse | 异步 | `model + input.prompt/media/audio_url + parameters` 的受限变体 | `output.video_url` | 约 15 秒 |

所有异步任务共享以下基础协议：

- API Origin 固定为 `https://dashscope.aliyuncs.com/api/v1`；
- 使用 Bearer API Key；
- 提交时设置 `X-DashScope-Async: enable`；
- 查询使用 `GET /tasks/{task_id}`；
- 状态归一化范围为 `PENDING`、`RUNNING`、`SUCCEEDED`、`FAILED`、`CANCELED`、`UNKNOWN`；
- 成功结果 URL 通常只保留 24 小时，Po Agent 必须及时下载为本地产物。

## 3. 临时素材协议

本地图片、视频或音频不能直接进入 DashScope JSON 请求。Po Agent 需要在 Provider 的 `prepareAssets()` 阶段完成：

1. 使用与任务相同的目标模型请求上传 Policy；
2. 验证返回的 `upload_host` 是受信 HTTPS OSS Host；
3. 按 Policy 构造 multipart 表单，且把 `file` 放在最后；
4. 上传后生成 `oss://` 引用；
5. 把引用和 `expiresAt` 作为不透明 prepared asset 保存；
6. 提交包含 `oss://` 的请求时添加 `X-DashScope-OssResourceResolve: enable`。

上传 Policy 一般约 300 秒失效，生成的临时文件引用约 48 小时失效。Policy、Signature、AccessKey 和上传表单不能进入任务快照、日志或数据库。文件上传与模型调用必须使用同一千问账号下的 API Key。

## 4. Catalog 建模规则

- `providerId` 固定为 `qianwen`，供应商协议在内部使用 `dashscope` 命名。
- `providerOperation` 表示 Po Agent 稳定执行语义，不能直接等同于供应商模型 ID。
- 有固定快照版本时优先登记快照，例如 `wan2.7-t2v-2026-06-12`；滚动别名只能作为明确选择，不能静默替换已发布 Route。
- 一个 All-in-One 模型按 Po Agent capability 拆成多条 Route，例如 Wan 3.0 分为文生视频、图生视频和多模态生视频。
- Catalog 只能选择仓库内受信 Endpoint ID、请求 Profile、结果 Profile和素材绑定规则，不能声明任意 Origin、Header、JSONPath 或可执行表达式。
- 所有新 Route 默认关闭，且首批千问 Route 不设置 `catalogDefault`，避免覆盖用户已有的 RunningHub 默认 Route。
- 原始文档出现变化时，应提升受影响 Route 的 revision；已创建 Job 继续使用其冻结的 execution config。

## 5. 当前资料覆盖边界

当前快照足以设计和实现：

- Z-Image 文生图；
- Wan 2.6 与旧版 Wan 文生图；
- Wan 2.7 文生视频、图生视频、参考生视频；
- Wan 3.0 的文本、首帧/首尾帧和多模态参考视频能力；
- MiniMax-H3 的文本、首帧/尾帧和多模态视频能力；
- HappyHorse 文生视频、图生视频和参考生视频。

当前快照没有覆盖千问 Image 2.x/3.x、Wan 2.7 Image 等更新的图像模型。它们不能仅凭公开模型列表加入生产 Catalog，必须先补充相应创建和查询 API 参考。

## 6. 更新检查清单

每次补充或更新文档时检查：

- [ ] 文件所在目录与能力一致；
- [ ] 标题、model 枚举、operationId 和 Schema 名称一致；
- [ ] 同时包含异步任务的创建与查询结构；
- [ ] 没有与其他文件完全重复的正文；
- [ ] Endpoint、Header、必填字段、默认值、枚举和范围完整；
- [ ] 素材数量、格式、大小、时长和宽高比限制完整；
- [ ] 输出字段、任务状态、轮询建议和 URL 有效期完整；
- [ ] 新能力已经同步到本索引和正式设计文档；
- [ ] 文档只作为评审来源，不直接驱动生产执行。

## 7. 实施设计

项目集成方案、分层职责、Catalog 结构和分阶段验收标准见 [千问内容生成 Provider 集成设计](../designs/qianwen-content-generation-provider-design.md)。
