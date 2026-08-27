# GitHub Actions CI/CD 使用手册

本文说明如何配置并使用 Po Agent 的 CI/CD。架构与安全设计见 [ci-cd-design.md](ci-cd-design.md)。

## 1. 首次配置 Docker Hub

### 1.1 创建镜像仓库

登录 Docker Hub，创建仓库：

```text
po-agent
```

公开仓库便于服务器匿名拉取；私有仓库要求服务器先执行 `docker login`。

### 1.2 创建 Access Token

在 Docker Hub 的账号安全设置中创建 Access Token。Token 必须对 `po-agent` 具有 Read/Write 权限。

不要把 Docker Hub 密码或 Token 写入代码、工作流或文档。

## 2. 配置 GitHub 仓库

打开 GitHub 仓库：

```text
Settings -> Secrets and variables -> Actions
```

### 2.1 Repository variable

在 `Variables` 中添加：

| 名称 | 示例值 |
|---|---|
| `DOCKERHUB_USERNAME` | `your-dockerhub-name` |

### 2.2 Repository secret

在 `Secrets` 中添加：

| 名称 | 值 |
|---|---|
| `DOCKERHUB_TOKEN` | Docker Hub Access Token |

### 2.3 可选 Windows 签名 Secret

公开分发 Windows 客户端时，建议再配置：

| 名称 | 值 |
|---|---|
| `WIN_CSC_LINK` | `.pfx` 证书的 Base64 内容或安全 URL |
| `WIN_CSC_KEY_PASSWORD` | 证书密码 |

两个值都不配置时仍能发布，但安装包没有代码签名，Windows SmartScreen 可能显示警告。

### 2.4 检查 Actions 权限

打开：

```text
Settings -> Actions -> General
```

确认：

- 仓库允许使用 GitHub Actions。
- 工作流可以为指定作业申请 `contents: write`，否则无法创建 GitHub Release。
- 如组织策略限制第三方 Action，需要允许 Docker 官方 Actions。

### 2.5 保护发布 Tag

在 GitHub Rulesets 中为 `v*` Tag 建立保护规则，至少限制普通成员更新或删除已经推送的发布 Tag。正式发布后不要移动或复用 Tag；修复应使用新的版本号。

工作流重跑可能覆盖同一 Release 的同名附件和 Docker 标签，但受保护 Tag 保证输入 commit 不变。GitHub Release 资产和 Docker 标签本身不应被描述为不可变存储。

## 3. 日常 CI

以下操作会自动运行 CI：

- 创建或更新目标为 `master` 的 Pull Request。
- 向 `master` 推送代码。

CI 页面会显示三个作业：

```text
Quality and production build
Docker build and smoke test
Windows package smoke build
```

建议为 `master` 开启分支保护，并把三个作业设为必需检查。CI 不会登录 Docker Hub，也不会创建 Release。

如需手动重新验证当前分支：

```text
Actions -> CI -> Run workflow
```

## 4. 发布新版本

### 4.1 更新版本号

使用 npm 同时修改 `package.json` 和 `package-lock.json`：

```powershell
npm version patch --no-git-tag-version
```

也可以使用：

```powershell
npm version minor --no-git-tag-version
npm version major --no-git-tag-version
```

检查修改后的版本：

```powershell
node -p "require('./package.json').version"
```

### 4.2 提交版本修改

以 `0.1.1` 为例：

```powershell
npm run check
git add package.json package-lock.json
git commit -m "chore: release v0.1.1"
git push origin master
```

等待 `master` CI 全部通过。

### 4.3 创建并推送 Tag

```powershell
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin v0.1.1
```

Tag 必须与 `package.json.version` 完全一致：

```text
package.json 0.1.1 -> Tag v0.1.1
```

推送 Tag 后，`Release` 工作流自动开始。

## 5. 检查发布结果

### 5.1 GitHub Release

打开 GitHub 仓库的 `Releases` 页面，确认存在：

```text
Po Agent Setup 0.1.1.exe
SHA256SUMS.txt
```

在 Windows 上校验安装包：

```powershell
Get-FileHash -Algorithm SHA256 ".\Po Agent Setup 0.1.1.exe"
```

输出应与 `SHA256SUMS.txt` 一致。

### 5.2 Docker Hub

确认 Docker Hub 中存在：

```text
your-dockerhub-name/po-agent:0.1.1
your-dockerhub-name/po-agent:0.1
your-dockerhub-name/po-agent:latest
your-dockerhub-name/po-agent:sha-<commit>
```

本机验证：

```powershell
docker pull your-dockerhub-name/po-agent:0.1.1
docker run --rm -p 51732:51732 your-dockerhub-name/po-agent:0.1.1
```

然后访问：

```text
http://127.0.0.1:51732
```

生产部署方式及数据卷要求见 [docker-deploy.md](docker-deploy.md)。

## 6. 服务器更新与回滚

生产环境建议固定具体版本，不要只依赖 `latest`：

```yaml
services:
  po-agent:
    image: your-dockerhub-name/po-agent:0.1.1
```

更新：

```bash
docker compose pull
docker compose up -d
```

需要回滚时，将镜像标签改回上一个版本，例如 `0.1.0`，然后再次执行：

```bash
docker compose pull
docker compose up -d
```

当前工作流不会自动连接服务器或重启容器。

## 7. 失败与重试

### Tag 与版本不一致

错误示例：

```text
Tag v0.1.2 does not match package.json version 0.1.1
```

删除错误的远程 Tag，更新版本或创建正确 Tag：

```powershell
git tag -d v0.1.2
git push origin :refs/tags/v0.1.2
```

删除远程 Tag 会影响其他使用者，只应处理尚未正式发布的错误 Tag。

### Docker Hub 配置缺失

如果提示缺少 `DOCKERHUB_USERNAME` 或 `DOCKERHUB_TOKEN`，回到仓库 Actions Variables/Secrets 检查名称和值。Token 必须有推送权限，Docker Hub 仓库必须已经创建。

### GitHub Release 无法创建

检查：

- Release 作业的 `contents: write` 是否被组织策略禁止。
- Git Tag 是否仍然存在。
- GitHub Actions 是否有权使用仓库的 `GITHUB_TOKEN`。

修复后可在失败的工作流页面选择 `Re-run failed jobs`。发布步骤会覆盖同名安装包和校验文件。

### Windows 构建下载超时

GitHub-hosted runner 默认直接访问 Electron 和 electron-builder 的官方下载源。临时网络错误通常可以重跑失败作业。CI 已缓存下载内容，成功下载后后续运行会复用缓存。

### Docker 冒烟测试失败

查看 `Collect logs and remove container` 步骤输出。该步骤即使前面的启动检查失败也会执行，并打印容器日志。

### 未签名安装包被 SmartScreen 拦截

这是当前未配置代码签名时的预期行为。内部测试可以选择“更多信息 -> 仍要运行”；公开发布应配置 Windows 签名 Secret。

## 8. 发布纪律

- 不要从功能分支直接创建正式版本 Tag。
- 不要让 `package.json.version` 与 Tag 不一致。
- 不要复用或泄露 Docker Hub Token。
- 不要手工覆盖已经公开使用的版本标签；有修复时发布新版本。
- 使用 GitHub Tag ruleset 阻止正式版本 Tag 被移动或删除。
- 不要把 `latest` 当作服务器回滚依据，生产服务器使用明确版本号。
