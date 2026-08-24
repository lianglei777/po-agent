# Pipeline Studio 与 LibTV 无限画布差距分析及重构计划

> 文档日期：2026-08-19  
> 当前分支：`feature/pipeline-workbench`  
> 分析范围：Pipeline Studio 首页、项目详情页、无限画布、基础节点、AI 生成、脚本节点、分组与工作流、四大画布功能、持久化与工程质量  
> 参考材料：`www.liblib.tv.har`、《LibTV 使用指南》、当前项目实现、运行时浏览器验证及项目检查结果

## 1. 执行摘要

当前 Pipeline Studio 不是“与 LibTV 还有少量体验差距”，而是处于“无限画布概念验证尚未达到可用状态”的阶段。

现有改造已经搭出了无限画布的视觉外壳和部分数据结构，但同时存在三个根本问题：

1. 项目详情页存在确定的运行时死循环，进入页面即可报错。
2. 画布、节点和工作流只是若干功能片段，没有形成稳定、连续、可恢复的创作工作台。
3. 底层仍然以旧的 Pipeline 阶段模型为核心，只是在旧模型上覆盖了一层媒体画布 UI。

因此，不建议继续在当前大型组件上逐个追加 LibTV 按钮和工具。推荐的总体方向是：

> 保留现有 Generation Run、RunningHub Route、SQLite、素材管理和脚本分析能力，重做 Pipeline Studio 的前端状态层、画布领域模型、持久化协议和画布交互层。

第一阶段目标不是复刻 LibTV 的全部高级工具，而是先实现一个可靠的基础闭环：

```text
项目首页
→ 打开无限画布
→ 创建文本/图片/视频/音频/脚本节点
→ 手动编辑或 AI 生成
→ 通过引用连线搭建工作流
→ 保存、刷新、恢复
→ 分组并按拓扑顺序执行
```

## 2. 分析依据与证据范围

### 2.1 当前项目

重点检查了以下文件：

```text
src/layouts/pipeline-app/project-list-view.tsx
src/layouts/pipeline-app/project-detail-view.tsx
src/layouts/pipeline-app/pipeline-canvas.tsx
src/layouts/pipeline-app/pipeline-node-types.tsx
src/layouts/pipeline-app/pipeline-api.ts
src/contracts/pipeline.ts
src/server/application/pipeline/canvas-studio-service.ts
src/server/infrastructure/sqlite/sqlite-pipeline-repository.ts
src/server/infrastructure/sqlite/sqlite-migrations.ts
src/app/api/pipeline/**
docs/LIBTV_CANVAS_REVERSE_ENGINEERING.md
docs/PIPELINE_STUDIO_ACCEPTANCE.md
docs/VALIDATION_OUTPUT.md
```

### 2.2 LibTV HAR

HAR 中包含 405 个请求，其中 94 个请求发往 `api.liblib.tv`。和画布相关的核心请求包括：

- 项目详情快照；
- Canvas Draft 和 viewport 更新；
- 节点及连接的 batch mutation；
- 工作流列表；
- 生成任务状态；
- 生成算力计算；
- 项目空间和文件夹信息。

HAR 能够证明 LibTV 使用完整 Canvas Snapshot 初始化画布，并通过带版本信息的批量请求持续保存节点、连接和视口变化。

HAR 不能证明的内容包括：

- LibTV 前端使用的具体状态库；
- 每个公共工作流的真实内部节点拓扑；
- 未在录制期间触发的 UI 操作；
- LibTV 前端命令历史和撤销系统的内部实现。

### 2.3 《LibTV 使用指南》

使用指南明确描述了：

- 文本、图片、视频、音频、脚本五类基础节点；
- 手动输入和模型生成两种节点内容来源；
- 通过连线搭建任务工作流；
- 分组、保存工作流和整组执行；
- 项目菜单栏、画布左侧栏、个人中心、小地图导航四大画布模块；
- 资产、历史、主体库和跨画布复制；
- 新版脚本节点的资产化、可编辑、可批量和灵活修改能力；
- AutoLink、图片、视频、音频和导演台等高级工具。

## 3. 已确认的直接故障

### 3.1 项目详情页无限更新

本地进入 Pipeline Studio 并打开项目后，可以稳定复现：

```text
Maximum update depth exceeded
```

错误位置：

```text
src/layouts/pipeline-app/pipeline-canvas.tsx:99
```

当前实现：

```tsx
onSelectionChange={({ nodes: selected }) =>
  onSelectionChange(selected.map((node) => node.id))
}
```

问题原因：

1. 每次渲染都创建新的回调函数；
2. React Flow 可能因回调引用变化重新同步 selection；
3. 回调每次都创建新的节点 ID 数组；
4. 父组件执行 `setSelectedIds(newArray)`；
5. 即使 ID 内容未变化，新数组仍会触发渲染；
6. 新渲染再次创建回调，形成更新循环。

这是用户进入项目详情页后看到报错的主要原因。

### 3.2 React Flow 属性使用错误

错误位置：

```text
src/layouts/pipeline-app/pipeline-canvas.tsx:91
```

当前代码：

```tsx
nodeDragHandle=".drag-handle"
```

当前安装的 `@xyflow/react@12.11.3` 没有这个 `ReactFlow` 属性，因此会产生两类问题：

- TypeScript 报错；
- React 将未知属性传递到 DOM，并产生控制台错误。

当前版本应当在节点对象上使用节点级 `dragHandle`，而不是把它传给 `ReactFlow` 根组件。

### 3.3 当前项目无法通过检查和构建

当前验证环境：

```text
Node v24.19.0
npm 11.17.0
```

#### `npm run check`

失败问题包括：

- render 阶段修改 `callbacksRef.current`；
- effect 中直接触发同步状态更新；
- render 期间可能读取 ref；
- 其他未使用变量和图片组件警告。

关键位置：

```text
src/layouts/pipeline-app/project-detail-view.tsx:186
src/layouts/pipeline-app/project-detail-view.tsx:197
src/layouts/pipeline-app/project-detail-view.tsx:625
```

#### `npm run typecheck`

当前存在三个明确错误：

1. `Uint8Array<ArrayBufferLike>` 不能直接作为当前类型的 Response body：

```text
src/app/api/pipeline/canvas-nodes/[nodeId]/media/route.ts:11
```

2. `nodeDragHandle` 不属于 React Flow Props：

```text
src/layouts/pipeline-app/pipeline-canvas.tsx:91
```

3. `NodeChange` 并非所有联合类型成员都有 `id`：

```text
src/layouts/pipeline-app/project-detail-view.tsx:689
```

#### `npm run build`

生产构建完成代码编译后，在 TypeScript 检查阶段失败，首先暴露的是媒体 Response 类型错误。

#### 测试结果

现有测试结果为：

```text
129 个 Vitest 文件通过
638 个测试通过
16 个 Desktop 测试通过
```

但是项目中没有以下对象的针对性测试：

- `CanvasStudioService`；
- `PipelineCanvas`；
- `ProjectDetailView`；
- Canvas mutation；
- 工作流应用；
- 分组拓扑执行；
- viewport 恢复；
- 节点引用同步。

因此，旧测试全部通过不能证明无限画布可用。

### 3.4 现有验证文档已经过时

以下文档记录的是之前缺少依赖时的验证状态：

```text
docs/LIBTV_CANVAS_REVERSE_ENGINEERING.md
docs/VALIDATION_OUTPUT.md
docs/PIPELINE_STUDIO_ACCEPTANCE.md
```

当时的环境无法真正执行项目级 check、build 和浏览器回归。当前依赖已经完整，实际运行立即暴露了代码错误。

因此，当前逆向报告中的功能覆盖矩阵应当理解为“设计意图和代码存在性清单”，不能当作“经过验收的可用功能清单”。

## 4. 当前项目与 LibTV 的差距总览

| 维度 | LibTV 基础逻辑 | 当前 Pipeline Studio | 结论 |
|---|---|---|---|
| 项目首页 | 以画布项目、封面、最近创作和快速新建为核心 | 仍展示剧本、资产、分镜、视频等阶段状态 | 产品模型仍然是旧 Pipeline |
| 画布可用性 | 稳定平移、缩放、选择、编辑、持久化 | 进入页面出现无限更新错误 | 当前不可用 |
| 基础节点 | 文本、图片、视频、音频、脚本五类 | 四类媒体节点，脚本被伪装成文本节点 | 脚本节点未实现 |
| 手动编辑 | 内容、提示词、素材、参数均可编辑 | 只有少量输入框和固定下拉框 | 能力过浅 |
| AI 驱动 | 节点自身可生成、编辑和派生 | 文本、图片、视频有初步生成，音频无生成 | 部分可用 |
| 引用关系 | 连线形成上下文、素材引用和生成血缘 | 主要根据媒体数量猜测运行模式 | 逻辑脆弱 |
| 工作流 | 打组、整体移动、保存、调用、整组执行 | 有虚线框和初步调度，但不能整体拖动 | 不完整 |
| 脚本工作流 | 资产、shot、提示词、批量生图和视频 | 仍调用旧剧本分析和分镜接口 | 差距极大 |
| 四大画布功能 | 项目菜单、左侧栏、个人中心、小地图 | 顶部按钮、底部 Dock 和小地图 | 只完成外壳 |
| 资产和历史 | 资产库、主体库、生成历史、批量使用 | 没有完整画布资产和历史面板 | 缺失 |
| 工具体系 | 图片、视频、音频、Slash、AutoLink 等 | 少量基于提示词的快捷派生 | 缺失 |
| 工程质量 | 成熟交互和状态恢复 | 无 Canvas 测试，check/build 失败 | 未达到 MVP |

## 5. 详细差距分析

### 5.1 首页仍然是阶段式 Pipeline

当前项目首页由以下文件实现：

```text
src/layouts/pipeline-app/project-list-view.tsx
```

项目卡片主要展示：

- 剧本阶段；
- 资产阶段；
- 分镜阶段；
- 视频阶段；
- 合成阶段；
- 分镜数量。

这和 LibTV 的“一个项目就是一个持续创作的无限画布”存在根本差异。

建议的项目卡片内容应当是：

- 项目封面或最近一次生成结果；
- 项目名称；
- 最近更新时间；
- 节点数量；
- 最近运行状态；
- 最近使用的工作流或模型；
- 快速继续创作；
- 复制、重命名和删除操作。

阶段状态可以作为脚本节点或故事生产工作流内部信息，但不应继续主导项目首页。

### 5.2 脚本节点不是第一类节点

共享合同中真正可以创建的媒体节点类型只有：

```ts
"text" | "image" | "video" | "audio"
```

虽然 `CanvasNodeType` 中仍保留了 `script`，但是创建接口会拒绝它。当前 UI 中的“脚本节点”实际行为是：

1. 创建一个 text node；
2. 设置 `legacyEntity.type = "script"`；
3. 将文本同步到项目的 `originalText`；
4. 调用旧的 analyze 和 extract-storyboard API。

相关代码：

```text
src/server/application/pipeline/canvas-studio-service.ts:524-568
```

而 LibTV 新版脚本节点要求：

- 结构化 shot；
- 角色、场景、道具资产；
- shot 字段编辑；
- shot 新增、删除和排序；
- 资产引用；
- 最终提示词合成；
- 批量创建生图生成器组；
- 批量创建视频生成器组；
- 局部测试后再批量执行。

当前实现与该目标仅共享旧的“剧本分析”能力，没有相同的节点模型和交互模型。

### 5.3 节点和生成器没有清晰分层

当前节点组件：

```text
src/layouts/pipeline-app/pipeline-node-types.tsx
```

一个组件同时负责：

- 媒体预览；
- 节点名称；
- 引用标签；
- Prompt；
- Route 选择；
- 分辨率；
- 比例；
- 时长；
- 输出格式；
- 生成按钮；
- 任务状态；
- 复制和删除。

这种结构会导致：

- 不同节点类型耦合；
- 生成器参数只能写死少数常用字段；
- Route Schema 中大量参数无法展示；
- 未来加入脚本和音频生成后组件继续膨胀；
- 节点拖动、媒体预览和参数编辑互相干扰；
- 生成器难以独立展开、收起或全屏编辑。

建议将节点拆为：

```text
NodeFrame
├── NodeHeader
├── NodePreview
├── NodePorts
├── NodeActions
└── GeneratorPanel
```

`GeneratorPanel` 根据节点类型、引用状态和 Route Schema 动态渲染。

### 5.4 前端没有完整消费 Route Schema

当前项目已经存在相对丰富的 Generation Route Schema，包括：

- 分辨率；
- 时长；
- 画面比例；
- 是否生成音频；
- 真人模式；
- 素材资产化范围；
- 是否返回尾帧；
- seed；
- 输出格式；
- 联网增强；
- Route 对输入素材的数量和类型限制。

Canvas UI 目前只消费少量固定字段。这意味着后端已经具备的能力在画布中无法使用，用户也无法在提交前知道输入是否满足 Route 约束。

正确方向是使用共享的 Schema-driven 参数编辑器，而不是在 Canvas 节点里继续增加固定 Select。

### 5.5 连线语义依赖数量猜测

当前服务端根据输入素材数量推断生成模式：

```text
src/server/application/pipeline/canvas-studio-service.ts:252-274
```

当前规则大致为：

- 一张图片：图生视频；
- 两张图片：首尾帧视频；
- 超过两张图或包含视频、音频：多模态视频；
- 没有图片：文生视频。

问题包括：

- 用户不能明确指定首帧和尾帧；
- 两张普通参考图可能被错误解释成首尾帧；
- 删除和重连后角色可能变化；
- 输入顺序依赖 edge 查询顺序；
- Route 对素材数量和类型的限制无法准确表达；
- 错误通常只能在提交生成后暴露。

建议保持简单的引用连线外观，但为 edge 增加明确的运行语义：

```ts
type CanvasReferenceRole =
  | "context"
  | "image-reference"
  | "first-frame"
  | "last-frame"
  | "video-reference"
  | "audio-reference";
```

同时记录：

```ts
interface CanvasEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  role: CanvasReferenceRole;
  order: number;
}
```

### 5.6 分组只是视觉边框

当前 group 节点由成员节点位置动态计算边界，并设置：

```ts
draggable: false
```

相关代码：

```text
src/layouts/pipeline-app/project-detail-view.tsx:810-843
```

当前分组可以：

- 显示虚线边界；
- 显示组名；
- 显示运行、保存和解组按钮。

但不能：

- 整组移动；
- 保持成员相对坐标；
- 作为一个稳定的工作流容器；
- 可靠恢复 group 自身坐标；
- 进行嵌套或后续扩展。

LibTV 指南明确要求打组后可以整体拖动，因此当前仅完成了视觉分组，没有完成交互分组。

### 5.7 工作流预设的内部拓扑并不真实

HAR 捕获了 25 个公共工作流的：

- ID；
- 名称；
- 描述。

但没有捕获应用这些工作流时的完整节点图。

当前实现将 25 个工作流归并为五种自定义拓扑：

```ts
"image-video"
"two-image-video"
"text-image"
"image-image"
"storyboard-video"
```

代码位置：

```text
src/server/application/pipeline/canvas-studio-service.ts:751-1035
```

因此，当前列表中的工作流名称来源于 LibTV，但内部节点和连线是 Po 自己推测并适配的。

在获取真实拓扑之前，建议：

- 标记为“LibTV 灵感模板”或“Po 适配模板”；
- 只保留少数真正经过端到端验证的模板；
- 补抓 Workflow apply HAR 后再逐个还原。

### 5.8 工作流应用不是原子操作

当前工作流应用过程：

1. 循环创建节点；
2. 循环创建 edge；
3. 逐个同步目标节点引用。

代码位置：

```text
src/server/application/pipeline/canvas-studio-service.ts:467-499
```

整个过程没有放入数据库事务。如果中间失败，会留下半套节点或不完整连线。

建议将以下操作纳入同一个 SQLite 事务：

- 创建全部节点；
- 创建全部 edge；
- 创建 group；
- 写入引用角色和顺序；
- 更新 Canvas revision；
- 返回完整 mutation result。

### 5.9 分组执行依赖进程内状态

当前服务使用进程内 Set 管理分组执行：

```ts
advancingGroupRuns
requestedGroupAdvances
```

如果进程重启：

- pending group run 无法可靠恢复；
- 已完成的上游任务可能无法继续触发下游；
- 没有独立 group run 记录；
- 不方便取消、重试和审计；
- 无法稳定展示组级进度。

项目现有架构已经规定 Generation Run 应当是持久化事实来源，因此工作流执行也应建立持久化的 Workflow Run 或 Group Run，而不是依赖进程内集合。

### 5.10 四大画布模块只完成了部分外壳

#### 项目菜单栏

当前只有返回、标题、工作流、AI 自动化和更多菜单。

缺少：

- 画布重命名；
- 新建项目；
- 项目复制；
- 项目删除；
- 项目设置；
- 自动保存状态；
- 项目目录或存储位置。

#### 画布左侧栏

当前主要是图标按钮和底部 Dock，没有真正的工具面板。

缺少：

- 添加节点和资源；
- 工作流库；
- 我的资产；
- 生成历史；
- 工具入口；
- 帮助和教程。

#### 个人中心的本地等价能力

Po Agent 是本地开发工具，不需要照搬 LibTV 的会员、社区和积分系统。

建议转换为：

- 当前 Provider 状态；
- Route 启用状态；
- 当前生成队列；
- 成本和副作用提示；
- 本地存储位置；
- 项目 Agent；
- Pipeline 设置。

#### 小地图导航

当前已经使用 React Flow MiniMap，但还存在：

- 默认总是显示；
- 缺少明确开关；
- 缺少缩放百分比；
- viewport 异步加载后可能没有真正应用；
- 没有恢复测试；
- 与 Fit View 的交互没有形成统一导航控制。

### 5.11 `ProjectDetailView` 职责过多

文件：

```text
src/layouts/pipeline-app/project-detail-view.tsx
```

当前约 923 行，同时负责：

- Canvas 状态；
- 节点 CRUD；
- edge CRUD；
- 节点保存防抖；
- 文件上传；
- selection；
- copy/paste；
- group；
- workflow；
- keyboard；
- viewport；
- AI Agent；
- SSE；
- 脚本自动化；
- 弹窗；
- 页面布局。

这违反项目自身的前端架构规则。业务能力应当位于 `src/features/<feature>`，`src/layouts` 只负责应用级组合和布局状态。

当前 selection 无限循环就是状态和副作用过度集中后开始失控的直接表现。

## 6. 推荐的总体改造方向

### 6.1 应保留的基础能力

建议保留并复用：

- `@xyflow/react`；
- Generation Run 和 Worker；
- RunningHub Route 及 Route Schema；
- SQLite 基础设施；
- 受控素材上传和 workspace 文件隔离；
- Script Analysis 和 Storyboard 能力；
- Pipeline Agent session；
- 现有项目和 Session 体系。

这些能力已经有一定工程基础，不需要推倒重来。

### 6.2 应重写或重新分层的部分

建议重点重写：

- `ProjectDetailView`；
- `PipelineCanvas`；
- `pipeline-node-types.tsx`；
- Canvas 前端状态管理；
- Canvas Snapshot 和 Mutation HTTP 合同；
- 首页项目卡片；
- 脚本节点领域模型；
- 工作流保存和执行模型。

### 6.3 推荐的前端目录结构

```text
src/features/pipeline-studio/
  api/
    pipeline-studio-api.ts
  contracts/
    canvas-view-model.ts
  state/
    canvas-store.ts
    canvas-store-provider.tsx
  controllers/
    use-canvas-session-controller.ts
    use-canvas-persistence.ts
    use-canvas-keyboard.ts
    use-canvas-clipboard.ts
    use-canvas-generation.ts
  components/
    studio-shell.tsx
    project-menu.tsx
    canvas-tool-rail.tsx
    canvas-surface.tsx
    canvas-minimap-controls.tsx
    selection-toolbar.tsx
    generator-panel.tsx
    workflow-library.tsx
    asset-library.tsx
    generation-history.tsx
  nodes/
    node-frame.tsx
    text-node.tsx
    image-node.tsx
    video-node.tsx
    audio-node.tsx
    script-node.tsx
    group-node.tsx
```

`src/layouts/pipeline-app` 只负责：

- 首页和项目详情的切换；
- Pipeline Studio 的整体布局；
- 向 feature 传入 `projectId`；
- 协调顶层面板显示。

### 6.4 推荐的 Canvas Snapshot

项目详情初始化应返回明确的快照：

```ts
interface CanvasSnapshot {
  project: CanvasProjectSummary;
  revision: number;
  viewport: CanvasViewport;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}
```

### 6.5 推荐的节点模型

节点应成为真正的 discriminated union：

```ts
type CanvasNode =
  | TextCanvasNode
  | ImageCanvasNode
  | VideoCanvasNode
  | AudioCanvasNode
  | ScriptCanvasNode;
```

资源和生成器可以共用节点实体，但要明确节点模式：

```ts
type NodeMode =
  | "resource"
  | "generator"
  | "resource-with-generator";
```

节点不应再依赖 `legacyEntity` 才知道自己的真实业务含义。

### 6.6 推荐的批量保存协议

不建议继续用大量零散 PATCH 保存节点和 edge。建议使用：

```ts
interface CanvasMutationBatch {
  baseRevision: number;
  requestId: string;
  mutations: CanvasMutation[];
}
```

服务端在一个 SQLite 事务中：

1. 校验项目和 revision；
2. 创建、更新或删除节点；
3. 创建、更新或删除 edge；
4. 更新 viewport；
5. 更新 Canvas revision；
6. 返回新 revision 和变化结果。

本地单用户产品不需要复制 LibTV 的 heartbeat 和云协作协议，但应借鉴：

- Snapshot 初始化；
- Batch mutation；
- Revision；
- Request ID；
- 原子保存。

## 7. 分阶段改造计划

### 阶段 0：恢复可运行状态

目标：停止增加功能，先保证项目详情可以稳定打开。

任务：

1. 修复 selection 无限循环；
2. 删除错误的 `nodeDragHandle`；
3. 改为节点级 `dragHandle`；
4. 修复 `NodeChange` 联合类型处理；
5. 修复媒体 Response body；
6. 移除 render 期间 ref 赋值；
7. 重构项目详情初始化 effect；
8. 正确应用异步 viewport；
9. 清理本轮硬编码中文并补全中英文词典；
10. 增加项目详情浏览器 smoke test；
11. 确保 `npm run check` 通过；
12. 确保 `npm run build` 通过；
13. 确保浏览器控制台零错误。

这一阶段不增加新的 LibTV 功能。

### 阶段 1：建立 Canvas 基础架构

目标：将 Canvas 业务从大型 layout 组件中拆出。

任务：

1. 创建 `src/features/pipeline-studio`；
2. 建立 feature-scoped Zustand Store；
3. 将 nodes、edges、selection、viewport 和 revision 放入 Store；
4. 将请求、SSE、AbortController 和定时器放入 controller hook；
5. 建立 Canvas Snapshot 合同；
6. 建立 Canvas Mutation Batch API；
7. Transport 层增加运行时验证；
8. SQLite mutation 使用事务；
9. 增加 repository、application 和 transport 测试；
10. 更新 `docs/agent-api-reference.md`。

### 阶段 2：完成可用的无限画布 MVP

目标：先把基础画布操作打磨稳定。

需要完成：

- 平移；
- 缩放；
- 小地图；
- 适配全部；
- viewport 恢复；
- 双击空白创建；
- 右键创建菜单；
- 拖入素材；
- 粘贴素材；
- 单选、多选、框选；
- 节点移动；
- 节点缩放；
- 删除；
- 复制；
- 副本；
- 撤销和重做；
- 创建连线；
- 删除连线；
- 显示和隐藏连线；
- 键盘快捷键；
- 自动保存状态；
- 刷新恢复。

这一阶段只要求简单节点可靠，不急于完成完整生成器和高级工具。

### 阶段 3：重做五类基础节点

#### 文本节点

- 手动编写；
- AI 生成；
- 引用文本或图片作为上下文；
- 生成结果回填；
- 内容历史版本。

#### 图片节点

- 上传；
- 文生图；
- 图生图；
- 多图参考；
- 图片编辑；
- 生成结果选择；
- 快速派生到视频。

#### 视频节点

- 上传；
- 文生视频；
- 图生视频；
- 明确首帧和尾帧；
- 多模态参考；
- 视频结果预览；
- 失败重试；
- 取消生成。

#### 音频节点

基础版本至少支持：

- 上传；
- 播放；
- 时长信息；
- 作为视频参考；
- 可选波形展示。

如果要实现 AI 音频生成，必须先增加真实的音频 Generation Capability 和 Provider Route，不能只增加一个不可用按钮。

#### 脚本节点

脚本必须成为独立节点，至少包含：

- 原始剧本；
- shot 列表；
- shot 编辑；
- 角色、场景、道具；
- shot 排序、新增和删除；
- 资产绑定；
- 最终提示词；
- 选择 shot 创建生成器组。

### 阶段 4：完成工作流和分组

目标：先完成一个可靠的“文本或参考图 → 图片 → 视频”闭环。

任务：

1. edge role 和 edge order；
2. 真正的 group 坐标；
3. 成员相对位置；
4. 整组拖动；
5. 解组；
6. 保存工作流；
7. 工作流应用事务；
8. 工作流实例使用独立 group ID；
9. 拓扑排序；
10. 环检测；
11. 上游完成后同步最新产物；
12. 下游再执行；
13. 持久化 Workflow Run 或 Group Run；
14. 应用重启后恢复执行；
15. 失败、取消和重试；
16. 增加端到端测试。

在得到真实 LibTV 工作流拓扑前，当前预设应标记为“LibTV 灵感模板”或“Po 适配模板”。

### 阶段 5：首页和四大画布模块

#### 首页

改造成项目画廊：

- 新建空白画布；
- 从工作流创建；
- 项目封面；
- 最近产物；
- 更新时间；
- 节点数量；
- 最近运行状态；
- 搜索和排序。

#### 项目菜单

- 返回首页；
- 重命名；
- 复制项目；
- 删除项目；
- 项目设置；
- 项目目录。

#### 左侧栏

建议保留五个入口：

- 添加；
- 工作流；
- 资产；
- 历史；
- 工具。

教程和帮助可以放入帮助菜单，不一定占用一级入口。

#### 右上角状态区

不复制会员、社区和积分，改成本地产品所需能力：

- Provider 状态；
- 模型设置；
- 生成队列；
- 当前运行任务；
- Pipeline Agent；
- 本地存储设置。

#### 小地图

- 默认可收起；
- 显示缩放百分比；
- 点击定位；
- 支持 Fit View；
- 正确持久化 viewport。

### 阶段 6：高级 LibTV 功能

基础版本通过验收后再实现：

- AutoLink 智能引用；
- Slash 工具；
- 图片高清；
- 多机位九宫格；
- 宫格切分；
- 视频剪辑；
- 视频合成；
- 音视频分离；
- 音频切分；
- 视频续写；
- 片段重拍；
- 逐帧拉片；
- 导演台；
- 主体库；
- 脚本批量生产。

在基础 Canvas 不稳定时同时开发这些功能，会继续扩大不可控状态和测试成本。

## 8. 第一版验收标准

第一版不需要完整复制 LibTV，但至少必须满足以下场景：

1. 进入项目详情没有控制台错误；
2. 创建五类节点后刷新仍可恢复；
3. 节点拖动和缩放可以恢复；
4. viewport 可以恢复；
5. 上传图片、视频和音频成功；
6. 文本节点支持手动编辑和 AI 生成；
7. 文本到图片可以完成生成；
8. 图片到视频可以完成生成；
9. 两张图片可以明确指定首帧和尾帧；
10. 多张图片、视频和音频按 Route Schema 校验；
11. 删除连线后引用立即失效；
12. 分组可以整体移动；
13. 分组可以保存并重新应用；
14. 整组执行按照拓扑顺序推进；
15. 刷新页面不会丢失 Generation Run 状态；
16. 应用重启不会丢失持久化任务状态；
17. Undo/Redo 至少覆盖节点和 edge 操作；
18. 中英文没有新增硬编码遗漏；
19. `npm run check` 通过；
20. `npm run build` 通过；
21. Canvas application、transport 和 repository 有测试；
22. 浏览器验证 1024、1440 和 1920 三种桌面宽度。

## 9. 目前缺少的资源

### 9.1 定向录制的 LibTV HAR

当前 HAR 对恢复项目快照很有价值，但仍缺少以下操作：

1. 创建五种节点；
2. 文本手动编辑和 AI 生成；
3. 图片文生图、图生图和多图参考；
4. 视频首帧、首尾帧和多模态生成；
5. 音频生成；
6. 创建分组、整体移动和解组；
7. 保存工作流；
8. 应用公共工作流；
9. 整组重新执行；
10. 创建资产和重新调用资产；
11. 从历史记录重新放入画布；
12. AutoLink；
13. Undo/Redo；
14. 跨画布复制粘贴。

其中最重要的是 Workflow apply 的 HAR。当前 25 个预设只有列表元数据，没有内部图。

### 9.2 完整屏幕录制

建议录制 1440p、60fps，覆盖：

```text
新建项目
→ 创建文本节点
→ 上传参考图
→ 连接图片节点
→ 生成图片
→ 创建视频节点
→ 首尾帧或多模态生成
→ 打组
→ 保存工作流
→ 新项目应用工作流
```

HAR 无法记录以下重要交互：

- 节点进入编辑状态的方式；
- hover 工具栏；
- 拖动反馈；
- 组整体移动；
- 连线显隐；
- 生成器展开和收起；
- 生成完成后的结果选择。

### 9.3 明确不复制的云端功能

建议明确第一版是否排除：

- 会员；
- 积分；
- 社区发布；
- 画布分享；
- 多用户协作；
- Folder 和 Space 权限；
- LibTV 自有算力计费。

建议第一版排除这些能力，并改成本地等价功能，避免出现没有真实后端支持的空 UI。

### 9.4 三套真实验收项目

#### 案例 A：简单广告

```text
产品图 + 风格图 + Prompt
→ 产品效果图
→ 视频
```

#### 案例 B：角色短片

```text
角色图 + 场景图 + 剧情
→ 分镜图
→ 视频片段
```

#### 案例 C：脚本批量生产

```text
完整脚本
→ 角色/场景/道具
→ 10 个 shots
→ 批量生图/视频
```

没有真实验收案例，最终很容易再次出现“按钮很多，但主流程不可用”的结果。

## 10. 推荐的下一步

建议按照以下顺序执行：

1. 先完成阶段 0，修到项目详情零报错、check 和 build 通过；
2. 立即完成阶段 1，把大型组件拆成 feature store 和 controller；
3. 实现一条真正可用的垂直链路：文本或参考图 → 图片 → 视频；
4. 验证刷新恢复、失败重试和任务持久化；
5. 再实现分组保存、工作流应用和拓扑执行；
6. 基础闭环通过后再扩展脚本节点、资产历史和高级工具。

最终判断是：

> 当前最需要的不是继续模仿更多 LibTV 按钮，而是先把 Canvas Snapshot、节点状态、引用语义、Generation Run 和工作流执行统一为一个可靠的数据模型。基础模型稳定后，LibTV 的交互和工具才有可能逐步补齐。
