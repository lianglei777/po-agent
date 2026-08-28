# 千问内容生成运行与故障排查

本文用于排查 Po Agent 中千问AI平台图像、视频生成任务。千问 Route 默认关闭；启用 Provider、保存凭据和启用具体 Route 后，新任务才会调用付费 API。

## 运行策略

- Worker 在当前单进程部署中对千问最多同时推进 2 个 Job；RunningHub 使用独立的并发额度。
- 正常图片任务约每 5 秒查询一次，视频任务约每 15 秒查询一次。
- 素材准备、查询或下载遇到网络错误、HTTP 429 或 5xx 时，从 5 秒开始指数退避，上限 5 分钟。素材准备重试可能重新上传已成功的临时对象，但不会重复提交付费生成任务。
- 供应商返回 `Retry-After` 时，Worker 至少等待该时长；等待值仍限制在 5 分钟以内。
- 连续 8 次可恢复错误后任务失败，避免永久占用队列。成功查询会清零连续错误计数。
- 明确收到 HTTP 拒绝时按供应商失败结束并保留错误码；只有网络中断、超时等无法确认提交结果的情况才停止自动重提，以免产生重复付费任务。

Run 响应中的 `jobs[]` 可直接用于诊断：

| 字段 | 含义 |
| --- | --- |
| `status` | 当前准备、提交、查询或下载阶段 |
| `nextPollAt` | 下一次允许推进的时间 |
| `transientFailureCount` | 当前连续可恢复错误次数 |
| `lastErrorCode` / `lastErrorMessage` | 最近一次错误；不包含凭据 |
| `remoteTaskId` / `remoteStatus` | 千问任务 ID 与规范化状态 |

## 常见问题

### `GENERATION_PROVIDER_RATE_LIMITED`

素材准备、查询或下载收到 HTTP 429 时，Worker 会遵守 `Retry-After` 并自动退避。付费任务提交收到明确的 HTTP 429 时不会自动重提，Run 会保留限流错误，需由用户稍后显式重试。若频繁发生，应减少同时启用的批量工作流；临时上传 Policy 还受账号和模型维度的 100 QPS 限制，不适合作为高并发生产素材存储。

### `GENERATION_SUBMISSION_UNKNOWN`

请求可能已经到达供应商，但 Po Agent 没有收到确定响应。系统故意停止自动重提。明确收到的 HTTP 4xx、429 或供应商业务错误不会进入此状态。遇到本错误时，先在千问平台确认是否已经创建任务，再由用户决定是否显式重试。

### `GENERATION_PROVIDER_PROTOCOL_ERROR`

响应缺少任务 ID、成功输出或出现未支持的任务状态。保留 Run 中已脱敏的 `responseSnapshot`，并对照 `docs/QwenApis/` 的当前资料；不要把未知状态改成无限轮询。

### 上传或下载失败

确认输入文件符合 Route 的类型和大小限制。下载只允许 HTTPS 阿里云 OSS 服务域名并禁止重定向；响应会按真实流式字节执行 500 MiB 上限，并在落盘前核对图片或视频 `Content-Type`。签名参数只用于即时下载，审计快照中会被脱敏。

## 显式付费 Smoke

常规 `npm run check` 只运行 mock 测试，不访问千问。需要手动验证时，在 PowerShell 中显式设置开关和凭据：

```powershell
$env:QIANWEN_PAID_SMOKE = "1"
$env:DASHSCOPE_API_KEY = "你的 API Key"
npm run test:qianwen-smoke
Remove-Item Env:QIANWEN_PAID_SMOKE
Remove-Item Env:DASHSCOPE_API_KEY
```

该 Smoke 会实际调用一次 Z-Image 并下载结果，可能产生费用。测试不会输出 API Key 或签名 URL。
