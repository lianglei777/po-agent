# Po Agent

Po Agent 是 Pi 编码智能体的本地 Web 界面。它将 Agent 会话变成一个可导航、可检查的工作区：发起会话、实时查看推理过程和工具调用、浏览和打开文件、切换模型和技能、恢复或 Fork 历史会话。面向在本地运行 Pi Agent 的独立开发者。

界面设计目标是精确、冷静、实用——信息密集但不杂乱，让开发者保持对 Agent 的控制，而不是被 Agent 干扰。

## 核心功能

- **会话管理**：列出、重命名、删除会话，支持树形浏览、Fork 分支和历史恢复
- **Agent 交互**：通过 SSE 实时流式查看推理、消息、工具执行、重试和压缩事件，支持中断与引导
- **模型配置**：可视化管理 Provider 和模型，支持远程模型发现、隔离测试和 API Key / OAuth 认证
- **文件浏览**：在已登记的工作区根目录内列出目录、读取文本、预览图片和二进制、监听文件变化
- **技能管理**：加载、搜索、安装和开关技能，支持项目级和全局级作用域
- **双语界面**：内置中英文 i18n 字典，跟随系统语言并支持手动切换
- **明暗主题**：独立调校的冷色浅色与炭灰深色主题，遵循 `prefers-color-scheme` 和 `prefers-reduced-motion`

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 前端框架 | Next.js 16、React 19 |
| 语言 | TypeScript 5 |
| 样式 | Tailwind CSS 4、Radix UI |
| 后端 | Next.js Route Handlers、Pi SDK（`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`） |
| 测试 | Vitest 4 |
| 代码质量 | ESLint 9 |

## 前置条件

- Node.js（建议 20+）
- npm
- 已安装并初始化的 Pi Agent 环境（包含 `~/.pi/agent` 目录）

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

在浏览器打开 [http://localhost:3000](http://localhost:3000) 即可使用。

如需从局域网或 WSL 宿主地址访问开发服务器，可在启动前设置逗号分隔的
`PO_AGENT_ALLOWED_DEV_ORIGINS`；默认不额外放行任何开发来源。


## 项目结构

```text
src/
├── app/                # Next.js 页面、布局和 Route Handler
│   └── api/            # 薄 Route Handler，解析请求并委托给 application
├── components/ui/      # 无业务语义的通用 UI primitive
├── features/           # 按业务能力组织的组件、hook、类型和常量
│   ├── chat/           # 聊天交互
│   ├── file-panel/     # 文件浏览
│   ├── models-config/  # 模型配置
│   ├── session-sidebar/# 会话侧边栏
│   └── skills-config/  # 技能配置
├── i18n/               # 国际化字典与 Provider
├── layouts/            # 应用级页面骨架和 feature 组合
├── lib/                # 浏览器与共享 UI 工具
└── server/             # 后端（清洁架构分层）
    ├── domain/         # 业务数据、命令、事件、状态和错误
    ├── ports/          # application 所需的能力接口
    ├── application/    # 用例编排，只依赖 domain 和 ports
    ├── infrastructure/ # Pi SDK、文件系统、进程适配器
    ├── transport/      # HTTP 验证、错误映射、SSE 机制
    └── composition/    # 生产环境依赖注入组装根
```

## 架构概览

后端采用清洁架构，依赖方向为：

```text
domain <- ports <- application <- transport
domain/ports <- infrastructure
application/infrastructure <- composition
composition/transport/domain <- app/api
```

关键边界规则：

- Domain 不依赖任何框架或适配器
- Application 只依赖 domain 和 ports，不构造具体实现
- Infrastructure 实现 ports，将供应商类型转换为 domain 类型
- Transport 负责协议层，不直接访问 infrastructure
- Composition 是唯一的生产组装根
- Route Handler 保持很薄，只做解析、校验、委托和返回

前端默认使用 Server Component，仅交互边界使用 `"use client"`。前端不得 import `src/server`，通过 `/api` 合同与后端交互。

详见 [docs/architecture.md](docs/architecture.md)。

## 配置说明

### 模型配置

模型配置存储在 `~/.pi/agent/models.json`，可通过界面中的模型配置弹窗编辑，或直接编辑文件。支持 OpenAI 兼容协议、自定义 baseUrl、自定义 Header。

### 认证

- **API Key**：在模型配置中保存，存储在 Pi Agent 目录下，界面不回显真实密钥
- **OAuth**：通过 SSE 流式完成登录，支持交互式输入和选择

### 工作区根目录

文件访问被限制在已登记的工作区根目录内。根目录来源包括：

- 服务启动时的 `process.cwd()`
- 新建 Agent 时指定的 `cwd`
- 从磁盘恢复会话时该会话的 `cwd`

访问根目录之外的路径会返回 `403`。

## API 概览

| 分组 | 主要用途 |
| --- | --- |
| Sessions | 列出、查看、重命名、删除会话，获取上下文 |
| Agent | 创建 Runtime、执行命令、订阅 SSE 事件 |
| Models | 获取可用模型、读写配置、发现和测试模型 |
| Auth | OAuth Provider、API Key 状态与增删 |
| Files | 目录列表、文本读取、二进制流式、文件监听 |
| Skills | 加载、搜索、安装、开关技能 |

所有 SSE 流（Agent 事件、OAuth、文件监听）共享统一的传输机制，每 25 秒发送心跳，客户端断开时自动清理。

完整 HTTP 合同见 [docs/agent-api-reference.md](docs/agent-api-reference.md)。

## 开发指南

- 新增功能前，先确认它应放在哪一层，再开始写代码
- 修改公共 API 或模块边界后，同步更新 `docs/agent-api-reference.md` 和 `docs/architecture.md`
- 开发过程中按变更风险运行最小相关检查；不要求文档、样式、静态文案或无行为变化的重构新增测试
- 新增非平凡行为或修复缺陷时，添加聚焦测试
- 代码提交前运行一次 `npm run check`（lint + typecheck + test）；纯文档修改可跳过
- 涉及 Next.js 路由、渲染或生产行为变更时，额外运行 `npm run build`
- 用户可见文案放在 `src/i18n/dictionaries`，新增或修改时同步中英文字典
- 新代码注释用中文

完整的开发规范、架构规则和变更纪律见 [AGENTS.md](AGENTS.md)。

## 安全说明

当前服务面向**本机单用户、单进程**运行：

- API 本身没有登录校验（OAuth 和 API Key 仅用于模型调用）
- Runtime Registry、Workspace Roots 和 OAuth Pending Input 保存在单进程内存中
- 服务重启后 Runtime 变为未加载，但会话仍可从磁盘恢复

**不要将本服务直接暴露到公网。扩大部署范围前必须先设计认证、授权、路径隔离、速率限制和凭证保护。**

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | 模块边界、依赖方向、分层职责 |
| [docs/agent-api-reference.md](docs/agent-api-reference.md) | 完整 HTTP API 合同、数据结构、SSE 事件 |
| [PRODUCT.md](PRODUCT.md) | 产品定位、目标用户、设计原则 |
| [DESIGN.md](DESIGN.md) | 设计系统、色彩、排版、动效、组件状态 |
| [AGENTS.md](AGENTS.md) | 开发规范、前后端规则、测试期望、变更纪律 |

## Desktop

Desktop packaging notes are in [docs/desktop.md](docs/desktop.md).

## License

见 [LICENSE](LICENSE)。
