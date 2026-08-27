# Po Agent 文档导航

本文档是 `docs/` 目录的统一入口。新增文档时，应优先放入对应分类，避免继续堆放在根目录。

## 核心契约

这两份文档保留在 `docs/` 根目录，因为开发规范和仓库入口将它们作为稳定路径引用。

| 文档 | 用途 |
| --- | --- |
| [architecture.md](./architecture.md) | 系统分层、模块边界、依赖方向和运行时架构 |
| [agent-api-reference.md](./agent-api-reference.md) | 公共 HTTP API、数据结构、错误码和 SSE 合同 |

## 设计方案

位于 [`designs/`](./designs/)，记录功能设计、边界决策和待评审方案。

| 文档 | 主题 |
| --- | --- |
| [AI 驱动内容生成](./designs/ai-driven-content-generation-design.md) | 内容生成领域、任务执行与工作区设计 |
| [Chat Composer 内容生成](./designs/chat-content-generation-composer-design.md) | Chat Composer 与内容生成能力整合 |
| [自动上下文压缩](./designs/compact-context-design.md) | 上下文压缩策略与生命周期 |
| [Content Generation Provider Catalog](./designs/content-generation-provider-catalog-design.md) | 跨供应商 Provider Module、Catalog 与执行快照 |
| [千问内容生成 Provider](./designs/qianwen-content-generation-provider-design.md) | 千问图像/视频 API、多供应商设置、DashScope Profile 与临时 OSS 集成 |
| [模型配置可用性闭环](./designs/model-provider-configuration-validation-design.md) | Provider 与模型配置验证 |
| [RunningHub API Catalog（已被替代）](./designs/runninghub-api-catalog-design.md) | RunningHub Catalog 的早期设计 |
| [Skill Catalog Artifact 安装](./designs/skill-catalog-artifact-installation-design.md) | 自有 Skill 目录与单项 Artifact 安装 |
| [系统提示词与项目指令](./designs/system-prompt-and-project-instructions-design.md) | 系统提示词、项目指令和公开接口设计 |

## 使用指南与规范

位于 [`guides/`](./guides/)，用于日常开发、配置和扩展操作。

| 文档 | 用途 |
| --- | --- |
| [RunningHub API 接入手册](./guides/runninghub-api-onboarding-guide.md) | 添加新的 RunningHub 内容生成 API |
| [千问内容生成故障排查](./guides/qianwen-generation-troubleshooting.md) | 千问并发、退避、限流恢复和显式付费 Smoke |
| [Skill Pack 格式规范](./guides/skill-pack-format.md) | Skill Pack 权威格式和校验要求 |
| [Skill Pack 使用与命名](./guides/skill-packs.md) | Skill Pack 设计、使用方式与命名说明 |

## 构建、发布与部署

位于 [`operations/`](./operations/)，记录 CI/CD、桌面端和容器部署。

| 文档 | 用途 |
| --- | --- |
| [CI/CD 设计](./operations/ci-cd-design.md) | GitHub Actions 架构与安全设计 |
| [CI/CD 使用手册](./operations/ci-cd-usage.md) | 工作流配置和发布操作 |
| [Desktop 部署](./operations/desktop-deploy.md) | Electron 桌面版构建与部署 |
| [Docker 部署](./operations/docker-deploy.md) | Docker 镜像、数据卷和生产部署 |

## 计划与迁移记录

位于 [`plans/`](./plans/)，记录一次性升级、集成和迁移计划。完成后的计划仍可作为历史依据，但不应当作当前系统契约。

| 文档 | 用途 |
| --- | --- |
| [Pi SDK 升级计划](./plans/pi-sdk-upgrade-plan.md) | Pi SDK 版本升级范围与验证步骤 |
| [pi-web-access 集成计划](./plans/pi-web-access-integration-plan.md) | Web Access 内置集成方案 |
| [Po Agent 更名计划](./plans/rename-to-po-agent.md) | 项目名称迁移记录 |

## 专题资料

| 目录 | 用途 |
| --- | --- |
| [`RunningHubAPIs/`](./RunningHubAPIs/) | RunningHub 原始 API 文档和模型说明；桌面构建会打包此目录 |
| [`QwenApis/`](./QwenApis/) | 千问 AI 平台图像与视频 API 参考快照、资料索引与协议矩阵 |
| [`pipline-studio/`](./pipline-studio/) | Pipeline Studio 专题设计与重构计划 |

## 归档规则

- 架构和公共 API 合同保留在根目录。
- 功能或技术设计放入 `designs/`。
- 可重复执行的操作说明和格式规范放入 `guides/`。
- 构建、发布、CI/CD 和部署资料放入 `operations/`。
- 一次性升级、迁移和集成计划放入 `plans/`。
- 供应商原始资料放入对应专题目录，不与项目设计文档混放。
- 新增、移动或重命名文档后，同步更新本索引和仓库内引用。
