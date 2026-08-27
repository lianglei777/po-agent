# 技能包格式规范

本文件是技能包（Skill Pack）的权威格式规范。它规定一个目录或包必须满足哪些
条件才能被 Po Agent 识别、安装和加载为合法技能包。设计与使用说明见
[skill-packs.md](./skill-packs.md)，HTTP 合同见 [agent-api-reference.md](../agent-api-reference.md)。

技能包底层是 Pi Package。Po Agent 不自创包格式，格式要求由 Pi Package Manager
的解析规则和 Po Agent 的安装校验共同决定。下文每条规则都标注了来源代码。

## 术语

| 术语 | 含义 |
| --- | --- |
| Skill Pack（技能包） | 可安装、可移除、可按项目或全局生效的 Agent 能力分发单元 |
| Pi Package | 技能包的底层格式与包管理机制，由 Pi Package Manager 读写 |
| Source（来源） | 指向一个包的引用串：npm 引用、Git 引用、完整 URL 或本地绝对目录 |
| Resource（资源） | 包内可被加载的四类内容：Skills、Extensions、Prompts、Themes |
| Manifest | `package.json` 中的 `pi` 字段，显式声明资源路径 |

## 一、来源（Source）格式

安装技能包的第一步是校验 Source。校验在
`src/server/infrastructure/pi/package-source.ts` 的 `normalizeManualPackageSource`
中完成；本地来源还会在 `PiSkillPackProvider.validateLocalPackageDirectory` 中复查
目录是否存在。

### 1.1 允许的来源类型

| 类型 | 格式 | 示例 |
| --- | --- | --- |
| npm 引用 | `npm:<包名>[@<版本>]`，包名可为 scoped | `npm:@scope/pkg@1.2.3`、`npm:my-pkg` |
| Git 简写 | `git:<host>/<path>[@<ref>]` | `git:github.com/example/repo@v1` |
| Git SCP | `git:git@<host>:<path>` | `git:git@github.com:example/repo` |
| 完整 URL | `http://` / `https://` / `ssh://` / `git://` | `https://github.com/example/repo` |
| 本地目录 | 已存在的绝对目录路径 | `D:\agent-packs\my-workflows` |

### 1.2 硬性限制

下列输入会被拒绝并返回 `400 VALIDATION_ERROR`：

- 相对路径（`./`、`../` 开头）；
- 控制字符（U+0000–U+001F、U+007F）；
- URL 中携带用户名、密码、查询参数（`?`）或 fragment（`#`）；
- 不支持的协议（仅允许 `http:`、`https:`、`git:`、`ssh:`）；
- 裸 npm 名称（无 `npm:` 前缀）、裸 Git SCP 引用（无 `git:` 前缀）和 `git+*://`
  协议——Pi Package Manager 会把它们解释为本地相对路径，因此提前拒绝；
- 本地来源指向不存在路径或非目录。

> 上述限制是为了避免把不可解析的输入误当作本地路径，以及防止在 Source 中泄露或
> 注入凭据。返回给前端的 Source 还会经 `safePackageSource` 清理敏感信息。

## 二、包结构总览

一个技能包是一个目录，满足下列任一即可被解析出资源：

1. 根目录有 `package.json` 且包含 `pi` manifest（见第三节）；
2. 根目录下存在约定名称的资源目录（见第四节）；
3. 上述两者组合：manifest 声明优先，未声明的类型回退到约定目录。

如果三种方式都落空，包内没有任何启用资源，安装会被回滚（见第八节）。

典型结构：

```text
my-workflows/
├── package.json
├── skills/
│   └── review-change/
│       └── SKILL.md
├── extensions/        # 可选
│   └── index.ts
├── prompts/           # 可选
│   └── summarize.md
└── themes/            # 可选
    └── dark.json
```

## 三、package.json 与 `pi` manifest

### 3.1 标准字段

`package.json` 的 `name` 和 `version` 会被 `PiSkillPackProvider.packageMetadata`
读取，用于详情页展示。建议填写，但不是解析资源的必需项。

### 3.2 `pi` manifest

`pi` 字段是一个对象，键为资源类型，值为相对包根的路径数组或 glob 模式。四个键
全部可选：

```json
{
  "name": "@example/my-workflows",
  "version": "1.0.0",
  "pi": {
    "skills": ["./skills"],
    "extensions": ["./extensions/index.ts"],
    "prompts": ["./prompts/*.md"],
    "themes": ["./themes/dark.json"]
  }
}
```

读取逻辑见 `package-manager.js` 的 `readPiManifest`：仅读取 `pkg.pi`，不存在则返回
`null`，解析失败也静默返回 `null`。manifest 中声明的条目通过
`collectFilesFromManifestEntries` 收集，既支持具体路径也支持 glob 模式。

`keywords: ["pi-package"]` 在旧示例中出现，但当前代码**未强制要求**；是否保留不影响
解析。如需让外部工具识别为 Pi Package，可自行保留。

## 四、资源目录约定

当 `package.json` 没有 `pi` manifest，或 manifest 未声明某资源类型时，Pi 回退到
约定目录自动发现。约定目录名为资源类型名，位于包根目录下：

| 目录 | 收集的文件 | 文件名规则 |
| --- | --- | --- |
| `skills/` | 每个子目录中的 `SKILL.md` | 文件名必须严格等于 `SKILL.md` |
| `extensions/` | TypeScript / JavaScript 文件 | 匹配 `/\.(ts\|js)$/` |
| `prompts/` | Markdown 文件 | 匹配 `/\.md$/` |
| `themes/` | JSON 文件 | 匹配 `/\.json$/` |

来源：`package-manager.js` 中 `RESOURCE_TYPES = ["extensions", "skills", "prompts",
"themes"]` 与 `FILE_PATTERNS`。

### 4.1 技能的识别规则

`collectSkillEntries` 按如下方式在 `skills/` 下发现技能：

1. 在当前目录直接查找 `SKILL.md`，找到第一个有效文件即返回（每个目录层级最多
   一个直接 `SKILL.md`）；
2. 否则递归子目录，跳过以 `.` 开头的目录和 `node_modules`；
3. `skills/` 根目录下直接的 `.md` 文件也会被收集为技能（pi 模式特有行为）。

技能名取自 `SKILL.md` 所在目录的目录名（`path.basename(path.dirname(...))`，见
`PiSkillPackProvider.resourceNames`）。因此推荐结构是
`skills/<技能名>/SKILL.md`，目录名即技能名。

### 4.2 符号链接

`collectSkillEntries` 与 `collectResourceFiles` 都会跟随符号链接判定文件/目录类型，
但解析失败时跳过该条目，不会中断整个包的加载。

## 五、SKILL.md 格式

每个技能是一个含 `SKILL.md` 的目录。文件以 YAML frontmatter 开头，后接 Markdown
正文：

```markdown
---
name: prepare-release
description: Use when deciding whether a repository is ready for a release and producing an evidence-based release checklist.
---

# Prepare Release

具体指令正文……
```

### 5.1 frontmatter 字段

| 字段 | 必需 | 用途 |
| --- | --- | --- |
| `name` | 是 | 技能标识，应与所在目录名一致 |
| `description` | 是 | 告诉模型何时加载该技能，应写明触发场景 |

`name` 和 `description` 是模型自动选择技能的依据。`description` 应描述"在什么任务
下使用"，而非"技能内部做什么"。

### 5.2 正文

正文是给模型执行的指令。可以包含步骤、约束、输出格式要求等。参考
`resources/official-packs/git-release-workflows/skills/prepare-release/SKILL.md`。

## 六、资源解析优先级

对每个已配置的包，`collectPackageResources` 按以下顺序解析每一类资源：

1. 若 Pi Settings 中对该包配置了 filter，则按 filter 模式筛选；
2. 否则若 `package.json` 存在 `pi` manifest 且声明了该类型，按 manifest 收集；
3. 否则若存在同名约定目录，自动发现；
4. 都没有则该类型无资源。

manifest 与约定目录的关系：`collectDefaultResources` 先看 manifest，有就用 manifest，
没有才回退到约定目录。因此 manifest 声明会覆盖约定目录，不会叠加。

## 七、安装范围

安装时选择范围决定配置写入位置（由 Pi Settings Manager 管理）：

| 范围 | 写入位置 | 适用场景 |
| --- | --- | --- |
| 当前项目（project） | 当前工作区 `.pi/settings.json` | 团队工作流，只影响当前仓库 |
| 所有项目（global/user） | 用户级 `~/.pi/agent/settings.json` | 个人通用能力，所有项目可用 |

同一个 Package 同时出现在两种范围时，Pi 以项目配置为准。项目范围不是安全沙箱，
只控制资源在哪些项目中加载。

## 八、安装校验规则

安装后会重新解析资源并校验，校验失败会回滚本次安装（见
`PiSkillPackProvider.install` 与 `installSource`）。

### 8.1 第三方包

通过 `install-source` 安装的包必须满足：

- Source 通过第一节的所有校验；
- 本地来源是已存在的目录；
- 安装后能解析出**至少一个启用资源**（`hasResources` 检查四类资源非空）。

否则返回 `500 SKILL_PACK_INSTALL_FAILED` 并回滚。

### 8.2 官方目录包

通过 `install` 安装的官方包要求更严：

- 除上述条件外，`official-skill-packs.ts` 中声明的 `expectedSkills` 必须全部
  出现在解析出的技能列表中（`definition.expectedSkills.every(...)`）；
- 缺任一声明技能即回滚。

因此官方包不能省略任何声明的技能。

### 8.3 状态判定

| 状态 | 判定条件 |
| --- | --- |
| `available` | 官方目录中存在，尚未安装 |
| `installed` | 配置存在，安装目录可解析，且（官方包）声明技能齐全 |
| `broken` | 配置仍在，但安装目录缺失、资源解析失败或官方包技能不完整 |

## 九、示例

### 9.1 最小技能包（仅一个技能）

```text
my-workflows/
├── package.json
└── skills/
    └── review-change/
        └── SKILL.md
```

`package.json`：

```json
{
  "name": "@example/my-workflows",
  "version": "1.0.0",
  "pi": {
    "skills": ["./skills"]
  }
}
```

`skills/review-change/SKILL.md`：

```markdown
---
name: review-change
description: Review a code change for correctness and release risk. Use before merging.
---

# Review Change

Read the repository instructions, inspect the complete diff, run the required checks,
and report actionable findings before summarizing the result.
```

开发时用该目录的绝对路径安装到"当前项目"即可验证。

### 9.2 纯约定目录（无 manifest）

```text
my-workflows/
├── skills/
│   └── review-change/
│       └── SKILL.md
└── prompts/
    └── summarize.md
```

没有 `package.json` 也能被解析，但详情页不会显示名称和版本。

### 9.3 含扩展的完整包

```json
{
  "name": "@example/full-workflows",
  "version": "1.0.0",
  "pi": {
    "skills": ["./skills"],
    "extensions": ["./extensions/index.ts"],
    "prompts": ["./prompts/*.md"],
    "themes": ["./themes/dark.json"]
  }
}
```

包含 Extensions 的包在安装时会显示额外的可执行代码警告。

## 十、常见错误与原因

| 现象 | 通常原因 |
| --- | --- |
| `400 VALIDATION_ERROR` | Source 格式非法：相对路径、带凭据/查询/fragment 的 URL、不支持的协议 |
| `400 VALIDATION_ERROR`（本地） | 本地来源不是已存在的目录 |
| `500 SKILL_PACK_INSTALL_FAILED` | 安装后未解析出任何启用资源（四类全空） |
| `500 SKILL_PACK_INSTALL_FAILED`（官方包） | 声明的 `expectedSkills` 未全部出现 |
| 安装成功但技能不出现 | 未新建或恢复会话；资源只在会话加载时读取 |
| 技能名与预期不符 | 技能名取自 `SKILL.md` 所在目录名，而非 frontmatter 的 `name` |
| `SKILL.md` 未被识别 | 文件名必须严格为 `SKILL.md`（大小写敏感） |
| `broken` 状态 | 安装目录缺失、资源解析失败，或官方包技能不完整 |

## 十一、安全约束

技能能指导模型执行命令，扩展能运行代码，因此技能包不是静态说明书。本规范只保证
格式可解析，不保证包的行为安全：

- Source 校验只拒绝明显非法输入，不能替代源码审查；
- 第三方包只应从可信发布者和可信来源安装；
- 本地包直接引用原目录，不会复制或快照，原目录改动会即时影响加载结果；
- 安装包含 Extensions 的包时会显示额外的可执行代码警告。

## 相关实现

- `src/server/infrastructure/pi/package-source.ts`：Source 校验与清理；
- `src/server/infrastructure/pi/pi-skill-pack-provider.ts`：安装、解析、校验与生命周期；
- `src/server/infrastructure/pi/official-skill-packs.ts`：官方目录与 `expectedSkills` 声明；
- `node_modules/@earendil-works/pi-coding-agent/dist/core/package-manager.js`：Pi 包解析、
  manifest 读取与约定目录发现的底层实现；
- `resources/official-packs/git-release-workflows`：符合本规范的官方技能包示例；
- `docs/guides/skill-packs.md`：技能包的设计、使用与命名说明。
