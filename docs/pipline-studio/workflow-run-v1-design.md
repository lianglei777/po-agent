# Pipeline Studio Workflow Run v1 设计

> 状态：Accepted / implementing
>
> 日期：2026-08-29
>
> 范围：在当前画布上运行用户明确选中的生成节点；不包含时间线、自动建图和云协作。

## 1. 产品目标

Pipeline Studio 已经具备可靠的画布编辑、节点级生成、资源引用、Take 历史和输入过期提示。下一步需要让用户把一组已连接节点当作一个可恢复任务运行，而不是逐个打开节点并手动生成。

第一版只解决一条可验证的垂直链路：

```text
文本或参考图 -> 图片 -> 视频
```

用户框选或多选需要执行的节点，确认一次后启动工作流。系统按拓扑顺序运行；互不依赖的节点可以并行；上游成功后，下游使用其当前选中产物继续执行。

## 2. 设计原则

1. **运行记录是一等持久化实体。** Workflow Run 和每个节点步骤写入项目 SQLite，不能只存在于 React 状态或进程内集合。
2. **Generation Run 仍是付费生成事实来源。** Workflow Run 只负责编排，不复制 Provider Job、Artifact 或生成输入快照。
3. **执行图在启动时冻结。** 保存选中节点和内部边的快照；运行期间的画布编辑不改变已经启动的拓扑。
4. **不自动产生新费用。** 启动和失败重试都需要用户明确确认。上游变化只标记结果过期，不自动重跑。
5. **失败局部化。** 已完成步骤保持完成；失败节点之后的步骤保持等待。重试从失败节点继续，不重复运行成功步骤。
6. **恢复优先。** 页面刷新、Next.js 热更新或桌面应用重启后，打开项目即可恢复未结束的 Workflow Run。
7. **界面保持安静。** 画布只增加“运行所选”主操作和右上角紧凑状态带，不新增常驻大型面板。

## 3. 范围

### 3.1 v1 包含

- 运行当前选中的可生成节点；
- 校验项目、选区、环路、重复活动运行和节点基本可运行性；在首个付费任务前预检所有步骤的静态 Route、Provider、Prompt、参数和素材槽位；
- 持久化 Workflow Run、拓扑边快照和节点步骤；
- 拓扑调度与独立分支并行启动；
- 文本节点同步完成后继续调度；
- 图片、视频节点关联标准 Generation Run；
- Generation Run 完成或失败后推进 Workflow Run；
- 刷新或重启后的恢复；
- 取消活动运行；
- 从失败步骤重试；
- SSE 驱动的画布和工作流状态刷新；
- 中英文状态、禁用原因和错误反馈。

### 3.2 v1 不包含

- 保存和分享工作流模板的完整 UI；
- 25 个推测性预设工作流；
- 脚本/Shot 批量生产；
- 时间线、转场、音轨和最终合成；
- 自动建图、Agent 自动运行画布；
- 运行中修改拓扑并热更新当前 Run；
- 精确费用估算或预计完成时间。

## 4. 持久化模型

### 4.1 Workflow Run

```ts
type CanvasWorkflowRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelling"
  | "cancelled";

interface CanvasWorkflowRun {
  id: string;
  projectId: string;
  status: CanvasWorkflowRunStatus;
  nodeIds: string[];
  edges: CanvasWorkflowRunEdge[];
  steps: CanvasWorkflowRunStep[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

`nodeIds` 和 `edges` 是启动时的拓扑快照。节点 Prompt、Route、参数和资源版本继续由每个实际 Generation Run 的输入快照冻结。

### 4.2 节点步骤

```ts
type CanvasWorkflowRunStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

interface CanvasWorkflowRunStep {
  nodeId: string;
  status: CanvasWorkflowRunStepStatus;
  generationRunId?: string;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
}
```

一个项目第一版只允许一个 `pending`、`running` 或 `cancelling` 的 Workflow Run，避免两个运行同时争用同一个节点输出。该约束由项目数据库的部分唯一索引兜底，不能只依赖 application 的先查后写。

## 5. 状态机

```text
pending -> running -> completed
                   -> failed -> running (explicit retry)
                   -> cancelling -> cancelled
```

步骤状态：

```text
pending -> running -> completed
                   -> failed -> pending (explicit retry)
pending/running -> cancelled
```

调度规则：

1. 只处理 Workflow Run 快照中的节点和边；
2. `pending` 步骤的所有内部依赖均为 `completed` 时进入 ready 集合；
3. ready 集合中的步骤并行启动；
4. 文本生成同步返回后立即标记完成并再次推进；
5. 媒体生成创建 Generation Run 后保存 `generationRunId`，等待 Worker 回调；
6. 任一步骤失败后 Workflow Run 进入 `failed`，尚未执行的步骤保持 `pending`；
7. 所有步骤完成后 Workflow Run 进入 `completed`；
8. 恢复时，先根据关联 Generation Run 对齐运行中步骤，再继续调度 ready 步骤。
9. 活动 Run 中的节点数据和相关连接不可删除或修改；节点级取消也必须通过 Workflow Run 统一收敛。
10. 若关联 Generation Run 在工作流之外被取消，恢复时把步骤转换为可重试的 `failed`，避免形成无法推进的 `cancelled` 依赖。

## 6. API

```text
GET  /api/pipeline/projects/:projectId/canvas/workflow-runs?limit=1
POST /api/pipeline/projects/:projectId/canvas/workflow-runs
GET  /api/pipeline/projects/:projectId/canvas/workflow-runs/:runId
POST /api/pipeline/projects/:projectId/canvas/workflow-runs/:runId/cancel
POST /api/pipeline/projects/:projectId/canvas/workflow-runs/:runId/retry
```

创建请求：

```ts
interface CreateCanvasWorkflowRunRequest {
  nodeIds: string[];
}
```

Transport 只解析和校验请求；拓扑、项目归属、运行冲突和状态迁移由 application 层负责。

## 7. UI

### 7.1 运行入口

底部中央工具条增加带文字的“运行所选”按钮：

- 无选择：禁用并解释“请先选择要运行的节点”；
- 画布正在保存：禁用并解释“等待画布保存完成”；
- 已有活动运行：禁用并解释“当前工作流仍在运行”；
- 选区没有可生成节点：禁用并解释具体原因；
- 可运行：显示选中的可生成节点数量。

点击后使用确认对话框说明会调用已配置的内容生成 API，可能产生费用。对话框不展示无法可靠计算的金额或耗时。

### 7.2 运行状态带

画布右上角显示紧凑状态带：

- 运行中：`工作流 1 / 2 · 正在生成「分镜图」`，提供取消；
- 失败：显示失败节点和服务端错误，提供重试；
- 完成：显示完成数量和完成状态；
- 已取消：显示已取消状态。

状态不能只依赖颜色；图标、文本和按钮共同表达。禁用按钮必须有具体 tooltip。

## 8. 取消和重试语义

- 取消把尚未开始的步骤标记为 `cancelled`；
- 对已经创建 Generation Run 的步骤调用现有取消用例；供应商若已接受任务，仍遵守现有“取消本地跟踪不保证停止供应商计费”的约束；
- 文本模型调用第一版不能强制中止，但返回后不得继续推进已取消工作流；
- 重试把失败步骤恢复为 `pending`，保留已完成步骤；
- 重试需要再次确认可能产生费用；
- 同一个失败 Workflow Run 不创建第二条运行记录，便于审计完整生命周期。

## 9. 恢复

打开 Canvas Snapshot 时触发项目级 Workflow Run 恢复：

1. 查找项目的活动 Run；
2. 对带 `generationRunId` 的运行中步骤读取 Generation Run 当前状态；
3. 将已经成功、失败或取消的 Generation Run 投影回步骤；
4. 推进新的 ready 步骤；
5. 通过 Pipeline SSE 通知前端重新读取画布和 Workflow Run。

恢复操作必须幂等；同一步骤已有活动 Generation Run 时不能再次创建付费任务。

## 10. 验收标准

1. 选择“图片 -> 视频”两个生成节点，一次确认后按依赖顺序生成；
2. 文本生成节点可以作为图片节点上游并继续推进；
3. 两条无依赖分支会各自进入运行状态；
4. 刷新页面后仍显示同一 Workflow Run 和步骤状态；
5. 重启服务后打开项目可以继续未结束运行；
6. 上游失败时下游不启动，重试后从失败节点继续；
7. 取消后不再启动等待中的节点；
8. 同一项目不能同时启动两个 Workflow Run；
9. 环路、跨项目节点和空选区在任何生成任务创建前被拒绝；
10. 运行完成后，下游节点使用上游最新产物，后续输入变化继续触发 stale；
11. application、repository、transport 和 UI 纯逻辑具有聚焦测试；
12. `npm run check` 与 `npm run build` 通过。
