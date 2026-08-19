 # Toonflow 架构设计文档

 > 参考项目路径: `C:\Users\weilianglei\Desktop\Toonflow-app-master`
 > 定位: AI 短剧工厂，Agent 驱动的无限画布生产工作台

 ## 1. 总体架构

 Toonflow 采用 **TypeScript 全栈 + Electron 桌面客户端** 架构：

 ```text
 ┌─────────────────────────────────────────────────────┐
 │                 Electron 桌面壳                       │
 │  scripts/main.ts → Express(10588) + BrowserWindow     │
 └────────────────────────┬────────────────────────────┘
                          │ HTTP REST + Socket.IO
 ┌────────────────────────┴────────────────────────────┐
 │            Express 5 后端 (TypeScript)                │
 │  src/agents/    ← 三层 Agent 协作体系                   │
 │  src/routes/    ← 文件系统路由 (自动生成)               │
 │  src/socket/    ← WebSocket 实时通信                    │
 │  src/utils/     ← 公共库 (DB/AI/OSS/Agent)             │
 └────────────────────────┬────────────────────────────┘
                          │
 ┌────────────────────────┴────────────────────────────┐
 │          前端 (独立仓库 Toonflow-web, 内置编译产物)      │
 │  data/web/     ← 前端静态资源                           │
 └─────────────────────────────────────────────────────┘
 ```

 ### 技术栈

 | 层 | 技术 |
 |---|---|
 | 后端框架 | Express 5 |
 | 语言 | TypeScript 5.x |
 | 数据库 | SQLite (better-sqlite3 + knex) |
 | AI 集成 | Vercel AI SDK (OpenAI/Anthropic/Google/DeepSeek/智谱/MiniMax/通义/xAI) |
 | 本地推理 | @huggingface/transformers (ONNX 向量检索) |
 | 实时通信 | Socket.IO |
 | 桌面壳 | Electron 40 |
 | 图像处理 | Sharp |
 | 路由 | 文件系统路由 (core.ts 自动生成 router.ts) |
 | 认证 | JWT |

 ## 2. 后端模块结构

 ```text
 src/
 ├── app.ts                  # 应用入口 (Express + Socket.IO 初始化)
 ├── core.ts                 # 路由自动生成 (扫描 src/routes/**/*.ts)
 ├── router.ts               # 自动生成的路由注册文件
 ├── env.ts                  # 环境变量
 ├── err.ts                  # 错误处理
 ├── logger.ts               # 日志
 ├── agents/                 # AI Agent 模块 (核心)
 │   ├── scriptAgent/        # 剧本 Agent
 │   │   ├── index.ts        # 决策层 + 子 Agent 编排
 │   │   └── tools.ts        # Agent 工具定义
 │   └── productionAgent/    # 生产 Agent
 │       ├── index.ts        # 决策层 + 子 Agent 编排
 │       └── tools.ts        # Agent 工具定义 + FlowData schema
 ├── routes/                 # HTTP 路由 (文件系统路由)
 │   ├── novel/              # 小说管理 + 事件图谱
 │   ├── script/             # 剧本管理
 │   ├── scriptAgent/        # 剧本 Agent 计划数据
 │   ├── production/         # 生产工作台
 │   │   ├── workbench/      # 视频工作台 (生成/轨道/预览)
 │   │   ├── storyboard/     # 分镜管理
 │   │   ├── assets/         # 衍生资产管理
 │   │   └── editImage/      # 图像编辑流
 │   ├── assets/             # 资产管理
 │   ├── assetsGenerate/     # 资产生成
 │   ├── cornerScape/        # 分镜音频绑定
 │   ├── artStyle/           # 画风管理
 │   ├── project/            # 项目管理 + 导演手册 + 视觉手册
 │   ├── setting/            # 系统设置 (供应商/模型/技能/Prompt)
 │   ├── task/               # 任务管理
 │   └── ...                 # 其他路由
 ├── socket/                 # WebSocket
 │   ├── index.ts            # 命名空间注册
 │   ├── resTool.ts          # 响应工具 (消息/思考/进度)
 │   └── routes/
 │       ├── productionAgent.ts  # 生产 Agent socket
 │       └── scriptAgent.ts     # 剧本 Agent socket
 ├── utils/
 │   ├── agent/
 │   │   ├── memory.ts       # 持久化 Agent 记忆 (向量检索)
 │   │   ├── embedding.ts    # ONNX 本地 embedding
 │   │   └── skillsTools.ts  # Skill 文件化工具
 │   └── ...                 # DB/OSS/AI/路径工具
 ├── lib/                    # 公共库 (DB 初始化/响应格式)
 ├── middleware/             # 中间件 (字段验证)
 └── types/                  # TypeScript 类型声明
 ```

 ## 3. 三层 Agent 协作体系

 Toonflow 的核心架构创新是 **三层 Agent 协作**：

 ```text
 ┌─────────────────────────────────────────────────────────┐
 │                    决策层 (Decision Agent)                │
 │  读取用户意图 + 记忆 + 项目信息 → 决定调用哪个子 Agent       │
 │  scriptAgent: runDecisionAI()                            │
 │  productionAgent: runDecisionAI()                        │
 └──────────────┬──────────────────────────┬───────────────┘
                │                          │
 ┌──────────────┴────────────┐ ┌──────────┴───────────────┐
 │     执行层 (Execution       │ │    监督层 (Supervision     │
 │      Sub-Agents)            │ │     Sub-Agent)             │
 │                             │ │                            │
 │  ScriptAgent:               │ │  独立审阅任务               │
 │  · storySkeleton            │ │  · 质量检查                 │
 │  · adaptationStrategy       │ │  · 修订反馈                 │
 │  · script                   │ │  · 成片一致性               │
 │                             │ │                            │
 │  ProductionAgent:           │ │  返回结果给决策层             │
 │  · deriveAssets             │ └────────────────────────────┘
 │  · generateAssets           │
 │  · directorPlan             │
 │  · storyboardGen            │
 │  · storyboardPanel          │
 │  · storyboardTable          │
 └─────────────────────────────┘
 ```

 ### 3.1 决策层 (Decision Agent)

 - 读取 Skill 文件 (Markdown) 作为 system prompt
 - 注入记忆上下文 (RAG + 摘要 + 短期对话)
 - 注入项目信息 (模型配置、画风、章节数等)
 - 通过 Vercel AI SDK `streamText` 流式输出
 - 拥有工具: 记忆工具 + 业务工具 + 子 Agent 调用工具
 - `onFinish` 时将回复存入记忆

 ### 3.2 执行层 (Execution Sub-Agents)

 每个子 Agent 是一个 `tool()` 定义，由决策层按需调用：

 ```typescript
 tool({
   description: "运行执行subAgent来完成XX任务",
   inputSchema: { prompt: string },
   execute: async ({ prompt }) => {
     // 1. 读取对应的 Skill 文件作为 system prompt
     // 2. 注入美术/故事技能上下文
     // 3. 调用 runAgent() 执行子 Agent
     // 4. 子 Agent 拥有业务工具 (get_flowData, add_deriveAsset 等)
     // 5. 结果存入记忆
   }
 })
 ```

 子 Agent 通过 Socket.IO 与前端实时通信，展示思考过程和操作结果。

 ### 3.3 监督层 (Supervision Sub-Agent)

 - 独立执行审阅任务
 - 不拥有业务工具，只做分析判断
 - 结果返回给决策层，由决策层决定是否触发修订

 ## 4. 持久化 Agent 记忆系统

 ```text
 Memory (src/utils/agent/memory.ts)
 │
 ├── 三层记忆结构:
 │   ├── shortTerm: 最近 N 条未总结消息 (默认 5 条)
 │   ├── summaries: 历史摘要 (每 N 条消息压缩一次, 默认 3 条)
 │   └── rag: 向量相似搜索 (ONNX embedding + cosine similarity)
 │
 ├── 记忆写入 (add):
 │   1. 生成 embedding (ONNX 本地推理)
 │   2. 存入 SQLite memories 表
 │   3. 检查未总结消息数量
 │   4. 达到阈值时触发摘要生成 (LLM 压缩)
 │
 ├── 记忆读取 (get):
 │   1. shortTerm: 最近未总结消息
 │   2. summaries: 最近摘要
 │   3. rag: 向量搜索所有消息
 │
 ├── 深度检索 (deepRetrieve):
 │   1. 向量搜索 summary
 │   2. AI 判断相关性
 │   3. 展开查询原始 messages
 │
 └── 工具暴露 (getTools):
     └── deepRetrieve: 暴露为 Agent 工具
 ```

 记忆按 `isolationKey` 隔离 (通常是 projectId + scriptId 组合)。

 ## 5. Skill 文件化系统

 Toonflow 将 Agent 的核心提示词外化为 Markdown Skill 文件：

 ```text
 data/skills/
 ├── script_agent_decision.md          # 剧本 Agent 决策层
 ├── script_execution_skeleton.md      # 故事骨架执行
 ├── script_execution_adaptation.md    # 改编策略执行
 ├── script_execution_script.md        # 剧本生成执行
 ├── script_agent_supervision.md       # 剧本监督层
 ├── production_agent_decision.md      # 生产 Agent 决策层
 ├── production_execution_derive_assets.md
 ├── production_execution_generate_assets.md
 ├── production_execution_director_plan.md
 ├── production_execution_storyboard_gen.md
 ├── production_execution_storyboard_panel.md
 ├── production_execution_storyboard_table.md
 ├── production_agent_supervision.md
 ├── art_skills/                       # 画风技能
 │   └── {styleName}/driector_skills/*.md
 ├── story_skills/                     # 故事技能
 │   └── {storyName}/driector_skills/*.md
 └── production_skills/               # 生产技能
     └── *.md
 ```

 - Skill 文件使用 YAML frontmatter (name + description)
 - `scanSkills()` 扫描 glob 模式匹配的 Skill 文件
 - `createSkillTools()` 将 Skill 列表暴露为 `activate_skill` 工具
 - Agent 按需激活 Skill，加载完整指令
 - 支持在线编辑 (setting/skillManagement 路由)

 ## 6. 可编程供应商系统

 ```text
 setting/vendorConfig/
 ├── addVendor.ts          # 新增供应商 (支持编写 TS 逻辑)
 ├── addVendorModel.ts     # 新增模型
 ├── modelTest/            # 模型测试
 │   ├── textTest.ts       # 文本模型测试
 │   ├── imageTest.ts      # 图像模型测试
 │   └── videoTest.ts      # 视频模型测试
 └── ...
 ```

 - 供应商配置存储在 SQLite
 - 支持在设置中心直接编写供应商 TypeScript 逻辑
 - 使用 `vm2` 沙箱执行用户编写的供应商代码
 - 即时生效，无需改源码或重启
 - 支持多模型接入 (文本/图像/视频)

 ## 7. Socket.IO 实时通信

 ```text
 /api/socket/scriptAgent      # 剧本 Agent 命名空间
 /api/socket/productionAgent   # 生产 Agent 命名空间
 ```

 **连接生命周期**:
 1. 客户端携带 JWT token + isolationKey + projectId + scriptId 连接
 2. 服务端验证 token，创建 ResTool 实例
 3. `chat` 事件触发 `runDecisionAI()`
 4. `updateContext` 事件更新项目上下文
 5. `updateThinkConfig` 事件调整思考配置
 6. `stop` 事件中止当前生成

 **ResTool 响应工具** (`resTool.ts`):
 - `newMessage()`: 创建新的助手消息
 - `msg.thinking()`: 展示思考过程
 - `msg.text()`: 流式文本输出
 - `msg.complete()` / `msg.error()`: 完成/错误

 ## 8. 文件系统路由

 `core.ts` 在开发时自动扫描 `src/routes/**/*.ts` 并生成 `router.ts`：

 ```typescript
 // 自动生成的 router.ts
 import route1 from "./routes/novel/addNovel";
 import route2 from "./routes/script/addScript";
 // ...
 export default async (app: Express) => {
   app.use("/api/novel/addNovel", route1);
   app.use("/api/script/addScript", route2);
   // ...
 }
 ```

 - 文件名 → 路由路径映射
 - `[param]` 语法 → `:param` 路由参数
 - MD5 hash 避免无变化时重写文件

 ## 9. 数据库设计

 主要表结构 (SQLite + knex):

 | 表 | 说明 |
 |---|---|
 | `o_project` | 项目 (含 imageModel, videoModel, artStyle, directorManual) |
 | `o_novel` | 小说章节 (含 chapterData, event, eventState) |
 | `o_script` | 剧本 |
 | `o_assets` | 资产 (含 assetsId 关联衍生资产) |
 | `o_scriptAssets` | 剧本-资产关联 |
 | `o_storyboard` | 分镜 |
 | `o_assets2Storyboard` | 分镜-资产关联 |
 | `o_image` | 图像 (含 filePath, state, errorReason) |
 | `o_agentWorkData` | Agent 工作区数据 (JSON blob) |
 | `o_setting` | 系统设置 (key-value) |
 | `memories` | Agent 记忆 (含 embedding 向量) |

 ## 10. 无限画布工作台

 Toonflow 的前端 (独立仓库 Toonflow-web) 提供无限画布界面：

 - 以类无限画布形式组织剧本、角色、分镜、素材与视频节点
 - 支持自由编排、回溯与并行生产
 - 不受线性步骤限制
 - 节点化精调后回流工作台

 后端通过 `FlowData` schema 支撑画布数据:

 ```typescript
 FlowData = {
   script: string,           // 剧本内容
   scriptPlan: string,       // 拍摄计划
   assets: AssetItem[],      // 衍生资产 (含 derive 子资产)
   storyboardTable: string,  // 分镜表 (Markdown)
   storyboard: Storyboard[], // 分镜面板
 }
 ```

 ## 11. 与 po-agent 的架构差异

 | 维度 | Toonflow | po-agent |
 |---|---|---|
 | 编排模式 | Agent-first (LLM 决策流程) | Application Service (确定性) |
 | Agent 架构 | 三层协作 (决策/执行/监督) | Pi SDK Agent Runtime |
 | 记忆系统 | ONNX 向量检索 + 摘要 | Pi Session 对话历史 |
 | 实时通信 | Socket.IO | SSE |
 | 数据库 | SQLite (better-sqlite3 + knex) | SQLite (node:sqlite) |
 | AI 集成 | Vercel AI SDK (多供应商) | Pi SDK |
 | 供应商配置 | 可编程 TS (vm2 沙箱) | 固定 Pi SDK |
 | 提示词管理 | Skill 文件化 (Markdown) | Instructions (DB) |
 | 路由 | 文件系统自动生成 | Next.js Route Handlers |
 | 前端 | 独立仓库 (内置编译产物) | Next.js (同项目) |
 | 桌面壳 | Electron | Electron (规划中) |
