 # LumenX 架构设计文档

 > 参考项目路径: `C:\Users\weilianglei\Desktop\lumenx-main`
 > 定位: AI 原生短漫剧 & 视频创作平台，Pipeline-first 生产链路

 ## 1. 总体架构

 LumenX 采用 **Python 后端 + Next.js 前端 + 桌面壳** 的三层架构：

 ```text
 ┌─────────────────────────────────────────────────────┐
 │                   pywebview 桌面壳                   │
 │  main.py → uvicorn(127.0.0.1:17177) + webview 窗口   │
 └────────────────────────┬────────────────────────────┘
                          │ HTTP / WebSocket
 ┌────────────────────────┴────────────────────────────┐
 │              Starlette/FastAPI 后端 (Python)          │
 │  src/apps/comic_gen/  ← Studio Pipeline              │
 │  src/apps/playground/ ← 独立生成工具台                │
 │  src/models/          ← AI 模型适配器                  │
 │  src/audio/           ← TTS 语音合成                   │
 └────────────────────────┬────────────────────────────┘
                          │
 ┌────────────────────────┴────────────────────────────┐
 │              Next.js 前端 (frontend/)                │
 │  src/components/modules/  ← 业务模块                   │
 │  src/store/              ← Zustand 状态                │
 └─────────────────────────────────────────────────────┘
 ```

 ### 技术栈

 | 层 | 技术 |
 |---|---|
 | 后端框架 | Starlette + Uvicorn (非标准 FastAPI，但兼容) |
 | 前端框架 | Next.js (App Router 或 Pages Router) |
 | 桌面壳 | pywebview (Edge Chromium on Windows) |
 | 数据模型 | Pydantic v2 BaseModel |
 | AI 模型 SDK | DashScope OpenAI-compatible + 各厂商原生 SDK |
 | 媒体处理 | FFmpeg (视频拼接/混音) |
 | 对象存储 | 阿里云 OSS (可选) |
 | 配置 | `.env` + `~/.lumen-x/config.json` |

 ## 2. 后端模块结构

 ```text
 src/
 ├── apps/
 │   ├── comic_gen/          # Studio 后端 (核心)
 │   │   ├── api.py           # HTTP 路由 (190KB, ~100 个端点)
 │   │   ├── pipeline.py      # 业务编排核心 (224KB)
 │   │   ├── models.py        # Pydantic 数据模型
 │   │   ├── llm.py           # LLM 驱动的剧本分析/分镜提取/Prompt 润色
 │   │   ├── llm_adapter.py   # 统一 LLM 调用接口 (DashScope/OpenAI)
 │   │   ├── assets.py        # 资产生成 (角色/场景/道具)
 │   │   ├── storyboard.py    # 分镜图生成
 │   │   ├── video.py         # 视频片段生成
 │   │   ├── audio.py         # TTS 配音
 │   │   ├── export.py        # 成片导出 (FFmpeg)
 │   │   ├── prompt_assembly.py # Prompt 拼装纯函数
 │   │   └── style_presets.json # 预设画风
 │   └── playground/         # 独立生成工具台后端
 ├── models/                 # AI 模型适配器
 │   ├── base.py             # VideoGenModel 抽象基类
 │   ├── factory.py          # 模型工厂
 │   ├── wanx.py             # Wan 2.7 (图/视频)
 │   ├── kling.py            # Kling V3
 │   ├── vidu.py             # Vidu Q3
 │   ├── mulerouter.py       # MuleRun (Seedance/GPT-Image)
 │   ├── doubao.py           # 豆包
 │   ├── qwen_vl.py           # Qwen 视觉理解
 │   └── image.py            # 图像生成统一适配
 ├── audio/                  # TTS (CosyVoice/Qwen3-TTS)
 └── utils/                  # 日志/OSS/配置/路径安全
 ```

 ### 2.1 ComicGenPipeline — 核心编排器

 `pipeline.py` 中的 `ComicGenPipeline` 类是整个 Studio 的业务核心，承担：

 - 项目 CRUD (create_project, get_script, delete_project)
 - 剧本解析 (extract_preview, reparse_project)
 - 资产生成 (generate_assets, generate_asset, create_asset_generation_task)
 - 分镜生成 (analyze_text_to_frames, generate_storyboard, refine_frame)
 - 视频生成 (generate_video, create_video_task, process_motion_ref_task)
 - 音频生成 (generate_audio)
 - 成片导出 (export_project)
 - 资产管理 (toggle_lock, toggle_starred, update_image, update_attributes)
 - 孤儿任务恢复 (_recover_orphan_tasks)

 数据持久化采用 **JSON 文件**（`output/projects.json`, `output/series.json`），而非数据库。
 每个 `Script` 对象包含完整的 characters/scenes/props/frames/video_tasks 树。

 ### 2.2 模型适配器层

 ```python
 # base.py — 抽象接口
 class VideoGenModel(ABC):
     @abstractmethod
     def generate(self, prompt, output_path, **kwargs) -> Tuple[str, float]:
         ...

 # factory.py — 工厂模式
 class ModelFactory:
     @staticmethod
     def create_model(config):
         # 按 model_name 分发到 WanxModel / KlingModel / ViduModel / MuleRouterVideoModel
 ```

 每个适配器封装特定厂商的异步轮询逻辑：
 - 提交任务 → 获取 task_id → 轮询状态 → 下载结果 → 上传 OSS
 - 统一返回 `(local_path, api_duration)` 元组

 ### 2.3 LLM 适配器

 `llm_adapter.py` 提供统一的 LLM 调用接口：
 - 支持 DashScope (qwen3.7-plus → qwen3.6-plus → qwen-plus fallback chain)
 - 支持 OpenAI-compatible 端点
 - 模型不可用时自动降级，鉴权/限流错误直接抛出

 ## 3. 前端模块结构

 ```text
 frontend/src/
 ├── app/                    # Next.js 路由
 ├── components/
 │   ├── modules/            # 业务模块
 │   │   ├── ScriptEditor/   # 剧本编辑器 (富文本 + 实体面板)
 │   │   ├── storyboard-r2v/ # 分镜工作台 (R2V/I2V)
 │   │   ├── cast/           # 角色管理
 │   │   └── playground/     # 独立生成工具台
 │   ├── canvas/             # 画布组件
 │   ├── layout/             # 全局布局
 │   ├── library/            # 资产库
 │   ├── modals/             # 弹窗
 │   ├── project/            # 项目管理
 │   ├── series/             # 系列管理
 │   ├── settings/           # 设置
 │   └── shared/             # 共享组件
 ├── store/                  # Zustand 全局状态
 └── lib/                    # 工具函数
 ```

 ### 3.1 ScriptEditor 模块

 剧本编辑器是一个复杂的富文本编辑组件，包含：
 - `components/` — 编辑器内部组件
 - `dialogs/` — 对话框
 - `extensions/` — 编辑器扩展
 - `hooks/` — React hooks
 - `panels/` — 侧边面板
 - `sidebar/` — 侧边栏
 - `toolbar/` — 工具栏
 - `views/` — 视图切换

 ### 3.2 storyboard-r2v 模块

 分镜工作台支持两种生成模式：
 - `t2i_i2v` — 先生首帧图，再图生视频 (画面优先)
 - `direct_r2v` — 直接参考生视频 (节奏优先)
 - `shot-panel/` — 单镜头控制面板

 ## 4. 数据模型设计

 LumenX 的核心数据模型定义在 `models.py`，采用 Pydantic v2：

 ```text
 Script (项目)
 ├── characters: List[Character]     # 角色资产
 │   └── reference_sheet: AssetUnit   # 统一参考图 (R2V v2)
 │       ├── image_variants: List[ImageVariant]  # 静态图变体池
 │       └── video_variants: List[VideoVariant] # 动态参考视频池
 ├── scenes: List[Scene]             # 场景资产
 ├── props: List[Prop]               # 道具资产
 ├── frames: List[StoryboardFrame]   # 分镜帧
 │   ├── dialogue_structured         # 结构化对白
 │   ├── camera_movement_structured # 结构化运镜
 │   ├── blocking                   # 空间站位
 │   ├── lighting                   # 光影数据
 │   ├── audio_note                 # 音效标注
 │   ├── image_asset: ImageAsset    # 分镜图变体池
 │   ├── rendered_image_asset       # 渲染图变体池
 │   └── video_tasks                # 视频任务列表
 ├── video_tasks: List[VideoTask]    # 全局视频任务
 ├── art_direction: ArtDirection     # 美术指导
 ├── model_settings: ModelSettings   # 模型选择
 ├── prompt_config: PromptConfig    # 自定义 Prompt
 └── series_id / episode_number     # 系列关联

 Series (系列)
 ├── characters/scenes/props         # 共享资产库
 ├── art_direction                  # 统一画风
 ├── custom_voices: List[CustomVoice] # 自定义音色池
 └── episode_ids: List[str]         # 剧集列表

 GlobalAssetLibrary (全局资产库)
 └── characters/scenes/props         # 跨项目共享资产
 ```

 ### 4.1 资产解析层级

 LumenX 采用三级资产解析器 (Episode → Series → Global)：
 - Episode 级资产优先
 - Series 级资产补充缺失的 id
 - Global 级资产作为最低层兜底

 ### 4.2 变体池设计

 每个 `AssetUnit` 维护独立的 `image_variants` 和 `video_variants` 列表：
 - `selected_id` 指向当前选中变体
 - `is_favorited` 标记收藏变体 (不会被自动删除)
 - `MAX_VARIANTS_PER_ASSET = 10` 限制变体数量
 - 支持用户上传源文件 (`is_uploaded_source`)

 ## 5. API 设计

 LumenX 后端暴露约 100 个 HTTP 端点，主要分组：

 | 分组 | 端点示例 | 说明 |
 |---|---|---|
 | 项目管理 | `POST /projects`, `GET /projects/{id}` | Script CRUD |
 | 剧本解析 | `POST /projects/{id}/extract_preview`, `PUT /projects/{id}/reparse` | LLM 实体提取 |
 | 资产生成 | `POST /projects/{id}/generate_assets`, `POST /projects/{id}/assets/generate` | 角色/场景/道具图 |
 | 分镜 | `POST /projects/{id}/storyboard/analyze`, `POST /projects/{id}/generate_storyboard` | 分镜提取+生成 |
 | 视频 | `POST /projects/{id}/generate_video`, `POST /projects/{id}/video_tasks` | I2V/R2V 视频生成 |
 | 音频 | `POST /projects/{id}/generate_audio` | TTS 配音 |
 | 系列 | `POST /series`, `GET /series/{id}/assets` | 系列管理 |
 | 资产库 | `GET /library/assets`, `POST /library/assets/promote` | 全局资产 |
 | 任务 | `GET /tasks/{task_id}` | 异步任务状态 |
 | 导出 | `POST /projects/{id}/export` (pipeline 内) | 成片导出 |

 异步任务采用 **task_id 轮询模式**：创建任务返回 task_id，前端轮询 `/tasks/{task_id}` 获取状态。

 ## 6. 关键架构特征

 ### 6.1 Pipeline-first 而非 Agent-first

 LumenX 的核心是 `ComicGenPipeline` 类，它是一个 **确定性的编排器**：
 - 每个阶段 (剧本→分镜→资产→视频→合成) 有明确的入口方法
 - LLM 用于阶段内部的增强 (实体提取、Prompt 润色)，但不决定流程走向
 - 用户通过 UI 手动触发每个阶段

 这与 Toonflow 的 Agent-first 架构形成鲜明对比。

 ### 6.2 JSON 文件持久化

 不使用数据库，整个项目状态序列化为 `output/projects.json`。
 优点是简单、可调试；缺点是并发写入需要加锁、大数据量性能差。

 ### 6.3 OSS 可选层

 所有媒体文件优先存本地 `output/`，OSS 配置后自动镜像上传。
 API 返回时将 Object Key 转换为签名 URL。

 ### 6.4 多模型统一适配

 通过 `ModelFactory` + `VideoGenModel` 抽象基类统一 10+ 个 AI 模型，
 每个适配器处理特定厂商的异步轮询、参数映射和错误重试。

 ## 7. 与 po-agent 的架构差异

 | 维度 | LumenX | po-agent |
 |---|---|---|
 | 后端语言 | Python | TypeScript (Node.js) |
 | 后端框架 | Starlette/Uvicorn | Next.js Route Handlers |
 | 数据持久化 | JSON 文件 | SQLite (node:sqlite) |
 | 编排模式 | Pipeline 类 (确定性) | Application Service + Worker |
 | AI 集成 | 直接调用厂商 SDK | Pi SDK + Agent Runtime |
 | 实时通信 | HTTP 轮询 | SSE |
 | 前端框架 | Next.js | Next.js (相同) |
 | 桌面壳 | pywebview | Electron (规划中) |
 | 架构分层 | 单体 (api.py + pipeline.py) | domain/ports/application/transport |
