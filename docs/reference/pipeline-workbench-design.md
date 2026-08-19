 # Pipeline 工作台 — 独立产品设计方案

 > 这是一个独立的产品设计，不是 po-agent 聊天工作区的附加功能。
 > 模式切换 = 进入一个新应用。
 > UI 布局参考 LumenX Studio；工作流 AI 驱动 + 无限画布。

 ---

 ## 1. 设计理念

 Pipeline 工作台是一个 **可视化生产工具**，不是聊天工具。它的设计围绕四条
 原则：

 **看见整个故事**
 画布是叙事骨架。剧本、角色、场景、道具、分镜、视频——每个实体都是画布上
 可见的节点，它们之间的依赖关系是可见的边。你在操作某个局部时，永远不丢失
 全局。这是与聊天式生产工具的根本区别：产物不在对话流里，而在空间结构里。

 **AI 是导演，你是制片人**
 AI 提案并执行（提取实体、生成图片、创建分镜），你审阅并决策（选变体、
 批准 take、引导修订）。工作区为"审阅—指挥"而设计，不是为"输入命令"
 而设计。AI 的每个操作直接在画布上产生可见结果，你能立刻看到发生了什么。

 **阶段是视角，不是围墙**
 剧本→资产→分镜→视频→合成是 pipeline 的自然阶段，但它们不是隔离的屏幕。
 阶段导航是画布的过滤器——选中"资产"阶段时，画布高亮资产节点并淡化其他；
 但你始终能看到全局。阶段之间可以自由跳转，不强制线性。

 **每个产物都有归属**
 每张生成的图片、每段视频、每段音频都是画布上的一个节点，有明确的来源
 和归属关系。没有东西会消失在聊天记录里。变体、抽卡、最终选择都有可见的
 空间位置。

 ---

 ## 2. 应用架构 — 三级导航

 参照 LumenX 的信息架构，Pipeline 工作台有三级导航：

 ```text
 第一级: 工作区侧边栏 (PipelineSidebar)
         品牌 + 工作区导航项 + 底部工具
         ↓
 第二级: 项目列表 (ProjectList)
         项目卡片网格，新建/打开项目
         ↓ 点击某个项目
 第三级: 项目详情 (ProjectDetail)
         阶段侧边栏 + 无限画布 + 检查器 + AI 面板
 ```

 ### 2.1 第一级：工作区侧边栏

 这是 Pipeline 应用的根级导航，类似 LumenX 的 `GlobalSidebar`：

 ```text
 ┌──────────────────┐
 │                  │
 │  [品牌 Logo]      │  品牌标识
 │  Pipeline Studio  │
 │                  │
 ├──────────────────┤
 │                  │
 │  ◆ 项目工作区     │  ← 主导航项（默认选中）
 │  □ 资产库        │  ← 未来扩展位（预留）
 │  □ 模板库        │  ← 未来扩展位（预留）
 │                  │
 ├──────────────────┤
 │                  │
 │  ⚙ 设置          │  ← Pipeline 专属设置
 │  ← 返回 Agent    │  ← 模式切换（回到 po-agent 聊天工作区）
 │  v0.1.0          │  ← 版本号
 │                  │
 └──────────────────┘
 ```

 **设计细节**：
 - 宽度 208px，与 LumenX GlobalSidebar 一致
 - 顶部品牌区：Logo + 产品名，点击回项目列表
 - 中间导航区：导航项数组驱动，天然支持未来扩展
 - 底部工具区：设置 + 模式切换 + 版本号
 - 选中态：左侧 accent 竖条 + 背景色高亮（参考 LumenX NavButton）
 - 玻璃质感：`backdrop-blur` + 半透明背景（参考 LumenX glass-border）

 导航项数据结构（可扩展）：
 ```typescript
 const PIPELINE_NAV_ITEMS = [
   { id: 'projects', icon: LayoutGrid, label: '项目工作区' },
   // 未来扩展:
   // { id: 'library', icon: Layers, label: '资产库' },
   // { id: 'templates', icon: FileText, label: '模板库' },
 ];
 ```

 ### 2.2 第二级：项目列表

 进入"项目工作区"后，右侧主区域显示项目列表：

 ```text
 ┌──────────────────┬───────────────────────────────────────┐
 │                  │                                       │
 │  PipelineSidebar │  ┌──────────────────────────────────┐ │
 │                  │  │  项目工作区          [+ 新建项目]  │ │
 │  ◆ 项目工作区     │  ├──────────────────────────────────┤ │
 │  □ 资产库        │  │                                  │ │
 │  □ 模板库        │  │  ┌────────┐ ┌────────┐ ┌──────┐ │ │
 │                  │  │  │ 项目 A  │ │ 项目 B  │ │ + 新 │ │ │
 │  ⚙ 设置          │  │  │ 封面图  │ │ 封面图  │ │      │ │ │
 │  ← 返回 Agent    │  │  │ 5 分镜  │ │ 3 分镜  │ │      │ │ │
 │  v0.1.0          │  │  │ 2 视频  │ │ 草稿    │ │      │ │ │
 │                  │  │  └────────┘ └────────┘ └──────┘ │ │
 │                  │  │                                  │ │
 │                  │  └──────────────────────────────────┘ │
 └──────────────────┴───────────────────────────────────────┘
 ```

 **项目卡片信息**：
 - 封面图（取自最终视频截图或分镜首帧）
 - 项目标题
 - pipeline 进度条（剧本✓ 资产✓ 分镜◐ 视频○ 合成○）
 - 分镜数 / 视频数 / 更新时间
 - 状态标签（草稿 / 生产中 / 已完成）

 **交互**：
 - 卡片点击 → 进入项目详情
 - 右上角"+ 新建项目" → 新建对话框（输入标题 + 剧本文本 + 画风选择）
 - 卡片右键菜单：复制 / 删除 / 导出 / 重命名
 - 支持网格 / 列表两种视图切换

 ### 2.3 第三级：项目详情

 点击项目后进入项目详情，这是核心工作面：

 ```text
 ┌──────────┬─────────────────────────────────┬──────────┐
 │          │                                 │          │
 │ 阶段     │     无限画布 (React Flow)         │  检查器  │
 │ 侧边栏   │                                 │          │
 │          │  所有 pipeline 节点在此可视化      │  选中    │
 │ ‹ 项目列表│                                 │  节点的  │
 │          │     ┌────┐    ┌────┐             │  属性    │
 │ ──────── │     │角色A│───→│分镜1│             │          │
 │ 剧本 ✓   │     └────┘    └─┬──┘             │  变体池  │
 │ 资产 ✓   │                 │                │          │
 │ 分镜 ◐   │     ┌────┐    ┌─▼──┐             │  Prompt  │
 │ 视频 ○   │     │场景B│    │视频1│             │  编辑    │
 │ 合成 ○   │     └────┘    └────┘             │          │
 │          │                                 │  生成    │
 │ ──────── │  ┌────────────────────────────┐  │  控制    │
 │ AI 面板  │  │ AI 对话区                   │  │          │
 │          │  │ > 分析剧本，提取角色...      │  │          │
 │ > 输入   │  │ [AI] 已提取3个角色，2个场景  │  │          │
 │   指令   │  │      3个节点已添加到画布     │  │          │
 │          │  └────────────────────────────┘  │          │
 │          │                                 │          │
 └──────────┴─────────────────────────────────┴──────────┘
 ```

 项目详情有四个区域：
 1. **阶段侧边栏**（左，256px）：pipeline 阶段导航 + 面包屑 + AI 对话面板
 2. **无限画布**（中，弹性）：React Flow，所有节点可视化
 3. **检查器**（右，320px，可折叠）：选中节点的属性/变体/生成控制
 4. **AI 对话区**（画布底部，可折叠）：用户与 Agent 交互

 ---

 ## 3. 阶段侧边栏设计

 参考 LumenX 的 `PipelineSidebar`，但融入 AI 对话面板：

 ```text
 ┌──────────────────┐
 │ ‹ 项目列表        │  ← 面包屑（返回项目列表）
 │   项目 A          │
 ├──────────────────┤
 │                  │
 │  阶段进度         │
 │  ─────────────   │
 │                  │
 │  ● 剧本     ✓    │  ← ready 状态（绿色勾）
 │  │               │     连接线到下一阶段
 │  ● 资产     ✓    │  ← ready 状态
 │  │               │
 │  ◐ 分镜     ◐    │  ← warn 状态（黄色，生产中）
 │  │               │
 │  ○ 视频     ○    │  ← idle 状态（空心圆，未开始）
 │  │               │
 │  ○ 合成     ○    │  ← idle 状态
 │                  │
 ├──────────────────┤
 │                  │
 │  AI 对话面板      │  ← 可折叠/展开
 │  ─────────────   │
 │  [AI] 已完成     │
 │  分镜提取，     │
 │  3个节点已      │
 │  添加到画布     │
 │                  │
 │  > 分析剧本...   │  ← 输入框
 │  [发送]          │
 │                  │
 └──────────────────┘
 ```

 **阶段状态系统**（参考 LumenX PipelineSidebar 的 status）：

 | 状态 | 视觉 | 含义 |
 |---|---|---|
 | `ready` | 绿色勾 ✓ | 该阶段已完成，有产物 |
 | `warn` | 黄色圆点 ◐ | 该阶段进行中或需关注 |
 | `idle` | 空心圆 ○ | 该阶段未开始 |
 | `gated` | 灰色锁 🔒 | 该阶段被上游阻塞 |

 阶段之间有连接线（竖线），形成 pipeline 进度可视化。
 点击阶段 = 切换画布过滤器，高亮对应类型的节点。

 **AI 对话面板**：
 - 位于阶段侧边栏底部，可折叠/展开
 - 展开时占侧边栏下半部分（最小 200px 高度）
 - 流式显示 Agent 回复
 - 显示工具调用进度（"正在提取角色..."、"正在生成图片..."）
 - 底部输入框 + 发送按钮
 - 折叠时只显示一行状态摘要（"AI: 3 个任务进行中"）

 ---

 ## 4. 无限画布设计

 ### 4.1 画布是项目详情的主视图

 画布占据项目详情的中心区域，是用户的主要工作面。所有 pipeline 实体
 在这里可视化展示和操作。

 ### 4.2 节点类型

 | 节点 | 视觉 | 包含信息 | 尺寸 |
 |---|---|---|---|
 | ScriptNode | 文档图标 + 标题 | 剧本摘要 + 实体提取状态 | 200×120 |
 | CharacterNode | 参考图缩略图 + 名称 | 角色名 + 描述 + 变体数 | 180×200 |
 | SceneNode | 参考图缩略图 + 名称 | 场景名 + 描述 + 变体数 | 240×160 |
 | PropNode | 参考图缩略图 + 名称 | 道具名 + 描述 | 140×140 |
 | StoryboardNode | 分镜预览图 + 编号 | 运镜 + 对白 + 状态 | 320×180 |
 | VideoNode | 视频缩略图 + 时长 | 状态 + 时长 + 来源分镜 | 200×120 |

 **节点视觉设计**（参考 LumenX 信息密度）：
 ```
 ┌────────────────┐
 │  ┌──────────┐  │
 │  │ 预览图    │  │  ← 缩略图区域
 │  └──────────┘  │
 │  角色名         │  ← 标题行
 │  3/5 已完成     │  ← 状态行（变体数/生成进度）
 │  ●○○            │  ← 状态指示器
 └────────────────┘
 ```

 - 选中态：accent 边框 + 微微放大
 - 生成中：底部进度条
 - 失败：红色边框 + 错误图标
 - 锁定：右上角锁图标

 ### 4.3 边类型

 | 边 | 含义 | 视觉 |
 |---|---|---|
 | references | 分镜引用角色/场景/道具 | 细实线，带箭头 |
 | source_of | 视频来源分镜 | 粗实线，带箭头 |
 | generates | 资产生成视频 | 虚线，带箭头 |
 | derives_from | 衍生资产来源 | 点线 |

 选中节点时，相关边高亮，无关边淡化。

 ### 4.4 画布交互

 - 拖拽节点移动位置
 - 框选多个节点
 - 滚轮缩放
 - 空白处拖拽平移画布
 - 双击节点 → 检查器展开完整编辑
 - 右键节点 → 上下文菜单（生成/重新生成/删除/复制/锁定）
 - 阶段侧边栏点击阶段 → 画布高亮对应节点类型，淡化其他

 ### 4.5 自动布局

 当 AI 创建新节点时，使用自动布局算法放置位置：
 - 剧本节点在左上
 - 角色/场景/道具节点在左侧区域，纵向排列
 - 分镜节点在中间区域，横向排列（按 index 顺序）
 - 视频节点在分镜节点右侧
 - 用户可随时手动调整位置，位置持久化

 ---

 ## 5. 检查器设计

 右侧检查器根据选中节点类型显示不同内容：

 | 选中节点 | 检查器内容 |
 |---|---|
 | ScriptNode | 剧本文本编辑（可滚动）+ 实体提取按钮 + 画风配置 |
 | CharacterNode | 参考图变体池 + Prompt 编辑 + 生成控制 + 属性（年龄/性别/服装） |
 | SceneNode | 参考图变体池 + Prompt 编辑 + 生成控制 + 属性（时间/光影/氛围） |
 | StoryboardNode | 分镜预览大图 + 运镜/对白/光影编辑 + 图片变体池 + 视频生成控制 |
 | VideoNode | 视频播放器 + Take 选择器 + 时长 + Prompt + 导出选项 |
 | 无选中 | Pipeline 概览：进度统计 + 待办事项 + 快速操作 |

 **变体池 UI**（参考 LumenX）：
 ```text
 变体池 (3/5)
 ┌──────┐ ┌──────┐ ┌──────┐
 │ 变体1 │ │ 变体2 │ │ 变体3 │
 │  ✓选中│ │      │ │  ★收藏│
 └──────┘ └──────┘ └──────┘
 [生成新变体]  [上传图片]
 ```

 ---

 ## 6. AI 驱动工作流

 ### 6.1 交互模型

 用户在 AI 对话面板输入自然语言指令，Agent 通过工具操作画布：

 ```text
 用户: "分析剧本，提取角色和场景"
     │
     ▼
 Agent 调用 analyze_script 工具
     ├── LLM 提取实体
     ├── 创建 PipelineAsset 记录
     ├── 创建 CanvasNode（自动布局位置）
     └── 返回结果
     │
     ▼
 画布实时出现新节点
 AI 回复: "已提取 3 个角色和 2 个场景，节点已添加到画布左侧"

 用户: "为所有角色生成参考图"
     │
     ▼
 Agent 调用 generate_asset_image 工具
     ├── 为每个角色创建 GenerationRun
     ├── Worker 异步处理
     ├── 每个 Run 完成时 SSE 推送
     └── 对应节点更新预览图
     │
     ▼
 AI 回复: "已创建 3 个生成任务，节点上显示进度条"
 ```

 ### 6.2 Agent 工具集

 通过 `AgentToolDefinition` port 定义，复用现有 AgentRuntime：

 | 工具 | 说明 | 画布效果 |
 |---|---|---|
 | `analyze_script` | LLM 提取角色/场景/道具 | 创建 CharacterNode/SceneNode/PropNode |
 | `generate_asset_image` | 生成资产参考图 (T2I/I2I) | 节点显示进度 → 更新预览图 |
 | `extract_storyboard` | LLM 提取分镜帧 | 创建 StoryboardNode + 连接边 |
 | `generate_frame_image` | 生成分镜图 (I2I) | StoryboardNode 更新预览 |
 | `generate_video` | 生成视频 (I2V/R2V) | 创建 VideoNode + 连接边 |
 | `select_final_take` | 选择最终视频 take | VideoNode 标记为最终选择 |
 | `assemble_and_export` | FFmpeg 合成导出 | 更新项目状态为已导出 |
 | `get_pipeline_state` | 读取当前进度 | 返回节点列表和状态 |

 ### 6.3 实时更新

 Agent 工具执行和 Generation Worker 状态变化都通过 SSE 推送到前端：
 - 工具执行开始 → AI 面板显示"正在执行..."
 - 工具执行完成 → 画布更新节点 + AI 面板显示结果
 - Generation Run 状态变化 → 节点更新进度/预览图
 - SSE 连接独立于 po-agent 的 Chat SSE，有自己的端点和事件类型

 ---

 ## 7. 视觉身份

 ### 7.1 参考但不是照抄 LumenX

 从 LumenX 借鉴的视觉元素：
 - **玻璃质感**：`backdrop-blur` + 半透明背景，营造层次感
 - **border 分割**：细边框 + glass-border 色调，区域分割清晰
 - **阶段进度可视化**：连接线 + 状态指示器，pipeline 进度一目了然
 - **节点信息密度**：缩略图 + 标题 + 状态行，紧凑但可读
 - **选中态动效**：accent 竖条 + 微动效，操作反馈明确

 不从 LumenX 照搬的：
 - Cyber Brutalism 配色（用更克制的专业色调）
 - 棱角几何字体（用清晰的无衬线体）
 - 霓虹渐变装饰

 ### 7.2 设计 Token

 Pipeline 工作台有自己的设计 token，独立于 po-agent 聊天工作区：

 ```css
 /* pipeline-workbench.css */

 /* 表面层 */
 --pl-surface: #ffffff;              /* 主表面 */
 --pl-surface-glass: rgba(255,255,255,0.6); /* 玻璃表面 */
 --pl-surface-elevated: #ffffff;     /* 浮层 */
 --pl-surface-subtle: #f8f9fa;      /* 次级表面 */

 /* 边框 */
 --pl-border: rgba(0,0,0,0.06);      /* 默认边框 */
 --pl-border-glass: rgba(0,0,0,0.04); /* 玻璃边框 */
 --pl-border-strong: rgba(0,0,0,0.12); /* 强调边框 */

 /* 文字 */
 --pl-text: #1a1a2e;                 /* 主文字 */
 --pl-text-secondary: #6b7280;       /* 次级文字 */
 --pl-text-muted: #9ca3af;           /* 弱化文字 */

 /* 强调色 */
 --pl-accent: #4f46e5;               /* 主强调色（靛蓝） */
 --pl-accent-soft: rgba(79,70,229,0.08); /* 强调色背景 */

 /* 状态色 */
 --pl-ready: #10b981;                /* 就绪（绿） */
 --pl-warn: #f59e0b;                 /* 警告（橙） */
 --pl-idle: #d1d5db;                 /* 空闲（灰） */
 --pl-error: #ef4444;                /* 错误（红） */

 /* 暗色主题（prefers-color-scheme: dark） */
 --pl-surface: #1a1a2e;
 --pl-surface-glass: rgba(26,26,46,0.6);
 --pl-border: rgba(255,255,255,0.08);
 --pl-text: #f3f4f6;
 --pl-text-secondary: #9ca3af;
 --pl-accent: #818cf8;
 ...
 ```

 ### 7.3 布局尺寸

 | 区域 | 宽度 | 说明 |
 |---|---|---|
 | 工作区侧边栏 | 208px | 固定，不缩放 |
 | 阶段侧边栏 | 256px | 可折叠到 48px（只显示图标） |
 | 检查器 | 320px | 可折叠到 0 |
 | AI 对话面板 | 侧边栏底部 | 可折叠，展开最小 200px 高 |
 | 画布 | 弹性 | 占据剩余空间 |
 | 项目卡片 | 280px | 网格最小宽度 |

 ---

 ## 8. 模式切换

 ### 8.1 两个独立应用

 po-agent 根布局根据 mode 渲染完全不同的应用：

 ```typescript
 // src/app/page.tsx
 export default function Home() {
   return (
     <I18nProvider>
       <AntDesignProvider>
         <WorkspaceModeRoot />
       </AntDesignProvider>
     </I18nProvider>
   );
 }
 ```

 ```typescript
 // src/layouts/workspace-mode-root.tsx
 "use client";
 import { AgentWorkspace } from "@/layouts/agent-workspace/agent-workspace";
 import { PipelineApp } from "@/layouts/pipeline-app/pipeline-app";
 import { useWorkspaceMode } from "@/layouts/workspace-mode-state";

 export function WorkspaceModeRoot() {
   const { mode } = useWorkspaceMode();
   return mode === "pipeline" ? <PipelineApp /> : <AgentWorkspace />;
 }
 ```

 模式状态用 Zustand + localStorage，只持久化 `mode` 一个字段。
 两个模式完全独立，切换时卸载旧模式，新模式从各自持久化层恢复。

 ### 8.2 切换入口

 - Agent 模式 sidebar 底部：一个"进入 Pipeline 工作台"按钮
 - Pipeline 模式 sidebar 底部：一个"返回 Agent 工作区"按钮
 - 两个入口都是底部工具区的最后一个按钮，视觉上一致

 ---

 ## 9. 目录结构

 ```text
 src/layouts/
 ├── workspace-mode-root.tsx           # 根级模式切换
 ├── workspace-mode-state.ts            # 模式状态 (只存 mode)
 ├── agent-workspace/                   # 现有 Agent 工作区 (不动)
 └── pipeline-app/                     # Pipeline 独立应用
     ├── pipeline-app.tsx               # 应用根组件
     ├── pipeline-sidebar.tsx           # 工作区侧边栏 (第一级)
     ├── project-list-view.tsx          # 项目列表 (第二级)
     ├── project-detail-view.tsx        # 项目详情 (第三级)
     ├── project-detail-sidebar.tsx     # 阶段侧边栏 + AI 面板
     └── state/
         ├── pipeline-app-store-provider.tsx
         └── pipeline-app-store.ts       # 全局状态 (当前项目/视图/选中)

 src/features/
 ├── pipeline-canvas/                   # 无限画布
 │   ├── pipeline-canvas.tsx
 │   ├── nodes/                          # 节点类型组件
 │   ├── edges/                          # 边类型组件
 │   └── state/
 │       └── pipeline-canvas-store.ts
 ├── pipeline-project/                  # 项目管理
 │   ├── project-card.tsx
 │   ├── project-creator.tsx
 │   └── state/
 ├── pipeline-inspector/               # 检查器
 │   ├── node-inspector.tsx
 │   ├── variant-pool.tsx
 │   ├── generation-control.tsx
 │   └── state/
 ├── pipeline-agent/                    # AI 驱动
 │   ├── agent-chat-panel.tsx
 │   ├── agent-stream.tsx
 │   └── state/
 │       └── pipeline-agent-store.ts
 └── pipeline-assembly/                # 合成导出
     ├── timeline-editor.tsx
     ├── export-panel.tsx
     └── state/
 ```

 ---

 ## 10. 隔离策略

 ### 10.1 完全隔离

 Pipeline 应用是一个独立产品，与 Agent 工作区零耦合：

 | 层 | 共享 | 规则 |
 |---|---|---|
 | `src/contracts/` | 是 | 两个模式都可 import HTTP 合同 |
 | `src/i18n/` | 是 | 共用国际化框架，Pipeline 有自己的字典命名空间 |
 | `src/components/ui/` | 是 | 通用 primitive 两个模式共用 |
 | `src/layouts/agent-workspace/` | 否 | Pipeline 不得 import |
 | `src/layouts/pipeline-app/` | 否 | Agent 不得 import |
 | `src/features/chat/` | 否 | Pipeline 不得 import |
 | `src/features/sessions/` | 否 | Pipeline 不得 import |
 | `src/features/content-generation/` | 否 | Pipeline 不得 import |
 | `src/features/pipeline-*` | 否 | Agent 不得 import |

 ### 10.2 后端共享

 共用后端 API 和基础设施：
 - `/api/generation/*` — Generation Run/Job/Artifact（现有）
 - `/api/models/*` — 模型配置（现有）
 - `/api/files/*` — 文件访问（现有）

 Pipeline 专属 API：
 - `/api/pipeline/projects/*` — 项目 CRUD
 - `/api/pipeline/assets/*` — 资产管理
 - `/api/pipeline/frames/*` — 分镜管理
 - `/api/pipeline/canvas/*` — 画布节点/边
 - `/api/pipeline/analyze/*` — LLM 剧本分析
 - `/api/pipeline/agent/*` — Agent SSE 流
 - `/api/pipeline/assemble/*` — 合成导出

 ### 10.3 视觉隔离

 Pipeline 应用有自己的 CSS 变量命名空间（`--pl-*` 前缀），
 不依赖 po-agent 聊天工作区的 `--workspace-bg`、`--canvas` 等变量。
 Ant Design ConfigProvider 可以用独立的 theme token。

 ---

 ## 11. 实施步骤

 ### Step 1: 应用骨架 + 模式切换
 1. 创建 `workspace-mode-root.tsx` + `workspace-mode-state.ts`
 2. 修改 `page.tsx` 使用 `WorkspaceModeRoot`
 3. Agent sidebar 底部加"进入 Pipeline"按钮
 4. 创建 `PipelineApp` 空壳（只显示品牌 + 空白工作区）
 5. Pipeline sidebar 底部加"返回 Agent"按钮
 6. 验证模式切换

 ### Step 2: 工作区侧边栏 + 项目列表
 1. 实现 `pipeline-sidebar.tsx`（品牌 + 导航项 + 底部工具）
 2. 实现 `project-list-view.tsx`（项目卡片网格）
 3. 实现 `project-creator.tsx`（新建项目对话框）
 4. 后端：Pipeline domain + repository + projects API
 5. SQLite migration 新增 pipeline 表

 ### Step 3: 项目详情 + 画布骨架
 1. 实现 `project-detail-view.tsx`（三栏布局）
 2. 实现 `project-detail-sidebar.tsx`（阶段导航 + AI 面板占位）
 3. 安装 `@xyflow/react`
 4. 实现 `pipeline-canvas.tsx` 基础画布
 5. 实现节点类型占位组件
 6. 实现 `pipeline-inspector` 占位

 ### Step 4: 视觉身份
 1. 定义 Pipeline 设计 token（`--pl-*` CSS 变量）
 2. 实现玻璃质感、border 分割、阶段进度可视化
 3. 实现节点视觉设计（缩略图 + 标题 + 状态）
 4. 实现选中态、生成中、失败态等交互状态
 5. 暗色主题适配

 ### Step 5: Domain + 后端 API
 1. 定义 `src/server/domain/pipeline.ts` 领域模型
 2. 定义 `src/server/ports/pipeline-repository.ts` + `llm-port.ts`
 3. 实现 SQLite repository
 4. 实现 `src/server/application/pipeline/` 各 service
 5. 创建 `src/app/api/pipeline/` Route Handlers
 6. 创建 `src/contracts/pipeline.ts` 前后端合同

 ### Step 6: 画布节点 + 数据绑定
 1. 实现各节点类型组件（连接后端数据）
 2. 实现边类型组件
 3. 画布 Store 连接后端 API
 4. 节点拖拽 + 自动布局
 5. 检查器面板按节点类型切换
 6. 变体池 UI

 ### Step 7: AI 驱动层
 1. 实现 `PipelineAgentToolProvider`（AgentToolDefinition）
 2. 实现 AI 对话面板（SSE 流式）
 3. Agent 工具执行 → 创建/修改画布节点
 4. 画布实时更新（SSE 推送）
 5. 思考过程和工具调用进度展示

 ### Step 8: 完整 pipeline 功能
 1. 剧本分析（LLM 实体提取 → 创建资产节点）
 2. 资产生成（T2I → 变体池 → 选择）
 3. 分镜提取（LLM → 创建分镜节点 + 连接资产）
 4. 分镜图生成（I2I → 变体池）
 5. 视频生成（I2V/R2V → VideoNode）
 6. 抽卡 + 最终选择
 7. 合成导出（FFmpeg）

 ---

 ## 12. 关键决策记录

 **为什么是独立应用而非附加功能**
 用户明确要求模式切换 = 进入新应用。Pipeline 工作台有自己的设计理念、
 视觉身份、信息架构，与聊天工作区是两个不同产品。共享后端基础设施，
 前端完全隔离。

 **为什么是三级导航而非直接进画布**
 参考用户认可的 LumenX 首页结构：工作区侧边栏 → 项目列表 → 项目详情。
 项目列表是必要的中间层——用户需要管理多个项目，看到每个项目的进度，
 选择要操作的项目。直接进画布等于假设用户只有一个项目在操作。

 **为什么 AI 对话面板在阶段侧边栏底部**
 画布需要最大化空间。AI 面板放在阶段侧边栏底部不占用画布空间，
 且与阶段导航同属左侧区域，交互动线连贯。折叠时只占一行高度，
 展开时最小 200px。如果需要更大对话区域，可以浮动弹出。

 **为什么阶段是画布过滤器而非独立屏幕**
 用户要求无限画布可视化。如果每个阶段是独立屏幕，用户在分镜阶段
 看不到角色和视频，失去全局视野。阶段作为画布过滤器：选中"分镜"
 时高亮 StoryboardNode，淡化其他，但全局仍可见。这符合"看见整个
 故事"的设计理念。

 **为什么有自己的设计 token**
 Pipeline 工作台是独立产品，视觉身份参考 LumenX 而非 po-agent 聊天
 工作区。独立的 `--pl-*` CSS 变量命名空间确保视觉隔离，不依赖聊天
 工作区的变量。未来如果两个模式的视觉风格需要统一，只需对齐 token。
