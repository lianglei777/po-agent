# pi-web-access 内置集成计划

> 状态：已实施
> 日期：2026-08-12
> 目标版本：`pi-web-access@0.22.0`
> 关联分析：`pi-web-access-integration-analysis.md`（当前仓库未保留）

## 1. 目标

将 `pi-web-access` 作为 Po Agent 的内置基础能力，使模型在所有正常 Agent Session 中可以按需：

- 搜索互联网并获得带来源的结果；
- 抓取 URL 并提取可读正文；
- 分段读取或检索较长的搜索、抓取内容；
- 对技术结论进行基于来源的事实核验。

首期对模型开放以下稳定工具：

```text
web_search
fetch_content
get_search_content
source_check
```

该能力不是用户安装的 Skill Pack，不进入 Skill Pack 目录、安装、更新或移除流程。依赖版本由 Po Agent 的 `package.json` 和 `package-lock.json` 统一管理。

## 2. 非目标

首期不实施：

- 用户安装或卸载 `pi-web-access`；
- 为不同 Session 单独启用或禁用 Web Access；
- 复刻 Pi TUI 的 Curator、快捷键、Activity Monitor 或 Slash Commands；
- GitHub 仓库自动 clone；
- 浏览器 Cookie 读取；
- YouTube、本地视频分析和视频帧提取；
- 为 `pi-web-access` 包装新的 Po Agent `AgentToolProvider`；
- 支持尚未被 `pi-web-access` 实现的私有搜索协议。

## 3. 设计原则

### 3.1 内置依赖，不做运行时安装

`pi-web-access` 作为生产依赖随 Po Agent 构建和发布：

```json
{
  "dependencies": {
    "pi-web-access": "0.22.0"
  }
}
```

运行时直接加载已安装包的 Extension 入口，不执行 `npm install`，也不写入 Pi 的 `packages` 设置。

### 3.2 保留 Pi 原生 Extension 模型

继续由 Pi SDK 的 `DefaultResourceLoader` 和 `ExtensionRunner` 加载 Extension、注册工具和执行工具。不复制 `pi-web-access` 的 Provider、抓取或解析实现。

### 3.3 工具能力与供应商解耦

模型始终调用统一的 `web_search` 等工具。Brave、Tavily、Exa、Jina 等供应商的选择、凭证和回退顺序由 `web-search.json` 配置，不进入 Agent 工具合同或 Chat 组件。

### 3.4 默认只开放本次需要的能力

首期默认关闭与 Web 搜索、网页抓取无关或具有额外本地权限的功能，避免无意扩大文件、进程和浏览器凭证访问范围。

## 4. 目标加载链路

```text
package.json 固定 pi-web-access 版本
  -> createPiResourceLoader() 解析包入口并作为内置 Extension 加载
  -> pi-web-access 注册 Web 工具
  -> PiAgentRuntimeFactory 将四个 Web 工具加入允许列表
  -> AgentSession 将工具暴露给模型
  -> 既有 Pi event -> Agent SSE -> Chat 工具步骤链路展示执行状态和结果
```

## 5. 实施步骤

### 阶段一：固定依赖并加载 Extension

涉及文件：

- `package.json`
- `package-lock.json`
- `src/server/infrastructure/pi/pi-resource-loader.ts`
- `src/server/infrastructure/pi/pi-resource-loader.test.ts`

工作项：

1. 安装并精确固定 `pi-web-access@0.22.0`。
2. 使用 Node.js 包解析能力定位 `pi-web-access` 的 `package.json` 或 Extension 入口。
3. 将解析后的绝对包目录或入口路径传给 `DefaultResourceLoader.additionalExtensionPaths`。
4. 不使用 `npm:pi-web-access` temporary source，避免应用运行时再次安装依赖。
5. 当内置包无法解析或 Extension 加载失败时，让 Runtime 创建明确失败，避免静默缺少基础工具。
6. 增加测试，验证 ResourceLoader 能发现 `pi-web-access` Extension，且现有内置 Skills 和 append system prompt 行为不受影响。

实现时优先使用包的绝对路径，避免依赖当前工作目录、Pi settings 或运行时 npm 可用性。

### 阶段二：将 Web 工具加入 Runtime 工具集合

涉及文件：

- `src/server/infrastructure/pi/pi-agent-runtime.ts`
- `src/server/infrastructure/pi/pi-agent-runtime-factory.test.ts`
- 必要时相关 Agent 工具状态测试

工作项：

1. 定义项目内置 Web 工具名：

   ```text
   web_search
   fetch_content
   get_search_content
   source_check
   ```

2. 创建 AgentSession 时，将这些工具加入传给 Pi SDK 的工具允许列表。
3. 保证自定义 `toolNames` 只控制可选内置开发工具，不会意外移除基础 Web 工具。
4. 处理运行中的 `set_tools` 命令，保证重新选择工具后基础 Web 工具仍保持可用。
5. 增加测试，验证默认创建、显式工具选择、空工具选择和 `set_tools` 后的工具集合。
6. 验证 `get_tools` 能正确反映 Web 工具的 available/active 状态。

首期四个 Web 工具全部作为基础能力保持启用，不在 Chat 工具选择 UI 中增加新的用户开关。

### 阶段三：提供保守的默认配置

涉及文件的最终位置在实施前结合桌面和 Docker 资源复制方式确定。默认配置目标如下：

```json
{
  "workflow": "none",
  "allowBrowserCookies": false,
  "fetchRouting": {
    "providers": ["http", "jina"],
    "allowRemoteHostedProviders": false
  },
  "githubClone": {
    "enabled": false
  },
  "youtube": {
    "enabled": false
  },
  "video": {
    "enabled": false
  }
}
```

工作项：

1. 在首次启动或首次使用前，将默认配置写入：

   ```text
   <PI_CODING_AGENT_DIR>/web-search.json
   ```

2. 已存在用户配置时不覆盖。
3. 配置写入采用原子替换，避免进程中断产生半个 JSON 文件。
4. 不在默认配置中写入任何 API Key。
5. 明确配置变更的生效时机；若 Extension 只在 Session 初始化时读取某些开关，则提示新建或 reload Session。

如果 `pi-web-access` 缺少禁止本地文件输入的配置，首期需验证实际风险并决定以下一种处理：

- 只依赖 Agent 系统提示限制，不宣称强安全隔离；
- 向上游增加本地文件访问禁用开关；
- 在进入正式发布前增加项目侧受控限制。

### 阶段四：API Key 配置与 Provider 扩展

首期支持两种无 UI 配置方式：

1. 系统环境变量；
2. `<PI_CODING_AGENT_DIR>/web-search.json` 中的环境变量引用。

示例：

```json
{
  "braveApiKey": "$BRAVE_SEARCH_API_KEY",
  "tavilyApiKey": "$TAVILY_API_KEY",
  "exaApiKey": "$EXA_API_KEY",
  "jinaApiKey": "$JINA_API_KEY",
  "searchRouting": {
    "providers": ["brave", "tavily", "exa"],
    "fallbackOn": [
      "transient",
      "quota",
      "network",
      "invalid-response"
    ]
  }
}
```

约束：

- 文档和日志不得输出凭证值；
- 测试不得使用真实凭证；
- 默认不使用 `!command` credential source；
- Provider 配置失败只影响对应 Provider，错误信息不得包含请求认证头；
- 默认不使用 `provider: "all"`，避免一次调用同时消耗多个付费 Provider。

对于 `pi-web-access` 已支持的 Provider，新增 API Key 只修改配置，不修改 Runtime、Agent 合同或 Chat UI。

对于未被库支持的私有搜索服务，后续单独决策：

- 通用 Provider 优先贡献到 `pi-web-access`；
- 企业内网或私有知识库使用 Po Agent 自有 Port 和 `AgentToolProvider`；
- 不直接修改 `node_modules/pi-web-access`。

### 阶段五：生产构建与桌面打包

涉及文件可能包括：

- `next.config.ts`
- `desktop/prepare-standalone.mjs`
- 对应构建测试

工作项：

1. 检查 Next.js standalone trace 是否包含 `pi-web-access` 的 TypeScript 源文件和运行时依赖。
2. 必要时将包加入 `serverExternalPackages` 和精确的 `outputFileTracingIncludes`。
3. 验证 Electron packaged server 能从只读应用资源中加载 Extension。
4. 验证 Windows 路径、应用安装目录含空格和非 ASCII 用户数据路径。
5. 确认运行时不依赖系统安装的 npm、Pi CLI、ffmpeg 或 yt-dlp 来完成首期搜索和普通网页抓取。

## 6. 测试与验收

### 6.1 自动化测试

- ResourceLoader 能加载内置 Extension。
- Extension 加载失败时有明确错误。
- 默认 Session 包含四个 Web 工具。
- 指定 `toolNames` 后四个 Web 工具仍可用。
- `set_tools` 后四个 Web 工具仍可用。
- Agent abort 能传递到正在执行的搜索或抓取工具。
- Extension 的错误事件能映射到现有 `tool_execution_end.isError`。
- 工具更新和最终结果沿既有 SSE 合同传递，不新增公开 HTTP/SSE 字段。
- 默认配置不会覆盖已有 `web-search.json`。
- 凭证不会出现在响应、日志、Session fixture 或错误详情中。

### 6.2 开发环境真实验收

使用不含秘密的测试配置或临时环境变量完成：

1. 搜索一个近期技术问题，确认返回来源 URL。
2. 抓取一个 HTML 文档并提取正文。
3. 抓取一个 JSON API 并返回原始文本。
4. 对长页面使用 `get_search_content.findText` 定位内容。
5. 使用 `source_check` 核验一个可验证的技术结论。
6. 中止一次进行中的请求，确认 Agent 和 UI 正确结束等待。
7. 模拟主 Provider 失败，确认按配置回退到下一个 Provider。

### 6.3 生产环境验收

- `npm run check`
- `npm run build`
- Electron 打包产物中完成一次 `web_search`
- Electron 打包产物中完成一次普通 HTTP `fetch_content`
- 重启应用后配置和能力仍可用
- 无 API Key 时返回可理解的可用 Provider 结果或配置错误

## 7. 文档更新

实施时同步更新：

- `docs/pi-web-access-integration-analysis.md`：将推荐方案改为内置 Extension，并修正工具允许列表问题；
- `docs/architecture.md`：记录 Web Access 属于 Pi infrastructure 的内置 Extension 能力；
- `docs/agent-api-reference.md`：仅在公开 API 或事件合同变化时更新；按当前方案预计无需修改合同；
- 新增用户配置说明：配置文件位置、支持的环境变量、Provider 路由和安全默认值；
- 桌面部署文档：说明配置和缓存位于 `PI_CODING_AGENT_DIR`。

## 8. 预计改动范围

首期预计主要改动：

```text
package.json
package-lock.json
src/server/infrastructure/pi/pi-resource-loader.ts
src/server/infrastructure/pi/pi-resource-loader.test.ts
src/server/infrastructure/pi/pi-agent-runtime.ts
src/server/infrastructure/pi/pi-agent-runtime-factory.test.ts
next.config.ts（按构建验证结果决定）
默认配置初始化实现及测试
相关文档
```

不新增新的 application use case、HTTP endpoint、domain contract 或前端页面。

## 9. 风险与应对

| 风险 | 应对 |
| --- | --- |
| Pi SDK 工具允许列表过滤 Extension 工具 | 创建和更新工具集合时显式保留四个基础 Web 工具，并增加回归测试 |
| standalone 未包含动态加载的 `.ts` 文件 | 使用绝对包路径并验证 trace；必要时增加精确 tracing includes |
| Provider API 或额度不稳定 | 使用配置化 Provider 路由和受控回退 |
| 搜索内容包含 Prompt Injection | 在系统提示中将远程内容标记为不可信数据；不执行网页中的指令 |
| `fetch_content` 扩大本地文件访问范围 | 首期审计并限制本地路径能力，不把 SSRF 防护等同于文件系统隔离 |
| 远程提取 Provider 泄露目标 URL 或内容 | 默认关闭 remote hosted provider；用户显式配置后才启用 |
| 配置文件包含明文凭证 | 推荐环境变量引用；未来设置 UI 使用服务端 Credential Store |
| 上游版本升级改变工具名或配置 | 首期固定精确版本；升级时检查 changelog、工具注册和打包测试 |

## 10. 实施顺序与完成标准

推荐按以下顺序实施：

1. 固定依赖并完成 ResourceLoader 加载测试。
2. 修正 Runtime 工具允许列表并完成工具集合测试。
3. 完成默认配置初始化。
4. 完成开发环境真实搜索、抓取和中止验证。
5. 完成 Next.js build 和 Electron packaged 验证。
6. 更新架构、配置和部署文档。

满足以下条件后视为完成：

- 新建和恢复的正常 Session 都能调用四个 Web 工具；
- 搜索和抓取结果能通过现有 Chat 工具步骤展示；
- API Key 可通过环境变量或 `web-search.json` 扩展，无需修改 Agent 代码；
- 默认关闭浏览器 Cookie、视频、GitHub clone 和远程托管抓取；
- 自动化检查、Next.js build 和桌面真实验收全部通过；
- 未引入新的公开 API 合同或泄露凭证的路径。
