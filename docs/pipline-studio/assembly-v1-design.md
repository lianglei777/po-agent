# Pipeline Studio 成片合成 V1 设计方案（待评审）

更新时间：2026-09-28

## 1. 目标与现状

目标：用户完成镜头视频后，在 Pipeline Studio 内选择各镜头的最终版本，检查顺序与缺失，明确点击“合成”，得到可预览、定位和下载的 MP4。短视频是一条成片；短剧先按集分别合成。合成失败后可以重试，已经生成的镜头视频不再付费重生成。

现有画布提供 Shot Creative Spec、`videoSelection`、Generation Run/Artifact、输入过期信息、Workflow Run 和项目目录中的 `exports/`。`assembly` 阶段目前仍显示 `coming soon`。现有 FFmpeg 适配器只负责视频采样和音频分析，不承担合成。因此需要独立的合成用例、持久化 Run 和 FFmpeg 端口。

本设计只增加本地合成，不改变用户只面对一个 Pipeline Chat、四个内部 Specialist 准备画布、用户手动启动付费媒体生成的约定。合成使用已有本地视频文件，不调用付费生成模型。

## 2. 用户看到的流程

1. 在“成片”视图选择一集，或选择一个短视频项目的全部目标镜头。
2. 系统按 Shot Spec 的 `episodeKey`、`order` 排列镜头，并默认引用每个视频节点当前选定的 take。用户可以更换 take、调整本次成片顺序、排除镜头；这些选择只影响合成方案，不改动 Shot Spec 或画布连线。
3. 预检逐镜头显示：选定视频是否已成功且可在本地读取、输入是否过期、时长和画幅是否可处理。缺失镜头阻止合成；过期镜头明确提示，默认阻止，用户重新选择可靠 take 后再运行。预检同时估算输出时长、尺寸和本地磁盘需求。
4. 用户点击“合成 MP4”。界面显示准备、转码、拼接、封装、完成或失败，以及当前镜头和可操作的失败原因。
5. 完成后可在应用中预览、定位文件、下载或重新合成。历史版本保留，用户可把某个完成版本标为当前成片。

单个 Shot Spec 可能连接多个视频生成节点，因此合成输入必须由用户确认的 **Shot → 视频节点 → Artifact** 三元组确定；不能仅凭节点名称、最新 Run 或 URL 猜测最终 take。V1 只允许每个镜头选择一个视频片段。

## 3. 范围

### V1 必做

- 单集或短视频的有序镜头合成；镜头选择、排除和顺序调整。
- 对不同编码、分辨率、帧率和有无音轨的视频统一转码后拼接，输出 H.264/AAC MP4；统一目标画幅由该次合成方案指定，默认沿用项目/首个镜头的已确认画幅，禁止静默裁掉主体。
- 原片音频保留；无音轨片段补静音，保证拼接时间轴稳定。可选一条已经存在的本地背景音乐，设置音量并按成片长度裁切；没有配乐时不引入音频生成。
- 持久化方案、运行进度、失败原因、输入快照、输出文件和历史版本；应用重启后能判明运行中任务的状态并安全重试。
- 合成预检及结果的 API 和简洁的“成片”视图。
- 本地无媒体付费调用；合成失败不改变已选 take 和镜头 Generation Run。

### V1 暂不做

- 时间线编辑器、多轨逐帧剪辑、自动转场、自动字幕识别与烧录、自动配音、智能重剪、片头片尾模板、跨集一次性拼接、云端渲染。
- 自动以模型判断“最佳 take”。用户选择仍是成片事实来源。
- 把成片当成普通生成节点放入现有 DAG。成片是有序交付物，生命周期与供应商媒体生成不同。

## 4. 数据与一致性

在项目 SQLite 中增加：

| 对象 | 关键字段 | 作用 |
| --- | --- | --- |
| `AssemblyPlan` | `id`, `projectId`, `episodeKey`, `revision`, `settings`, `shots[]`, `createdAt`, `updatedAt` | 可编辑的镜头选择和输出设置 |
| `AssemblyShot` | `shotNodeId`, `videoNodeId`, `generationRunId`, `artifactId`, `order`, `included` | 明确选片及排序 |
| `AssemblyRun` | `id`, `planId`, `planRevision`, `status`, `inputSnapshot`, `progress`, `errorCode`, `outputId`, timestamps | 每次点击合成的不可变运行记录 |
| `AssemblyOutput` | `id`, `runId`, `relativePath`, `mimeType`, `durationSeconds`, `width`, `height`, `bytes`, `fingerprint`, `selected` | 本地 MP4 与历史版本 |

`inputSnapshot` 冻结每个选中 Artifact 的 ID、本地相对路径、文件指纹、镜头顺序、画幅、帧率、音频设置和输出编码参数。运行中修改 Plan 不改变该 Run；再次合成生成新 Run。项目根目录下的 `exports/assembly/<episodeKey>/<runId>.mp4` 保存成片，数据库只保存受控相对路径。文件读取必须再次检查项目根目录边界，不能接受客户端传入的绝对路径。

成片的 `stale` 状态由当前 Plan/所选 Artifact 指纹与上次成功 Run 快照比较得出。镜头内容或 take 改变后，旧 MP4 仍可预览和下载，但标记为“基于旧选择”；不会静默覆盖或删除。

## 5. 应用与执行边界

依赖方向遵守 `domain <- ports <- application <- transport`：

- `domain`：Plan、Run、Output、状态和稳定错误码。
- `ports`：扩展 `PipelineRepository` 保存合成对象；新增 `AssemblyRenderer` 接口，输入为已验证的本地文件及参数，输出临时 MP4 与媒体元数据。
- `application`：`AssemblyService` 负责预检、冻结快照、幂等启动、取消/重试、选定当前成片和下载授权；独立 Worker/调度器推进持久化 Run。
- `infrastructure`：SQLite 实现持久化；FFmpeg/ffprobe 实现 `AssemblyRenderer`。通过参数数组启动进程，不拼接 shell 字符串；限制并发、执行时间、输入数量和输出大小。临时文件位于项目受控目录，成功后原子移动到 `exports/assembly`，失败时清理临时文件。
- `transport`/Route Handler：只验证 HTTP 输入、委托用例、映射错误与媒体流；不在 Route Handler 中执行 FFmpeg。

Run 状态建议为 `queued -> validating -> rendering -> finalizing -> completed`，以及 `failed`、`cancelled`。进度由已完成片段和 FFmpeg 编码进度合成；不伪造精确百分比。重启时，若发现旧进程留下的 `rendering` Run 且没有有效完成文件，将其转为可重试失败，并保留输入快照；重试复用本地镜头 Artifact，只创建新的 Assembly Run。输出写入和完成状态更新需有幂等检查，避免重复成片记录。

在创建 Run 前预检所有输入；在 FFmpeg 启动前再次核对文件指纹，防止预检后素材变化。音视频规范化先产出受控中间片段，再按固定顺序拼接；任何片段失败时记录 `shotNodeId` 和可读原因。成片成功后用 ffprobe 验证视频流、总时长和尺寸，再登记输出。

## 6. 画布和 Agent 的关系

“成片”视图读取 Shot Spec、节点选定 take 和 Assembly Plan，画布仍是镜头与媒体生产配置的事实来源。用户可从成片列表定位到原 Shot 和视频节点。阶段状态 `assembly` 从真实 Plan/Run/Output 计算，不再返回固定的 `coming soon`。

Pipeline Agent 可以读取合成准备状态、指出缺失或过期镜头，必要时建议回到相应节点重做。V1 不提供 Agent 自动启动合成工具；用户点击“合成 MP4”后才运行本地 FFmpeg。未来若要允许 Chat 启动，也应走同一个 `AssemblyService` 和显式授权边界。

## 7. 实施顺序与验收

1. **领域与持久化**：Plan/Run/Output、SQLite 迁移、项目根目录约束和状态恢复。
2. **本地渲染**：`AssemblyRenderer`、ffprobe 预检、归一化、拼接、原子输出、取消与清理。先用本地测试片段验证不同编码、尺寸、帧率和无音轨场景。
3. **应用与 API**：保存方案、预检、启动、查询、取消/重试、选定历史成片、预览与下载；同步 `docs/agent-api-reference.md`。
4. **UI**：按集镜头列表、选 take、排序/排除、预检原因、运行状态、成片历史和定位入口；浏览器验证关键交互。
5. **真实闭环验收**：在隔离项目从脚本经四个 Specialist 到画布，手动启动真实媒体生成并选择镜头 take，再合成一条可播放 MP4。核对视频时长、画幅、声音、镜头顺序、文件下载、重启恢复和单镜头重跑后的成片过期提示。该验收与现有“仅准备画布”的 20 条 Specialist 评测分开记录。

V1 发布门槛：至少完成一条短视频和一集短剧的真实端到端成片；故意制造一次缺失素材、一次 FFmpeg 失败和一次应用重启，验证可解释的失败与无重复付费恢复；成片可以在应用内预览并从 `exports/` 重新打开。所有自动测试和 `npm run check`/`npm run build` 通过后，再记录人工观看结论。

## 8. 评审时需要决定

1. V1 是否只支持直接剪切拼接，还是同时支持单条背景音乐？本方案建议支持已有本地 BGM，暂不做旁白/对白多轨混音。
2. 过期 take 是否允许用户明确确认后参与合成？本方案建议 V1 阻止，避免成片与当前镜头事实不一致。
3. 默认画幅采用项目设置还是第一条已确认镜头？本方案建议优先项目设置；项目未设置时必须让用户在合成预检中确认，不能静默猜测。
