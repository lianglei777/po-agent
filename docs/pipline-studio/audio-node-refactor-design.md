# Pipeline Studio 音频节点重构设计

## 状态

- 文档状态：已确认实施 V1
- 实施范围：Audio Clip Node 基础资产能力
- 暂不包含：AI 音频生成、录音、转写、裁剪、混音和时间线

## 背景

当前音频节点仍由通用画布节点渲染，只提供浏览器原生播放器。它能够承载上传文件，也能作为视频生成的参考素材，但缺少独立节点应有的上传替换、加载反馈、错误恢复、元数据、波形、下载和一致的画布交互。

现有生成能力没有音频输出 Route，工作流也明确排除音频生成节点。因此，V1 不提供没有真实 Provider 支撑的“AI 生成音频”入口。

## 设计结论

音频能力分为三个层次：

1. **Audio Clip Node**：承载一个稳定音频资产，负责预览、元数据、替换、下载和下游引用。
2. **Audio Generation Capability**：后续按任务意图区分文本转语音、音效、音乐和语音转换，统一产出 Audio Artifact。
3. **Audio Mix Node**：后续负责多轨、裁剪、音量、淡入淡出和导出，不修改源 Audio Clip。

节点类型表示产物，不表示生成方式。上传、TTS、音效生成或语音转换的结果都可以成为 Audio Clip Node 当前选中的音频资产。

## 行业参考

- LibTV 的社区资料将语音旁白和纯音乐生成分开，说明音频入口应先表达生成意图，而不是只暴露模型选择。该资料并非官方合同，仅作为交互参考。
- Runway 将 Generate Speech、Sound Effects 和 Speech-to-Speech 分为不同工具。
- ElevenLabs 将 TTS、Voice Changer 和 Sound Effects 分为不同能力，并为音效提供时长、循环等专用参数。
- Adobe Firefly 将音效生成结果作为可选择的变体加入时间线，而不是让素材节点承担混音职责。
- ComfyUI 的音频数据包含 waveform 和 sample rate，并将加载、录制和处理拆为不同节点。

参考资料：

- <https://github.com/wanmeishaonian/LibTV-CLI-Manual>
- <https://help.runwayml.com/hc/en-us/articles/23859696734611-Generate-Speech>
- <https://elevenlabs.io/docs/overview/capabilities/sound-effects>
- <https://helpx.adobe.com/firefly/web/firefly-video-editor/generate-audio/generate-sound-effects.html>
- <https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_audio.py>

## 产品模型

### Audio Clip Node 的职责

- 接收本地音频上传。
- 播放当前音频。
- 显示波形和基础元数据。
- 替换或下载当前音频。
- 作为下游视频或未来音频处理节点的输入。
- 保留节点名称、位置、尺寸和连线关系。

### 不属于 Audio Clip Node 的职责

- 多轨混音。
- 非破坏性裁剪和时间线编辑。
- 声音克隆授权流程。
- 转写文本编辑。
- Provider 模型和计费参数管理。

这些能力应通过生成 Composer、转换操作或独立 Audio Mix Node 实现。

## V1 交互设计

### 空节点

- 显示音频图标、明确的“选择音频”操作和拖放提示。
- 支持拖入音频文件。
- 有上游连接时禁用本地上传，并说明需要先断开连接。

### 已加载节点

- 标题区显示节点名称、时长和格式。
- 主体显示有界采样波形、文件名、采样率和声道信息。
- 保留浏览器原生音频控制条，以获得稳定的键盘、音量和进度操作。
- 选中节点时提供替换、下载、复制和删除操作。

### 状态

- 上传中：覆盖节点主体，阻止重复上传。
- 波形分析中：显示轻量分析状态，不阻塞播放。
- 波形分析失败：保留播放器，只降级为不可用波形。
- 媒体加载失败：显示明确错误，可重新加载或替换文件。
- 工作流锁定：禁止删除，说明具体原因。

## 数据合同

V1 在 `CanvasNodeData` 增加：

```ts
interface CanvasAudioMetadata {
  durationSeconds: number;
  format?: string;
  sampleRateHz?: number;
  channelCount?: number;
}
```

约束：

- `durationSeconds` 为有限非负数，最大 24 小时。
- `sampleRateHz` 限制在合理音频采样率范围。
- `channelCount` 限制在合理声道范围。
- `format` 保存规范化显示值，不保存文件路径或凭据。
- 波形峰值不进入画布 JSON，避免节点数据膨胀。

V1 与现有视频节点一致，在客户端读取媒体后写入元数据。后续若引入服务端媒体探测器，应通过 `MediaMetadataPort` 统一迁移音频和视频元数据来源。

## 波形策略

- 浏览器只在音频节点成为唯一选中节点时，按当前媒体 URL 读取音频并使用 Web Audio 解码。
- 选择切换会取消尚未完成的读取；已经完成的波形在节点挂载期间复用。
- 将每个声道分桶采样为固定数量的峰值条。
- 每个桶限制采样步数，避免长音频在主线程执行无界遍历。
- 归一化结果只保存在组件状态中。
- 解码失败不代表媒体播放失败；播放器仍可正常使用。
- 媒体身份变化或用户主动重试时重新分析。

V1 不增加第三方波形或音频解码依赖。

## 上传与文件约束

- 复用 `POST /api/pipeline/projects/{projectId}/canvas/upload`。
- 音频上传单独限制为 10 MiB，并继续复用既有 workspace 路径隔离。
- 前端在发送请求前校验大小，application 在写入资产前再次校验。
- 前端只接受 `audio/*`，服务端继续通过 MIME 和扩展名识别类型。
- 支持现有识别范围：MP3、WAV、M4A、AAC、FLAC、OGG、OPUS。
- 目标节点存在上游连接时拒绝本地替换，避免隐式双主输入。

## 架构落点

### Contracts

- 新增 `CanvasAudioMetadata`。
- `CanvasNodeData.audioMetadata` 仅允许出现在音频节点。

### Transport

- 对客户端持久化的音频元数据做边界校验。
- 不信任浏览器提交的无界数值和字符串。

### Feature

- 新增独立 `AudioCanvasNode`。
- 新增纯函数模块处理波形分桶、格式和元数据展示，便于单元测试。
- `StudioCanvasNode` 只负责按媒体类型分发节点组件。

### Application / Infrastructure

V1 不新增 Provider、Port 或专用 API。上传、媒体读取、画布持久化和下游引用继续复用现有实现。

## 后续版本

### V2：音频生成

优先增加：

- `text-to-speech`
- `text-to-sound-effect`

只有真实 Provider Route、凭据、计费确认和 Artifact 输出全部接通后，Audio Clip Node 才展示对应生成入口。生成继续复用标准 Generation Run、取消、重试、历史和选择机制。

### V3：高级音频能力

- `text-to-music`
- `speech-to-speech`
- 录音
- 视频提取音频
- 音频转文字，输出 Text Node
- 声音克隆的授权和同意记录

### V4：Audio Mix Node

- 多轨编排
- 裁剪和循环
- 音量、淡入淡出
- 与视频时长对齐
- 混音导出

## V1 验收标准

- 音频使用独立节点组件，不再落入通用媒体占位分支。
- 空节点可以选择或拖放音频；有上游连接时给出具体禁用原因。
- 上传、替换、下载、复制和删除行为与图片、视频节点一致。
- 播放器支持浏览器原生键盘和无障碍能力，不自动播放。
- 显示真实时长、格式、采样率、声道和有界采样波形。
- 波形失败不会阻断播放。
- 未选中的多个音频节点不会并发解码波形。
- 媒体失败有错误状态和重试入口。
- 元数据通过画布 mutation 持久化，并通过 transport 校验。
- 音频继续能够作为兼容视频 Route 的参考输入。
- 中英文文案同步。
- 聚焦测试、`npm run check` 通过。
- 按当前任务约束，不进行浏览器 UI 测试。
