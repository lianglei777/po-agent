# Pipeline Studio 视频节点设计方案

> 状态：Accepted / implementing
>
> 日期：2026-08-25
>
> 范围：Pipeline Studio 画布中的视频节点，不包含时间线剪辑器和最终成片合成器。

## 1. 需要优先确认的产品决策

本方案建议先确认以下六项，再进入实现：

1. **视频节点同时承担生成器和当前视频结果的载体。** 空节点是待配置生成器；上传或生成完成后，同一个节点展示当前选中的视频结果，但生成配置和历史仍保留。
2. **画布节点不直接铺满原生播放器控件。** 节点主体展示视频 poster/预览帧，整块非控件区域可拖拽；点击独立播放按钮打开完整预览播放器。
3. **再次生成不覆盖历史。** 每次生成创建新的 Generation Run/Take，节点只保存“当前选中结果”的指针。
4. **连线与 `@` 是两种引用入口，但使用同一套资源绑定规则。** 连线引用上游节点，`@` 可引用全画布资源；发送模型前统一编译、排序和去重。
5. **首帧、尾帧和普通参考必须是显式角色。** 不再根据“连接了几张图片”猜测首尾帧语义。
6. **模型参数完全由 Route Schema 驱动。** 分辨率、时长、比例、音频、seed 等不能写死成所有视频模型通用字段。

如果这六项通过，后续实现可以分阶段推进，不需要一次复制 LibTV 的全部视频工具。

## 2. 参考范围与证据边界

### 2.1 LibTV

指定的 [LibTV 画布链接](https://www.liblib.tv/canvas?spaceId=6321515&projectId=eea3312a13704727b91f7c6c84c9f0fe) 在当前未登录浏览器中会重定向到首页，因此本方案不会声称观察到了该私有项目中的全部节点细节。

目前可以确认或从既有材料中得到支持的 LibTV 产品方向：

- 无限画布承载图片、视频、文本、音频等创作资源；
- 节点既可以由用户直接创建，也可以由生成流程产生内容；
- 当前画布元素可以通过资产面板定位和复用；
- AI 输入支持引用画布资源；
- 首页公开展示 Seedance 2.5 音视频生成、导演台和参考视频逐帧分析等能力；
- 本项目已有 LibTV 分析文档也把上传、文生视频、图生视频、首尾帧、多模态参考、结果预览、失败重试和取消生成列为视频节点基础能力。

因此，本方案参考 LibTV 的“创作画布 + 多模态引用 + 节点内生成”方向，但不会逐像素复制其界面。

### 2.2 其他成熟产品

- [Runway Workflows](https://help.runwayml.com/hc/en-us/articles/45769159004691-Building-your-first-Workflows) 将文本、图片生成和图生视频拆成可连接节点；支持单节点运行、依赖感知的并行运行、取消，以及节点执行历史。历史结果可以切换、下载、全屏查看、收藏并设为当前输出。
- [ComfyUI Wan 2.2 官方工作流](https://docs.comfy.org/tutorials/video/wan/wan2_2) 明确区分文生视频、图生视频和首尾帧视频，首帧、尾帧、尺寸、帧数与 Prompt 都是明确输入，而不是靠连接数量猜测。
- [Krea Nodes](https://www.krea.ai/features/nodes) 强调上游输出作为下游输入、整条链路执行、并行模型对比和可复用工作流。
- [Krea Video](https://www.krea.ai/features/ai-video-generator) 把首尾帧、视频续写与合并、原生音频、并行生成和模型对比作为视频创作的独立能力。

这些产品没有完全相同的视觉规范，但形成了共同原则：输入角色明确、运行状态可恢复、结果非破坏性保留、生成参数与模型能力一致。

## 3. 当前项目现状

### 3.1 已具备能力

当前项目已经有可复用的基础：

- `CanvasMediaType` 已包含 `video`；
- 视频节点支持空态、上传、拖放、替换、下载、复制、删除和尺寸调整；
- AI 输入支持文本、图片、视频、音频的连线引用与 `@` 引用；
- `CanvasResourceRole` 已包含 `reference`、`first-frame`、`last-frame`；
- 已支持 `text-to-video`、`image-to-video`、`multimodal-to-video` 三种 capability；
- Route Schema 已能描述 Prompt、参数字段和素材槽位；
- Generation Run、Provider Job 和 Artifact 已持久化；
- Run 已有 queued、running、succeeded、failed、cancelled 等完整状态；
- 素材绑定已经支持 `bindingId` 和 `order`，不必依赖异步上传完成顺序；
- Pipeline SSE 可以把生成状态和结果同步回节点；
- Prompt 草稿已按节点持久化在前端 Store 中。

### 3.2 主要缺口

1. `CanvasEdge` 目前没有引用角色和稳定顺序，连线输入仍缺少完整运行语义。
2. 当前视频结果会回写到同一节点的 `artifactIds/url`，没有清晰的 Take 选择模型。
3. Generation Run 已持久化，但视频节点没有执行历史入口。
4. 节点没有完整展示时长、分辨率、比例、音频与错误状态。
5. 上游内容改变后，引用会更新，但已经生成的下游视频没有“输入已变化/结果已过期”状态。
6. 视频节点组件、AI Composer 和播放交互缺少针对性的组件回归测试。
7. 上传视频与生成视频的来源模型没有统一呈现。

## 4. 产品模型

### 4.1 一个节点，两种内容状态

不再把“资源节点”和“生成器节点”定义成两种视频节点类型。

同一个视频节点可以处于：

- **无当前视频**：空视频节点，用户可以上传或配置生成；
- **有当前视频**：显示上传结果或某个生成 Take，同时仍可修改 Prompt 再次生成。

节点身份不会因为生成完成而改变。变化的是当前输出和运行状态。

### 4.2 节点中的三类数据

视频节点需要区分：

1. **输入定义**：Prompt、连线引用、`@` 引用、Route、参数；
2. **运行记录**：每次 Generation Run 的输入快照、状态、错误和输出；
3. **当前输出**：画布与下游节点当前实际读取的一个视频 Artifact 或上传文件。

三者不能继续混成一个 `url[] + params + taskInfo` 的临时状态。

## 5. 节点视觉与交互

### 5.1 静止态结构

```text
视频图标  节点名称                         上传（仅空节点且无入边）
┌────────────────────────────────────────────────────┐
│                                                    │
│                 poster / 当前帧                    │
│                                                    │
│                        [播放]                      │
│                                                    │
│  00:08   1280×720   有声                    2 / 4  │
└────────────────────────────────────────────────────┘
                         ○ 输出
输入 ○
```

设计要求：

- 默认尺寸继续使用当前 `320 × 220` 附近的画布尺寸，最小 `260 × 180`；
- poster 使用 `object-contain`，不裁切视频内容；
- 黑色仅属于视频画面区域，不把整张节点做成纯黑卡片；
- 元数据位于节点标题行右侧，与图片节点的尺寸信息保持一致，只展示准确数据；
- 没有可靠数据时不展示占位时长、分辨率或“有声”；
- 多 Take 时显示 `当前序号 / 总数`，单 Take 不展示计数；
- 节点控制、边框和工具栏使用现有 `--pl-*` token。

### 5.2 选择与拖拽

- 在节点任意非交互区域按下并移动即可拖拽；不要求寻找标题栏；
- 单击且未达到拖拽阈值时只选择节点；
- 框选只改变 selection，不打开 AI 输入框；
- 播放按钮、连接点、Resize handle、工具栏、Take 切换和重命名输入框使用 `nodrag`；
- 工具栏和 AI Composer 保持屏幕像素尺寸，不跟随画布缩放；
- 多选时隐藏单节点工具栏和 AI Composer。

### 5.3 播放

画布节点直接使用原生 `<video controls>`，不再叠加中央播放按钮或单独的预览 Dialog。

- 指针进入有内容的视频区域时静音自动播放，离开后暂停，并保留当前播放位置；
- 自动播放失败时保持静止，由用户通过原生控制条继续操作，不阻塞节点交互；
- 原生控制条支持播放、暂停、进度、音量和浏览器全屏；
- 控制条区域不触发节点拖拽，视频画面的其余区域仍可用于选择和拖动节点；
- 仅 hover 到当前视频节点时播放，避免画布上的多个视频持续同时解码。

### 5.4 选中工具栏

有当前视频时：

```text
AI 生成 | 历史 | 替换 | 下载 | 复制 | 删除
```

- `替换` 只在没有入边时可用；禁用时说明“当前内容由上游节点提供”；
- `AI 生成` 始终保留，生成完成后仍可在原 Prompt 基础上继续修改；
- `历史` 仅在存在上传源或至少一次生成记录时展示；
- 下载的是当前选中的输出；
- 复制不复制正在运行的任务，只复制节点输入配置和当前输出引用；
- 删除节点按现有画布删除策略处理边和引用。

### 5.5 空态

#### 无入边

- 主体显示简洁视频占位；
- 提供“上传视频”；
- 点击节点打开 AI Composer；
- 空节点不显示独立的顶部“生成视频”按钮，避免与 AI Composer 的生成操作重复；
- 可直接文生视频。

#### 有入边

- 不允许本地上传或拖放替换；
- 顶部引用区显示所有上游节点，包括空上游节点；
- 上游为空时保留引用占位，并明确显示“等待上游内容”；
- 生成按钮保持禁用，禁用原因指向具体不可用输入；
- 上游内容完成或变化后引用自动更新，不要求重新连线。

## 6. AI Composer 设计

### 6.1 结构

```text
引用预览区：统一尺寸缩略图，可删除，可 hover 预览
Prompt 编辑区：文本与行内 @ 引用
底部控制：模型 Route | 添加资源角色 | 参数 | 状态 | 生成/取消
```

要求：

- 输入草稿只有用户主动清空或成功覆盖时才改变，关闭和重新打开不能丢失；
- 文本、图片和视频 Composer 复用同一套容器、展开入口、底部操作与生成/取消状态；节点只注入模型选择、资源角色等业务差异控件；
- 已生成视频再次打开时恢复 Prompt、`@` 引用、Route 和参数；
- 上游连线引用与 `@` 引用在视觉上统一，但删除行为遵循已有约定；
- 缩略图不展示冗余节点类型和节点名称，名称放在 tooltip/无障碍标签中；
- 图片和视频缩略图使用统一外框尺寸，内容 `object-cover`；
- hover 预览使用独立浮层，不挤压 Composer 布局。

### 6.2 输入角色

第一版保留三个运行角色：

```ts
type CanvasResourceRole =
  | "reference"
  | "first-frame"
  | "last-frame";
```

`mediaType` 与 `role` 共同决定供应商槽位：

| 资源类型 | role | Generation slot |
|---|---|---|
| image | first-frame | `firstFrameUrl` |
| image | last-frame | `lastFrameUrl` |
| image | reference | `imageUrls` |
| video | reference | `videoUrls` |
| audio | reference | `audioUrls` |
| text | reference | 编译进 Prompt 上下文 |

约束：

- `first-frame` 和 `last-frame` 只允许图片；
- 一个视频节点最多各有一个首帧和尾帧；
- 尾帧不能脱离首帧单独存在；
- 普通参考资源数量由当前 Route Schema 限制；
- 不支持的角色在连接或插入时立即解释，不等到提交后才报错。

### 6.3 连线角色

建议以兼容方式扩展 `CanvasEdge`：

```ts
interface CanvasEdge {
  // existing fields
  role?: CanvasResourceRole;
  order?: number;
}
```

- 老画布没有 `role` 时按 `reference` 处理；
- 老画布仅在没有富文本 Prompt 文档时继续使用现有兼容推断；
- 新建连线不再根据图片数量自动猜测首尾帧；
- 图片连接到视频节点后，默认为普通参考；用户可以在引用缩略图菜单中改成首帧或尾帧；
- 首帧/尾帧调整写回 edge，而不是只存在于本地 Composer 状态；
- `order` 在创建边时分配，重排引用时显式更新。

### 6.4 `@`、连线与去重

- 连线引用：只来自直接上游节点；
- `@` 引用：可以来自当前画布任意可引用节点或资产；
- 发送顺序：连线引用按 `edge.order`，随后 `@` 引用按 Prompt 文档出现顺序；
- 绑定身份使用 `(sourceType, sourceId, role)`，不使用展示名称或上传完成顺序；
- 同一资源以同一角色被连线和 `@` 同时引用时只上传一次；
- 同一资源承担不同角色时保留不同绑定，例如同一图片同时作为普通参考和首帧；
- 编译后的 `@Image 1`、`@Video 1` 必须与对应 URL 数组中的序号一致；
- `GenerationInputAsset.bindingId` 是 Prompt token 与实际上传结果的稳定关联键。

删除规则沿用已确认方案：

- 删除顶部资源缩略图：移除该资源对应的连线引用和 `@` 引用；
- 只删除 Prompt 中的某个 `@` token：不删除仍由连线或其他 token 支撑的顶部缩略图；
- 删除上游连线：只移除连线来源；同资源仍有 `@` 引用时继续保留；
- 删除源节点：所有指向该源的连线和 `@` 引用进入统一清理流程。

## 7. Capability 与 Route 选择

新 Prompt 文档使用以下确定性规则推荐初始 Route：

| 输入 | capability |
|---|---|
| 只有 Prompt，无媒体参考 | `text-to-video` |
| 首帧，可选尾帧，无普通媒体参考 | `image-to-video` |
| 任意普通图片、视频或音频参考 | `multimodal-to-video` |

补充规则：

- 模型选择器始终以扁平列表展示全部已启用的视频 Route，并标明文生视频、图生视频或多模态模式；模型说明只通过独立的信息按钮按需展示；
- 素材只用于推荐新节点的初始 Route 和校验当前 Route，不用于隐藏其他视频 Route；
- 用户手动选择 Route 后，不因素材增删或角色变化而静默切换；如果输入不满足 Route Schema，保留选择并明确提示缺少或冲突的素材；
- 图生视频 Route 被手动选中后，下一张图片的默认角色切换为首帧；
- 参数编辑器展示 Route Schema 的全部字段，不单独制造“高级参数”折叠；
- 参数字段可声明供应商无关的展示提示；图片尺寸、比例、分辨率、时长和布尔开关由统一 Renderer 呈现，未知字段回退到标准表单控件；
- Route 切换时按字段名保留仍合法的用户设置，其余回落到新 Route 默认值；
- 提交前统一校验 Prompt 长度、素材数量、文件大小、时长、必填槽位和参数枚举；
- 不显示后端无法准确提供的费用或预计时间；如 Route 支持可靠费用确认，则复用现有付费生成确认机制。

Seedance 2.0/2.5 当前 Route 已能覆盖：

- 480p、720p 及部分超分辨率；
- 4–15 秒或 4–30 秒时长；
- adaptive、16:9、4:3、1:1、3:4、9:16、21:9 等比例；
- 首帧、可选尾帧；
- 多图片、视频和音频参考；
- `returnLastFrame`；
- seed；
- 部分 Route 的素材资产化槽位。

这些选项必须按具体 Route 展示，不能把 Seedance 2.5 的 30 秒能力错误应用到 Seedance 2.0。

## 8. 运行状态与错误状态

### 8.1 节点状态机

```text
empty / ready
    └─ generate → queued → running → succeeded
                              ├─ failed
                              └─ cancel_requested → cancelled

succeeded / failed / cancelled
    └─ generate again → 新 Run，不覆盖旧 Run
```

节点展示规则：

| 状态 | 节点表现 | 用户操作 |
|---|---|---|
| idle + 无视频 | 空态 | 上传、编辑 Prompt、生成 |
| queued | 排队状态 + 取消 | 查看输入、取消 |
| running | 进度条或不确定进度动画 + 取消 | 取消、查看详情 |
| succeeded | 当前视频 + Take 计数 | 预览、切换 Take、再次生成 |
| failed | 保留上一个成功视频；显示失败标记 | 查看错误、重试、修改后再生成 |
| cancelled | 保留上一个成功视频；显示已取消 | 再次生成 |
| stale | 当前视频仍可使用；提示输入已变化 | 使用旧结果或重新生成 |

失败不能把已有成功结果替换成空白节点。

### 8.2 “输入已变化”状态

上游节点内容、引用角色、Prompt、Route 或参数变化后：

- Composer 立即显示最新输入；
- 已生成视频不自动消失，也不自动付费重跑；
- 节点标记为“输入已变化”；
- 用户主动点击生成后创建新 Run；
- 新 Run 成功后自动成为当前输出，旧 Take 仍在历史中。

建议每个 Run 保存输入指纹：

```ts
interface CanvasGenerationSnapshot {
  promptDocumentHash: string;
  routeId: string;
  settingsHash: string;
  references: Array<{
    bindingId: string;
    sourceUpdatedAt: string;
    artifactId?: string;
    role: CanvasResourceRole;
    order: number;
  }>;
}
```

当前输入指纹与当前输出 Run 的指纹不一致时即为 stale。指纹在 application 层计算，前端不自行猜测。

当前实现已按这一边界落地：Run 输入保存服务端生成的 `sourceFingerprint`，图片/视频节点保存当前结果的 `generationProvenance`。画布输入或直接上游引用变化后由 application 层重算并传播 `stale`；前端只为尚未保存的本地 Composer 草稿补充即时提示，不再用节点时间戳或“历史 Take”身份猜测结果是否过期。

## 9. Take 与生成历史

### 9.1 推荐模型

不在 `CanvasNodeData` 中复制完整历史数组。Generation Run 和 Artifact 继续作为事实来源。

节点只新增当前选择信息：

```ts
interface CanvasVideoSelection {
  source: "upload" | "generation";
  runId?: string;
  artifactId?: string;
  workspaceFile?: CanvasWorkspaceFileRef;
}
```

服务端通过 `sourceRef = pipeline:canvas:<nodeId>` 查询该节点的 Generation Runs，组成历史视图。

### 9.2 历史交互

- 节点底部提供上一条/下一条轻量切换；
- “历史”打开 Popover/Drawer，展示上传源和所有 Run；
- 每条记录展示 poster、时间、模型、分辨率、时长和状态；
- 支持设为当前、预览、下载；
- 失败记录支持查看错误和重试；
- “重试”沿用同一个 Run 的 retry 语义；
- “再次生成”使用当前输入创建新的 Run；
- 第一版不做收藏，待真实使用需求出现后再增加。

当切换当前 Take 时，下游节点引用应立即解析到新的 Artifact，并被标记为 stale，但不自动重新生成。

## 10. 视频元数据与性能

建议保存：

```ts
interface CanvasVideoMetadata {
  durationSeconds?: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  posterUrl?: string;
}
```

策略：

- 上传或生成完成后由基础设施层探测并持久化元数据；
- 第一阶段如暂时没有服务端探测，可在浏览器 `loadedmetadata` 后补写时长和尺寸，但不能伪造音轨信息；
- poster 优先使用供应商返回的封面或尾帧/首帧 Artifact；其次由本地媒体处理生成；最后才退回浏览器首帧；
- 画布视频使用 poster 和 `preload="metadata"`，不自动播放；
- 仅对可视区域附近节点加载媒体信息；
- 预览 Dialog 关闭后暂停视频；
- 多节点画布不同时创建大量正在解码的 `<video>`。

## 11. 数据和 API 调整建议

### 11.1 Contracts

- `CanvasEdge` 增加可选 `role`、`order`；
- `CanvasNodeData` 增加 `videoSelection`、`videoMetadata`；
- 增加 Canvas generation snapshot/view DTO；
- SSE 节点更新事件继续发送完整、可序列化的节点数据；
- 老项目字段全部保持可读取。

### 11.2 Application

`CanvasStudioService` 负责：

- 校验连线角色与顺序；
- 编译 Prompt 与稳定资源绑定；
- 选择 capability；
- 计算输入指纹；
- 创建/取消/重试 Run；
- 切换当前 Take；
- 计算 stale；
- 将 Generation Run 状态投影成节点状态。

Route Handler 继续保持薄层，不放业务判断。

### 11.3 建议 API

```text
GET  /api/pipeline/canvas-nodes/:nodeId/runs
POST /api/pipeline/canvas-nodes/:nodeId/select-output
POST /api/pipeline/canvas-nodes/:nodeId/generate
POST /api/pipeline/canvas-nodes/:nodeId/cancel-generation
POST /api/generation-runs/:runId/retry  # 复用现有通用重试
```

如果现有 Generation Run 查询可以安全按 `sourceRef` 过滤，应复用现有接口，不重复建立第二套历史存储。

## 12. 关键边界场景

必须覆盖：

1. 空节点无入边，可以上传或文生视频；
2. 空节点有入边，禁止上传；
3. 上游为空，保留连线但阻止生成；
4. 多个上游节点连接同一视频节点；
5. 一个上游节点连接多个视频节点；
6. 首帧存在、尾帧缺失；
7. 尾帧存在、首帧缺失；
8. 普通参考图与首帧同时存在；
9. 同资源同时通过连线和 `@` 引用；
10. 同资源以不同角色引用；
11. 删除缩略图、删除 `@` token、删除边、删除源节点；
12. 上游结果切换 Take 后下游变 stale；
13. 生成中刷新页面或重启应用；
14. 生成失败时保留旧结果；
15. 取消排队与取消运行；
16. Route 切换导致 capability 或参数变化；
17. 生成后继续修改 Prompt 并再次生成；
18. 视频 URL 过期、文件丢失或解码失败；
19. 节点多选、框选、拖拽、缩放时不误开 Composer；
20. 画布存在大量视频节点时不发生集中解码和明显卡顿。

## 13. 分阶段实施

### 阶段 V0：交互基线

- 节点主体可拖拽；
- hover 自动播放与原生控制条；
- 标题、原生播放控制、Resize、连接点之间无事件冲突；
- 增加拖拽与播放回归测试。

### 阶段 V1：可靠的视频资源节点

- 视频元数据和 poster；
- 完整加载、空态、失败和不可用状态；
- 上传、替换、下载和刷新恢复；
- 大量节点媒体加载控制。

### 阶段 V2：明确的生成输入

- edge role 与 order；
- 首帧、尾帧、普通参考槽位；
- capability 确定性选择；
- Route Schema 完整校验；
- stale 输入指纹。

### 阶段 V3：非破坏性迭代

- 节点运行历史；
- Take 切换；
- 失败重试；
- 当前输出切换与下游 stale 传播；
- 上传源与生成结果统一展示。

### 阶段 V4：高级视频工具

完成真实后端 capability 后再逐项加入：

- 视频续写；
- 视频编辑/局部重拍；
- 首尾片段合并；
- 音频驱动与音视频分离；
- 逐帧分析；
- 时间线剪辑和最终合成。

这些能力不应以不可执行按钮提前占据节点界面。

## 14. 验收标准

第一版视频节点通过条件：

- 选中或未选中的视频节点都可以从主体非控件区域直接拖动；
- hover 到有内容的视频节点会自动播放，移出后暂停，原生控制条可正常使用；
- 播放、重命名、连接、Resize 和工具栏不会误拖节点；
- 空节点上传、文生视频、图生视频、首尾帧和多模态生成均按 Route Schema 工作；
- 引用顺序与最终 URL/Artifact 绑定稳定一致；
- 有入边时不能上传本地内容；
- Prompt 和引用在关闭、刷新后可恢复；
- 生成、取消、失败、重试和完成状态可恢复；
- 再次生成保留历史结果；
- 上游变化不会静默覆盖旧结果，并能提示 stale；
- 切换当前 Take 后下游引用更新；
- 中英文文案完整；
- 1024、1440、1920 宽度和常用画布缩放比例下交互可用；
- `npm run check` 和 `npm run build` 通过。

## 15. 暂不纳入第一版

- 完整时间线编辑器；
- 转场轨道和多轨音频混合；
- 专业色彩管理；
- 自动嘴型同步；
- Director/3D 摄像机控制；
- AutoLink 自动建图；
- 多人实时协作；
- 没有真实 Provider Route 支撑的高级按钮。

这些功能可以建立在稳定的视频节点、明确输入角色和 Take 历史之上，而不应反过来阻塞第一版。
