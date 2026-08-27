# 项目更名：Po Agent Web -> Po Agent

> 状态：执行稿 v4，仓库内修改已完成；客户端打包验证、GitHub 仓库改名、本地 remote/目录更新待手动处理。
> 范围：把应用名由 “Po Agent Web” 改为 “Po Agent”（去掉 “Web”）。底层引擎 Pi（`@earendil-works/pi-*`、`PI_CODING_AGENT_DIR`、`~/.pi`、`pi-agent` 子目录）**不在更名范围内**，详见第 5 节。
> 前提：项目**尚未正式发布**，无既有用户/部署，因此所有数据迁移与兼容性风险均不适用，可直接改名。

## 1. 为什么选 “Po Agent” 而不是 “Po”

项目里已有的内部标识符大多是 `poAgent…` / `PO_AGENT_` / `po-agent-` 形式：

- 渲染进程全局 `window.poAgentDesktop`
- 桌面->服务端环境变量 `PO_AGENT_BUILTIN_SKILLS_DIR` / `PO_AGENT_OFFICIAL_PACKS_DIR`
- Docker named volume `po-agent-data`
- Linux 宿主工作区 `~/po-agent-user-workspace`

这些标识符和 “Po Agent” 天然一致，和 “Po” 不一致。因此选 “Po Agent” 后这 4 类**全部保持不变**，只需把各处展示串里的 “Web” 去掉，爆炸半径显著缩小。

## 2. 已确认的决策

| 决策点 | 结论 |
| --- | --- |
| npm 包名 `name` | `po-agent-web` -> **`po-agent`** |
| npm 包作者 `author` | `Po Agent Web` -> **`Leon`**（与 LICENSE 一致） |
| Electron `appId` | `com.poagent.web` -> **`com.poagent.app`**（未发布，无既有安装，可直接改） |
| Docker Hub 仓库名 | 新建 **`<user>/po-agent`**（用户自行创建） |
| userData 目录迁移 | **不做迁移**，直接改名为 “Po Agent”（未发布，老数据丢失可接受） |

## 3. 命名映射总表

| 维度 | 当前值 | 目标值 | 是否改动 |
| --- | --- | --- | --- |
| 展示名（人读） | Po Agent Web | Po Agent | 改 |
| Electron `productName` | Po Agent Web | Po Agent | 改 |
| npm 包名 `name` | po-agent-web | po-agent | 改 |
| npm 包作者 `author` | Po Agent Web | Leon | 改 |
| Electron `appId` | com.poagent.web | com.poagent.app | 改 |
| Docker 镜像 / 服务 / 容器名 | po-agent-web | po-agent | 改 |
| Docker Hub 仓库名 | `<user>/po-agent-web` | `<user>/po-agent` | 改 |
| Docker named volume | po-agent-data | po-agent-data | **不变** |
| 渲染进程全局对象 | `window.poAgentDesktop` | `window.poAgentDesktop` | **不变** |
| 桌面->服务端环境变量前缀 | `PO_AGENT_*` | `PO_AGENT_*` | **不变** |
| Electron userData 目录名 | Po Agent Web | Po Agent | 改（不迁移） |
| NSIS 安装目录 / exe 名 | “Po Agent Web” / “Po Agent Web Setup X.Y.Z.exe” | “Po Agent” / “Po Agent Setup X.Y.Z.exe” | 改（随 productName 派生） |
| 窗口标题 / 错误对话框 | Po Agent Web | Po Agent | 改 |
| Linux 宿主工作区目录 | ~/po-agent-user-workspace | 不变 | **不变** |

## 4. 修改点清单（按文件）

> 行号为梳理时快照，改动后可能偏移。格式：`行号: 当前 -> 目标`。
> 本次改动统一为 “去掉 Web”：`Po Agent Web`->`Po Agent`、`po-agent-web`->`po-agent`。

### 4.1 包与构建配置
- [package.json](../../package.json)
  - L2: `"name": "po-agent-web"` -> `"po-agent"`
  - L5: `"author": "Po Agent Web"` -> `"Leon"`
  - L64: `"appId": "com.poagent.web"` -> `"com.poagent.app"`
  - L65: `"productName": "Po Agent Web"` -> `"Po Agent"`
- [package-lock.json](../../package-lock.json)
  - L2、L8: `"name": "po-agent-web"` -> `"po-agent"`（根项目及 `packages[""]` 元数据，与 `package.json` 同步）

### 4.2 Electron 桌面运行时
- [desktop/main.mjs](../../desktop/main.mjs)
  - L124: `title: "Po Agent Web"` -> `"Po Agent"`
  - L154: `"Po Agent Web failed to start"` -> `"Po Agent failed to start"`
- [desktop/desktop-runtime.mjs](../../desktop/desktop-runtime.mjs)
  - L18: 兜底目录 `"Po Agent Web"` -> `"Po Agent"`（与 productName 派生的 userData 对齐）
  - L45-46: `PO_AGENT_BUILTIN_SKILLS_DIR` / `PO_AGENT_OFFICIAL_PACKS_DIR` -> **不变**（已与新名一致）
- [desktop/preload.cjs](../../desktop/preload.cjs) L3: `poAgentDesktop` -> **不变**
- [desktop/desktop-runtime.test.mjs](../../desktop/desktop-runtime.test.mjs)
  - L18,29,37,44,52,59,65,66,75,100,101: 路径 fixture `Po Agent Web` -> `Po Agent`
  - L43,58: 断言的 `PO_AGENT_*` 环境变量名 -> **不变**
  - L93-94: `"C:\\repo\\po-agent-web"` 是 `getStandaloneServerPath` 的入参 fixture（仓库路径样例，非应用名），可不改；若要一致可改为 `po-agent`。

### 4.3 前端（元数据 / i18n）
- [src/app/layout.tsx](../../src/app/layout.tsx)
  - L24: `title: "Po Agent Web"` -> `"Po Agent"`
  - L25: description 含 “Pi coding agent”，Pi 保留不动
- [src/i18n/dictionaries/zh.ts](../../src/i18n/dictionaries/zh.ts) L47-48: `Po Agent Web` -> `Po Agent`
- [src/i18n/dictionaries/en.ts](../../src/i18n/dictionaries/en.ts) L45-46: `Po Agent Web` -> `Po Agent`
- 类型与组件中的 `window.poAgentDesktop`（[src/types/desktop.d.ts](../../src/types/desktop.d.ts) L5、[add-skill-pack-dialog.tsx](../../src/features/skills/add-skill-pack-dialog.tsx) L35,46、[project-picker.tsx](../../src/features/sessions/project-picker.tsx) L97-98）-> **不变**

### 4.4 服务端环境变量消费者
- [src/server/infrastructure/pi/pi-resource-loader.ts](../../src/server/infrastructure/pi/pi-resource-loader.ts) L15 -> **不变**
- [src/server/infrastructure/pi/official-skill-packs.ts](../../src/server/infrastructure/pi/official-skill-packs.ts) L18 -> **不变**
- [src/server/infrastructure/pi/official-skill-packs.test.ts](../../src/server/infrastructure/pi/official-skill-packs.test.ts) L31 -> **不变**

> 说明：`PO_AGENT_*` 前缀已与 “Po Agent” 一致，桌面侧与服务端侧均无需改动，跨边界契约保持稳定。

### 4.5 Docker
- [docker-compose.yml](../../docker-compose.yml)
  - L2: 服务 `po-agent-web` -> `po-agent`
  - L8: `image: po-agent-web:0.1.0` -> `po-agent:0.1.0`
  - L9: `container_name: po-agent-web` -> `po-agent`
  - L18,25: volume `po-agent-data` -> **不变**
- [docker-compose.dev.yml](../../docker-compose.dev.yml)
  - L2: 服务 `po-agent-web` -> `po-agent`
  - L8: `image: po-agent-web:0.1.0-dev` -> `po-agent:0.1.0-dev`
  - L9: `container_name: po-agent-web-dev` -> `po-agent-dev`
  - L22,29: volume `po-agent-data` -> **不变**
- [Dockerfile](../../Dockerfile) / [Dockerfile.dev](../../Dockerfile.dev): 无名称引用，**不改**。
- [scripts/docker-up.sh](../../scripts/docker-up.sh)
  - L2: 注释 `po-agent-web` -> `po-agent`
  - L21: `$HOME/po-agent-user-workspace` -> **不变**
- [scripts/docker-up.ps1](../../scripts/docker-up.ps1) L1: 注释 `po-agent-web` -> `po-agent`

### 4.6 CI/CD
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
  - L73: `tags: po-agent-web:ci` -> `po-agent:ci`
  - L80: `--name po-agent-web-ci … po-agent-web:ci` -> `--name po-agent-ci … po-agent:ci`
  - L98-99: `po-agent-web-ci` -> `po-agent-ci`
  - L138: `".desktop-dist\win-unpacked\Po Agent Web.exe"` -> `"Po Agent.exe"`（随 productName 派生）
- [.github/workflows/release.yml](../../.github/workflows/release.yml)
  - L105,118: `"Po Agent Web Setup $env:APP_VERSION.exe"` -> `"Po Agent Setup $env:APP_VERSION.exe"`
  - L124: `--title "Po Agent Web $tag"` -> `"Po Agent $tag"`
  - L136: `IMAGE_NAME: …/po-agent-web` -> `…/po-agent`
  - L174: `org.opencontainers.image.title=Po Agent Web` -> `Po Agent`
  - L175: description 含 “Pi coding agent”，Pi 保留不动
- `src/github-actions-workflows.test.ts`（当前仓库未保留）L28: 断言 `"Po Agent Web.exe"` -> `"Po Agent.exe"`（与 ci.yml L138 同步）

### 4.7 文档（展示名 + 镜像名）
- [README.md](../../README.md) L1,3: `Po Agent Web` -> `Po Agent`
- [AGENTS.md](../../AGENTS.md) L9: `# Po Agent Web Project Instructions` -> `# Po Agent Project Instructions`
- [PRODUCT.md](../../PRODUCT.md) L13: `Po Agent Web is …` -> `Po Agent is …`
- [DESIGN.md](../../DESIGN.md) L2（frontmatter `name`）、L40（标题）: `Po Agent Web` -> `Po Agent`
- [.impeccable/design.json](../../.impeccable/design.json) L4（`title`）、L154（`overview` 文案）: `Po Agent Web` -> `Po Agent`
- [docs/architecture.md](../architecture.md) L1: 标题
- [docs/agent-api-reference.md](../agent-api-reference.md) L1: 标题
- [docs/guides/skill-packs.md](../guides/skill-packs.md) L118,175: `Po Agent Web` -> `Po Agent`
- [docs/designs/model-provider-configuration-validation-design.md](../designs/model-provider-configuration-validation-design.md) L5,134,241: `Po Agent Web` -> `Po Agent`
- [docs/operations/ci-cd-design.md](../operations/ci-cd-design.md) L3,90（`Po Agent Web.exe`）,116（`Po Agent Web Setup <version>.exe`）: -> `Po Agent`
- [docs/operations/ci-cd-usage.md](../operations/ci-cd-usage.md) L3,12,19（Docker Hub 仓库名 `po-agent-web`->`po-agent`）;L159,166（安装包名 `Po Agent Web Setup 0.1.1.exe`->`Po Agent Setup 0.1.1.exe`）;L176-179,185-186,203-204（镜像名 `<user>/po-agent-web`->`<user>/po-agent`）
- [docs/operations/docker-deploy.md](../operations/docker-deploy.md): 全文 `Po Agent Web`->`Po Agent`、`po-agent-web`->`po-agent`（标题 L1；说明 L3,12,85,108；镜像 build/save/load/tag/push L172,175,181,183,187,193,198,206,207,210,226-228,257,305,315-316,319-320,328,335-336,382,398,419）
- [docs/operations/desktop-deploy.md](../operations/desktop-deploy.md): 全文 `Po Agent Web`->`Po Agent`（标题 L1;说明 L3,7;产物/路径 L89,90,142,155,156,158,187-189,214,217,238,239）;L31,56,65 的 `window.poAgentDesktop` -> **不变**

### 4.8 已跟踪的实施规格与计划

以下 `.superpowers` 文件已纳入 Git，产品展示名及真实安装路径需要同步更新；其中纯粹用于验证“从路径末段提取项目名”的 `po-agent-web` fixture 保留不动：

- [.superpowers/plans/2026-06-29-codex-inspired-workspace-redesign.md](../../.superpowers/plans/2026-06-29-codex-inspired-workspace-redesign.md)：产品展示名改为 `Po Agent`；L133-134 的项目路径 fixture 保留。
- [.superpowers/plans/2026-07-08-chatgpt-like-visual-system.md](../../.superpowers/plans/2026-07-08-chatgpt-like-visual-system.md)：产品展示名改为 `Po Agent`。
- [.superpowers/plans/2026-07-14-skill-pack-implementation.md](../../.superpowers/plans/2026-07-14-skill-pack-implementation.md)：安装路径中的 `Po Agent Web` 改为 `Po Agent`。
- [.superpowers/specs/2026-06-28-codex-inspired-workspace-redesign.md](../../.superpowers/specs/2026-06-28-codex-inspired-workspace-redesign.md)：产品展示名改为 `Po Agent`。
- [.superpowers/specs/2026-07-08-chatgpt-like-visual-system.md](../../.superpowers/specs/2026-07-08-chatgpt-like-visual-system.md)：产品展示名改为 `Po Agent`。
- [.superpowers/specs/2026-07-14-skill-pack-design.md](../../.superpowers/specs/2026-07-14-skill-pack-design.md)：产品展示名改为 `Po Agent`。
- [.superpowers/specs/2026-07-14-welcome-page-design.md](../../.superpowers/specs/2026-07-14-welcome-page-design.md)：产品展示名改为 `Po Agent`。
- [.superpowers/specs/2026-07-15-skill-pack-management-completion-design.md](../../.superpowers/specs/2026-07-15-skill-pack-management-completion-design.md)：产品展示名改为 `Po Agent`。

## 5. 明确不动的项（避免误改）

- **Pi 引擎相关**：`PI_CODING_AGENT_DIR`、`@earendil-works/pi-*`、`~/.pi`、userData 下的 `pi-agent` 子目录--这些属于 Pi SDK，不是应用名。
- **已与新名一致的内部标识符**：`poAgentDesktop`、`PO_AGENT_*`、`po-agent-data`、`po-agent-user-workspace`（见第 1 节）。
- `LICENSE`：署名 “Leon”，无项目名。
- `next.config.ts`、`tsconfig.json`、ESLint 配置、`CLAUDE.md`：无项目名引用。
- `Dockerfile` / `Dockerfile.dev`：无名称引用。
- [src/features/sessions/session-utils.test.ts](../../src/features/sessions/session-utils.test.ts) L82-83：`"C:\\work\\po-agent-web"` 是 `getProjectName` 的入参样例（取路径末段），非应用名，不改。
- `.next/`、`.desktop-dist/` 下产物：构建生成，重新构建即刷新，不手工改。
- `build/icon.png` / `build/icon.ico` / `src/app/favicon.ico`：已人工核对，均为无文字的 “Po” 图形；`build/icon.ico` 与 `src/app/favicon.ico` 内容相同，**不改**。

## 6. 兼容性说明

项目尚未正式发布，无既有用户与部署，因此：

- userData 目录随 productName 变为 `Po Agent`，**不做迁移**，老数据丢失可接受。
- appId 改为 `com.poagent.app`，无既有安装冲突。
- Docker volume `po-agent-data` 与 Linux 工作区目录**不改名**，本机如有测试数据可继续沿用。
- Docker Hub 新仓库 `<user>/po-agent` 由用户自行创建；旧仓库（若有）无需维护。

## 7. 仓库外部（可选，需人工处理）

- 本地克隆目录 `c:\Users\weilianglei\Desktop\po-agent-web`：可重命名为 `po-agent`。已跟踪的运行时代码使用相对路径，但 `.claude/settings.local.json` 等本地忽略文件可能包含旧绝对路径；目录改名后需更新有效配置，缓存/日志可重新生成。
- GitHub 仓库 `lianglei777/po-agent-web`：重命名为 `lianglei777/po-agent`。CI 用 `github.repository` 隐式引用，无需改工作流；重命名后更新本地 remote：`git remote set-url origin git@github.com:lianglei777/po-agent.git`。GitHub 会跳转旧 URL，但外部文档/链接仍需手动更新。

## 8. 建议执行顺序

1. 改 [package.json](../../package.json)（L2/L5/L64/L65）及 [package-lock.json](../../package-lock.json)（L2/L8）。
2. 改 Electron 展示串（[main.mjs](../../desktop/main.mjs)、[desktop-runtime.mjs](../../desktop/desktop-runtime.mjs) L18）+ [desktop-runtime.test.mjs](../../desktop/desktop-runtime.test.mjs) fixture。
3. 改前端元数据 / i18n（[layout.tsx](../../src/app/layout.tsx)、[zh.ts](../../src/i18n/dictionaries/zh.ts)、[en.ts](../../src/i18n/dictionaries/en.ts)）。
4. 改 Docker（[docker-compose.yml](../../docker-compose.yml)、[docker-compose.dev.yml](../../docker-compose.dev.yml)、[docker-up.sh](../../scripts/docker-up.sh)、[docker-up.ps1](../../scripts/docker-up.ps1)）。
5. 改 CI（[ci.yml](../../.github/workflows/ci.yml)、[release.yml](../../.github/workflows/release.yml)、`github-actions-workflows.test.ts`）。
6. 改文档（README/AGENTS/PRODUCT/DESIGN + docs/ 下 8 篇现有项目文档 + .impeccable/design.json）。
7. 改 8 份已跟踪的 `.superpowers` 规格/计划，保留明确列出的路径 fixture。
8. 图标已核对，无需修改（第 5 节）。
9. 扫描旧名称残留，再运行 `npm run check` + `npm run build`。
10. 仓库内改动验证完成后，再按需处理 GitHub 仓库名、本地 remote、本地克隆目录及忽略文件中的绝对路径（第 7 节）。

> `poAgentDesktop` 与 `PO_AGENT_*` 跨边界契约不变，无需专门原子化提交。

## 9. 验证清单

- 执行 `git grep -I -n -i -E "Po Agent Web|po-agent-web|com\.poagent\.web" -- . ":(exclude)docs/plans/rename-to-po-agent.md" ":(exclude)docs/superpowers/plans/2026-07-19-rename-to-po-agent.md"`；除明确保留的仓库路径 fixture 与用于阻止旧名称回归的负向断言外，不应再有旧名称。
- `npm run check`（lint + typecheck + test）通过；特别关注 [desktop-runtime.test.mjs](../../desktop/desktop-runtime.test.mjs)、[official-skill-packs.test.ts](../../src/server/infrastructure/pi/official-skill-packs.test.ts)、`github-actions-workflows.test.ts`。
- `npm run build` 通过。
- `npm run desktop:pack` 产出 `.desktop-dist\win-unpacked\Po Agent.exe`，双击启动，窗口标题为 “Po Agent”。
- `npm run desktop:dist` 产出 `Po Agent Setup <version>.exe`。
- 桌面启动后内置技能 / 官方技能包正常加载（`PO_AGENT_*` 链路未变，回归即可）。
- 原生目录选择可用（`window.poAgentDesktop` 未变，回归即可）。
- `docker compose up --build` 起来，`curl http://127.0.0.1:51732/` 返回正常。
- 浏览器标签页标题显示 “Po Agent”。
