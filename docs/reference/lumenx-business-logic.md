 # LumenX 业务逻辑文档

 > 参考项目路径: `C:\Users\weilianglei\Desktop\lumenx-main`
 > 核心文件: `src/apps/comic_gen/pipeline.py`, `llm.py`, `models.py`

 ## 1. 完整生产 Pipeline

 LumenX Studio 的核心业务链路：

 ```text
 原始文本 ──→ 剧本分析 ──→ 资产生成 ──→ 分镜生成 ──→ 视频生成 ──→ 音频配音 ──→ 合成导出
  (小说)     (LLM 提取)   (T2I/I2I)    (I2I 渲染)   (I2V/R2V)    (TTS)       (FFmpeg)
     │           │            │             │            │            │            │
     │           ▼            ▼             ▼            ▼            ▼            ▼
     │      Character     ImageAsset    StoryboardFrame  VideoTask   Audio URL   Merged MP4
     │      Scene         (变体池)      (结构化分镜)      (抽卡池)    (per-frame)  (最终成片)
     │      Prop
     └──→ Script.original_text
 ```

 ## 2. 阶段详解

 ### 2.1 剧本分析阶段 (Script Analysis)

 **入口**: `create_project(title, text)` → `extract_preview(script_id, text)`

 **LLM 驱动的实体提取** (`llm.py` → `ScriptProcessor`):

 1. 用户输入原始小说/剧本文本
 2. LLM (qwen3.7-plus) 分析文本，提取结构化实体：
    - `characters`: 角色列表 (name, description, age, gender, clothing)
    - `scenes`: 场景列表 (name, description, time_of_day, lighting_mood)
    - `props`: 道具列表 (name, description)
 3. LLM 分析视觉风格，生成 `ai_recommendations` (推荐画风)
 4. 结果写入 `Script.characters/scenes/props` 和 `ArtDirection`

 **reparse**: 用户修改原文后重新解析，保留已生成资产。

 **sync_descriptions**: 从剧本实体同步描述到已有资产，保持一致。

 ### 2.2 资产生成阶段 (Asset Generation)

 **入口**: `generate_assets(script_id)` 或 `generate_asset(script_id, asset_id, asset_type)`

 **资产生成流程**:

 ```text
 Character/Scene/Prop
     │
     ├──→ 构建 Prompt (description + style_preset + style_prompt)
     │
     ├──→ 调用 T2I 模型 (wanx/qwen-image/gpt-image-2)
     │    └── 生成参考图 → 存入 ImageAsset.variants
     │
     ├──→ (可选) I2I 精修 — 用参考图做 image-to-image
     │    └── 生成精修图 → 追加到 variants
     │
     └──→ (可选) 生成动态参考视频 (Motion Reference)
          └── I2V 生成 → 存入 AssetUnit.video_variants
 ```

 **变体池机制**:
 - 每次生成追加一个 `ImageVariant` 到 `variants` 列表
 - `selected_id` 自动指向最新变体
 - 用户可手动切换 `selected_id`、收藏 (`is_favorited`)、上传源文件
 - `MAX_VARIANTS_PER_ASSET = 10`，超限时自动删除非收藏的最旧变体

 **异步任务**:
 - `create_asset_generation_task` 创建任务，返回 task_id
 - `process_asset_generation_task` 在后台处理
 - `get_asset_generation_task_status` 查询状态
 - `_recover_orphan_tasks` 启动时恢复中断的任务

 **三级资产解析**:
 - Episode 级资产优先
 - Series 级资产补充 (共享角色/场景/道具)
 - Global 级资产兜底 (跨项目复用)

 ### 2.3 分镜生成阶段 (Storyboard Generation)

 **入口**: `analyze_text_to_frames(script_id, text)` → `generate_storyboard(script_id)`

 **分镜提取** (LLM 驱动):

 1. LLM 分析剧本，生成结构化分镜帧 (`StoryboardFrame`):
    - `visual_description`: 画面描述 (环境+角色表演+物理动作)
    - `dialogue_structured`: 结构化对白 (speaker + line + emotion + delivery)
    - `camera_movement_structured`: 结构化运镜 (primary + secondary + speed)
    - `blocking`: 空间站位 (stage subjects + camera relation)
    - `lighting`: 光影数据 (direction + color_temp + quality)
    - `audio_note`: 音效/环境音标注
    - `shot_size`: 景别 (大特写/特写/近景/中景/全景/远景/大远景)
    - `transition_hint`: 转场方式

 2. **Prompt 拼装** (`prompt_assembly.py` → `assemble_prompt`):
    - 优先级: 主体/动作 → 场景/光影 → 运镜 → 景别/角度 → 角色外观
    - 自动注入 `[characterN:name]` 参考图标签 (HappyHorse R2V 用)
    - 对白注入: 将台词编织为视觉描述 ("角色张嘴说话，台词：「...」")

 3. **Prompt 润色** (LLM 驱动):
    - `polish_storyboard_prompt`: 润色分镜图 Prompt (Prompt C)
    - `polish_video_prompt`: 润色 I2V 视频 Prompt (Prompt D)
    - `polish_r2v_prompt`: 润色 R2V 视频 Prompt (Prompt E)
    - 支持自定义 system prompt 覆盖

 4. **分镜图生成** (`storyboard.py` → `StoryboardGenerator`):
    - 收集参考图 (角色参考图 + 场景参考图)
    - 调用 I2I 模型生成分镜图
    - 结果存入 `frame.rendered_image_asset.variants`
    - 自动上传 OSS (如配置)

 **R2V 工作台持久化**:
 - `workbench_tab_mode`: 记录用户选择的生成模式 (t2i_i2v / direct_r2v)
 - `t2i_image_urls`: T2I 首帧历史 (FIFO, max 10)
 - `t2i_selected_index`: 当前选中的首帧索引
 - `workbench_generate_count`: 批量生成数量 (1-6)

 ### 2.4 视频生成阶段 (Video Generation)

 **入口**: `generate_video(script_id)` 或 `create_video_task(...)`

 **两种生成模式**:

 ```text
 模式 1: I2V (Image-to-Video) — "画面优先"
   T2I 生成首帧 → I2V 生成视频
   适合: 需要精确控制画面构图的镜头

 模式 2: R2V (Reference-to-Video) — "节奏优先"
   直接用角色/场景参考图 + 文本描述生成视频
   适合: 需要保持角色一致性的快速生成
 ```

 **VideoTask 生命周期**:

 ```text
 pending → processing → completed
                     └→ failed (error 字段记录原因)
 ```

 - `create_video_task`: 创建任务，支持 10+ 模型参数 (wan/kling/vidu/seedance/happyhorse)
 - 任务参数包括: duration, resolution, seed, model, shot_type, generation_mode
 - `reference_video_urls`: R2V 参考视频 (max 3)
 - `reference_image_urls`: HappyHorse R2V 参考图 (max 9)
 - `provider_task_id` / `provider_request_id`: 厂商侧任务 ID (用于诊断)

 **抽卡机制**:
 - 每个分镜可生成多个 VideoTask (批量抽卡)
 - `is_starred`: 用户标记候选 (多选)
 - `label`: 用户附加短标签 (≤20 字符)
 - `final_take_id`: 最终选定 (在 Assembly 阶段设置)
 - `is_video_pinned`: 手动固定视频，不被自动选择覆盖

 **音频配音**:
 - `generate_audio`: 为分镜生成 TTS 对白音频
 - 支持 CosyVoice / Qwen3-TTS 多音色
 - `dialogue_text_hash`: 检测对白变更，标记音频为 STALE
 - `dubbed_video_url`: 配音后的视频 (TTS 音轨叠加原视频)
 - `bg_audio_url`: 背景音频 (Demucs 分离人声后的 no_vocals 轨道)
 - `dub_offset_ms`: 音频偏移 (ms)

 ### 2.5 合成导出阶段 (Assembly & Export)

 **入口**: `export_project(script_id, options)`

 **合成流程**:

 1. 收集每个分镜的 `final_take_id` 指定的视频
 2. FFmpeg 拼接视频片段
 3. 混音: 对白 + BGM + 音效 (按 `mix_settings` 增益)
 4. 可选: 烧录字幕
 5. 输出最终 MP4 到 `output/export/`

 **BGM 混音**:
 - `bgm_url`: 背景音乐 (预设库或用户上传)
 - `mix_settings`: `{"dialogue": 100, "bgm": 35, "sfx": 60}` per-track gain

 ## 3. 系列与剧集管理

 LumenX 支持系列 (Series) 模式，管理多集连续剧：

 ```text
 Series
 ├── 共享资产库 (characters/scenes/props)
 ├── 统一画风 (art_direction)
 ├── 自定义音色池 (custom_voices)
 ├── 模型设置 (model_settings)
 └── Episode 1, 2, 3... (每个是一个 Script)
     └── 继承 Series 级配置
 ```

 **跨集连续性**:
 - `last_episode_summary_cache`: AI 生成的上一集摘要 (用于 "Previously on..." 片头)
 - `next_hook_cache`: AI 预测的下一集开场悬念
 - 摘要缓存通过 revision hash 失效，原文变更时自动重建

 ## 4. 美术指导系统

 ```text
 ArtDirection
 ├── selected_style_id        # 选中的画风 ID
 ├── style_config             # 完整画风配置
 ├── custom_styles            # 用户自定义画风
 └── ai_recommendations       # AI 推荐画风
 ```

 - `style_presets.json`: 内置预设画风 (19KB, 多种风格)
 - 用户可选择预设、自定义或让 AI 推荐
 - 画风配置注入所有资产生成的 Prompt

 ## 5. 模型选择与配置

 ```text
 ModelSettings
 ├── t2i_model         # 文生图模型 (资产生成)
 ├── i2i_model         # 图生图模型 (分镜渲染)
 ├── image_model       # 统一图像模型
 ├── i2v_model         # 图生视频模型
 ├── r2v_model         # 参考生视频模型
 └── *_aspect_ratio    # 各类型宽高比
 ```

 **Provider 路由**:
 - `ProviderRoutingConfig`: Kling/Vidu/PixVerse 可选 DashScope 代理或原厂直连
 - `ProviderBackend.DASHSCOPE` vs `ProviderBackend.VENDOR`

 ## 6. 自定义 Prompt 系统

 ```text
 PromptConfig
 ├── entity_extraction       # 实体提取 Prompt (Prompt A)
 ├── storyboard_extraction  # 分镜提取 Prompt (Prompt B)
 ├── storyboard_polish       # 分镜润色 Prompt (Prompt C)
 ├── video_polish           # I2V 润色 Prompt (Prompt D)
 ├── r2v_polish             # R2V 润色 Prompt (Prompt E)
 ├── style_analysis         # 风格分析 Prompt
 └── polish_model           # 润色使用的 LLM 模型 (可覆盖)
 ```

 每个阶段的 system prompt 都可被用户自定义覆盖，空字符串表示用系统默认。

 ## 7. 关键业务约束

 ### 7.1 一致性追踪
 - `is_consistent`: 角色派生资产是否与主图一致
 - `image_updated_at` / `video_updated_at`: 时间戳追踪资产更新
 - `dialogue_text_hash`: 对白音频的 staleness 检测

 ### 7.2 锁定与收藏
 - `locked`: 防止资产/分镜被重新生成覆盖
 - `starred` / `is_favorited`: 用户收藏，不被自动清理
 - `is_video_pinned`: 手动固定视频选择

 ### 7.3 安全
 - `_validate_safe_id`: 验证 ID 格式
 - `_safe_resolve_path`: 路径穿越防护
 - `LibraryAssetInUseError`: 资产库删除保护

 ## 8. 工作流模式

 LumenX 支持两种工作流模式：

 | 模式 | 说明 | 适用场景 |
 |---|---|---|
 | `i2v_legacy` | 先生首帧图 → I2V 生视频 | 需要精确画面控制 |
 | `r2v` | 直接用参考图 R2V 生视频 | 需要快速保持角色一致性 |

 以及两种内容模式：
 | 模式 | 说明 |
 |---|---|
 | `scripted` | 传统流程 (先解析剧本实体) |
 | `freeform` | 用户直接创建镜头/角色 (无剧本解析) |

 `default_generation_mode` 在 Series 级设置，新 Episode 继承，per-shot 可覆盖。
