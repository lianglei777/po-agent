# GitHub Actions CI/CD 设计

本文描述 Po Agent 的持续集成与发布设计。实际工作流位于：

- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
- [`.github/workflows/release.yml`](../../.github/workflows/release.yml)

## 1. 目标与范围

当前流水线交付两个产物：

| 产物 | 构建环境 | 交付位置 |
|---|---|---|
| Windows x64 NSIS 安装包 | GitHub-hosted Windows runner | GitHub Releases |
| Linux amd64 Docker 镜像 | GitHub-hosted Ubuntu runner | Docker Hub |

本阶段不包含：

- 自动登录服务器、拉取镜像或重启容器。
- Electron 客户端自动更新。
- Windows ARM64、Linux ARM64 或 macOS 安装包。
- 强制要求 Windows 代码签名。配置签名 Secret 后可以自动签名，否则生成未签名安装包。

Docker 镜像推送到 Docker Hub 是当前 CD 的终点。服务器自动部署应作为独立阶段实现，避免把镜像发布凭证与服务器访问凭证放在同一作业中。

## 2. 总体流程

```text
Pull Request / push master
  -> quality
     -> docker build + container smoke test
     -> Windows unpacked package build

push vX.Y.Z tag
  -> preflight: tag/version check + npm run check
     -> Windows NSIS build -> GitHub Release
     -> Docker build -> Docker Hub
```

CI 和 Release 分开有三个目的：

1. PR 不接触发布凭证，也不会产生正式发布。
2. 正式发布只由受保护的稳定版本 Git Tag 标识。
3. 日常检查失败不会污染 GitHub Releases 或 Docker Hub 标签。

## 3. CI 工作流

`ci.yml` 在以下事件运行：

- Pull Request 指向 `master`。
- 代码推送到 `master`。
- GitHub Actions 页面手动触发。

### 3.1 Quality and production build

Ubuntu runner 使用 Node.js 22，依次执行：

```bash
npm ci
npm run check
npm run build
```

`npm run check` 是仓库规定的质量门禁，包含 ESLint、TypeScript 和测试。额外执行生产构建，用于发现仅在 Next.js 编译阶段出现的问题。

### 3.2 Docker build and smoke test

该作业等待质量检查通过，然后：

1. 使用 Buildx 构建 `linux/amd64` 镜像。
2. 显式使用 `https://registry.npmjs.org`，避免 GitHub runner 依赖国内 npm 镜像。
3. 将镜像加载到 runner，但不登录或推送 Docker Hub。
4. 启动临时容器并轮询 `http://127.0.0.1:51732/`。
5. 无论成功或失败，都输出容器日志并删除临时容器。

这项检查同时覆盖 Dockerfile 构建和 standalone server 的最小启动路径。

### 3.3 Windows package smoke build

Windows runner 执行：

```powershell
npm ci
npm run desktop:pack
```

`desktop:pack` 生成免安装目录，比每次 CI 都编译 NSIS 安装器更快。作业最后确认以下文件存在：

```text
.desktop-dist\win-unpacked\Po Agent.exe
```

正式的 NSIS `.exe` 只在 Release 工作流中生成。

## 4. Release 工作流

`release.yml` 的 GitHub 触发器接收 `v*.*.*` Tag，预检作业再严格限制为 `v数字.数字.数字`，例如 `v0.1.1`。`v0.1.1-beta.1` 等预发布版本不会进入当前正式发布流程，也不会更新 `latest`。

### 4.1 版本校验

`package.json.version` 是唯一发布版本来源。发布前必须满足：

```text
Git Tag = v + package.json.version
```

例如 `package.json` 为 `0.1.1` 时，只允许 `v0.1.1` 发布。校验失败后，Windows 和 Docker 发布作业都不会开始。

预检作业还会重新执行 `npm run check`，防止绕过分支 CI 直接创建 Tag。

### 4.2 Windows Release

Windows 作业先构建 Next.js 并准备 standalone 资源，最后单独调用 electron-builder，预期生成：

```text
.desktop-dist\Po Agent Setup <version>.exe
```

随后计算 SHA-256 并生成 `SHA256SUMS.txt`。两个文件会上传到同名 GitHub Release。

发布步骤是可重试的：

- Release 不存在时创建 Release 并生成 release notes。
- Release 已存在时用 `--clobber` 更新同名产物。

若配置 `WIN_CSC_LINK` 和 `WIN_CSC_KEY_PASSWORD`，electron-builder 会使用证书签名；未配置时保持当前未签名行为。签名 Secret 只注入 electron-builder 步骤，不会暴露给 `npm ci` 或 Next.js 构建步骤。

### 4.3 Docker Release

Docker 作业构建并推送 `linux/amd64` 镜像，标签策略如下：

| Git Tag | Docker 标签 |
|---|---|
| `v0.1.1` | `0.1.1` |
| `v0.1.1` | `0.1` |
| `v0.1.1` | `latest` |
| 任意发布 Tag | `sha-<short-commit>` |

`latest` 只由正式版本 Tag 更新，`master` 的普通提交不会覆盖它。镜像同时包含 OCI metadata、provenance 和 SBOM。

## 5. 权限与凭证边界

工作流默认只有：

```yaml
permissions:
  contents: read
```

只有 Windows Release 作业提升为 `contents: write`，用于创建 GitHub Release。Docker Hub 使用独立 Access Token，不使用 GitHub Token。

需要配置：

| 类型 | 名称 | 用途 |
|---|---|---|
| Repository variable | `DOCKERHUB_USERNAME` | Docker Hub 用户名或组织名 |
| Repository secret | `DOCKERHUB_TOKEN` | Docker Hub Read/Write Access Token |
| 可选 Repository secret | `WIN_CSC_LINK` | Windows `.pfx` 证书的 Base64 内容或安全 URL |
| 可选 Repository secret | `WIN_CSC_KEY_PASSWORD` | Windows 证书密码 |

CI 工作流不引用 Docker Hub Secret。发布 Secret 只注入实际需要它的步骤；`GH_TOKEN` 不会暴露给依赖安装或构建步骤。所有 checkout 都关闭 `persist-credentials`，避免 job 权限对应的 Git 凭证残留在后续命令可访问的 Git 配置中。

所有外部 GitHub Actions 都固定到查询并审查过的完整 commit SHA，旁边保留 major 版本注释。后续升级应通过明确的依赖更新 PR 完成，不使用会移动的 major tag 直接执行发布权限代码。

## 6. 缓存策略

流水线缓存以下内容：

- npm 下载缓存，由 `actions/setup-node` 按 `package-lock.json` 管理。
- `.next/cache`，按依赖和源码变化恢复。
- Windows Electron 与 electron-builder 二进制缓存。
- Docker BuildKit layer cache，存储在 GitHub Actions cache backend。

缓存只用于提速，不作为产物来源；每次作业仍使用干净 checkout 和 `npm ci`。

## 7. 并发与失败处理

- 同一分支的新 CI 会取消旧 CI，节省 runner 时间。
- Release 不允许自动取消，避免发布一半时被后续事件中断。
- Windows Release 和 Docker 发布在预检后并行执行。
- GitHub Release 与 Docker Hub 是两个独立外部系统，无法提供跨系统事务。失败的作业可以在 GitHub Actions 页面单独重跑；同一受保护 Tag 的重跑会从同一个 commit 重新生成并覆盖同名产物，但 GitHub Release 资产和 Docker 标签本身不具备跨仓库不可变性。

## 8. 后续扩展

后续可以在不改变当前边界的前提下增加：

- 使用 GitHub Environment 为 Release 增加人工审批。
- Windows 强制签名，并启用 electron-builder `forceCodeSigning`。
- Docker `linux/arm64` 多架构镜像。
- 镜像漏洞扫描和策略阻断。
- 独立的服务器部署工作流。
- Electron `electron-updater` 自动更新。
