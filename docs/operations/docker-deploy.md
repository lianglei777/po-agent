# Po Agent Docker 部署手册

本手册说明如何把 po-agent 部署到 Docker 环境,覆盖两种场景:

- **本机 Docker Desktop**(Windows/Mac/Linux):在本机构建并运行,适合日常使用和开发。
- **云服务器**(如腾讯云 Linux):本机构建镜像后传到服务器运行,适合远程部署。

按所在场景选择对应章节操作即可。

## 1. 概述

- po-agent 是**单个 Next.js 应用**:前端和"后端"(`src/app/api/*` 的 Route Handlers)同进程,只需构建**一个镜像、跑一个容器**。
- Docker 部署统一用端口 **51732**,与本机 `npm run dev` 的 51731 错开,两者可同时运行。
- 应用状态(凭证、模型配置、项目列表、会话历史)通过数据卷持久化,容器删除不丢。
- 两种场景的核心差异:

| 方面 | 本机 Docker Desktop | 云服务器 |
|---|---|---|
| 构建位置 | 本机 | 本机构建,传镜像,不在服务器构建 |
| 镜像架构 | 宿主机原生 | 显式 `linux/amd64` |
| 端口绑定 | `0.0.0.0:51732` | `127.0.0.1:51732`(不暴露公网) |
| 工作区挂载 | Desktop(Win/Mac)或 `~/po-agent-user-workspace`(Linux) | 服务器上的指定目录 |
| 访问方式 | 直接 `http://localhost:51732` | SSH 隧道 |
| `WORKSPACE_HOST_DIR` | 启动脚本自动设置 | 服务器 compose 里直接写死路径 |

### 端口说明

| 场景 | 端口 |
|---|---|
| 本机 `npm run dev` | 51731 |
| Docker 生产容器 | 51732 |
| Docker 开发容器 | 51732 |

- 本机 dev 与 Docker 容器**可同时运行**(端口不冲突)。
- 生产容器与开发容器都占 51732,**不能同时运行**。
- 如需改端口:改 [docker-compose.yml](../../docker-compose.yml) 的 `ports` 映射(左是宿主机端口)和 `PORT` 环境变量,以及 [Dockerfile](../../Dockerfile) 的 `ENV PORT` / `EXPOSE`。

## 2. 涉及的仓库文件

| 文件 | 作用 |
|---|---|
| [next.config.ts](../../next.config.ts) | `output: "standalone"` 产出独立运行产物 |
| [Dockerfile](../../Dockerfile) | 生产镜像(多阶段构建) |
| [Dockerfile.dev](../../Dockerfile.dev) | 开发镜像(热更新) |
| [.dockerignore](../../.dockerignore) | 构建上下文排除 |
| [docker-compose.yml](../../docker-compose.yml) | 生产运行编排 |
| [docker-compose.dev.yml](../../docker-compose.dev.yml) | 开发运行编排 |
| [scripts/docker-up.ps1](../../scripts/docker-up.ps1) | Windows 启动脚本(自动挂工作区) |
| [scripts/docker-up.sh](../../scripts/docker-up.sh) | Mac/Linux 启动脚本(自动挂工作区) |

> 云服务器部署只需 [Dockerfile](../../Dockerfile) 和 [.dockerignore](../../.dockerignore),compose 文件在服务器上单独创建(见第 5 节)。

## 3. 安全须知

- ✅ 本机部署:51732 只在本机访问,不要暴露到公网
- ✅ 云服务器部署:端口绑定 `127.0.0.1`,通过 SSH 隧道访问(见 5.8)
- ❌ **绝对不要**把 51732 直接对公网开放

> 若需公网 URL 访问,必须在前面加反向代理 + 认证。当前版本不支持应用层登录。

## 4. 场景一:本机 Docker Desktop 部署

### 4.1 前置条件

- 已安装并启动 **Docker Desktop**(Windows,WSL2 后端)。
- 建议在 `Docker Desktop -> Settings -> Docker Engine` 配置 `registry-mirrors`,拉基础镜像 `node:22-bookworm-slim` 更快。
- 仓库已包含部署所需文件(见第 2 节),无需额外生成。

### 4.2 启动部署

推荐用启动脚本,它会按宿主机 OS 自动设置 `WORKSPACE_HOST_DIR` 并把本机工作区挂进容器:

```powershell
# Windows(PowerShell)
.\scripts\docker-up.ps1
```
```bash
# Mac / Linux(首次需 chmod +x scripts/docker-up.sh)
./scripts/docker-up.sh
```

首次执行会拉基础镜像 + `npm ci` + `next build`,耗时较长;后续启动命中层缓存会快很多。生产模式后台启动,确认状态:

```bash
docker compose logs -f po-agent
```

看到 `Ready` 之类日志后,浏览器访问 **http://localhost:51732**。

> 也可以直接 `docker compose up --build -d`,但 compose 要求 `WORKSPACE_HOST_DIR` 已设置(见 4.3),否则报错退出。脚本会自动设好,推荐用脚本。

### 4.3 本机工作区

compose 把宿主机目录挂进容器的 `/workspace`,宿主机路径由 `WORKSPACE_HOST_DIR` 决定,启动脚本按 OS 自动设置:

| 宿主机 OS | `WORKSPACE_HOST_DIR` | 容器内路径 |
|---|---|---|
| Windows | `%USERPROFILE%\Desktop` | `/workspace` |
| Mac | `$HOME/Desktop` | `/workspace` |
| Linux | `$HOME/po-agent-user-workspace`(脚本自动创建) | `/workspace` |

挂载后,在 UI 里"添加项目" -> 浏览 `/workspace` -> 能看到你 Desktop(或 Linux 工作区)里的目录 -> 选中某个项目添加。添加后该路径自动成为 workspace root,agent 即可读写该项目文件。

> 浏览目录不受 workspace root 限制(可浏览容器内任意路径),但文件读写要求路径在已注册的 workspace root 下。`add` 项目时会自动注册,所以添加后即可访问。

### 4.4 开发模式(可选)

在容器里跑 `next dev`,改源码即热更新,适合不污染本机 Node 环境地开发 po-agent 本身。同样用启动脚本,加 `dev` 参数:

```powershell
.\scripts\docker-up.ps1 dev
```
```bash
./scripts/docker-up.sh dev
```

访问 http://localhost:51732,改源码自动热更新。

注意事项:

- **改了依赖要重建**:`package.json` / `package-lock.json` 变化后,重新启动(脚本带 `--build`);必要时先 `docker compose -f docker-compose.dev.yml down` 清掉旧的 `/app/node_modules` 匿名卷再重建。
- **Windows 文件监听**:跨 bind-mount 的文件监听偶有延迟,Fast Refresh 可能不灵;体验不佳时直接本机 `npm run dev`。
- 开发容器与生产容器共用 `po-agent-data` 数据卷,凭证互通。

## 5. 场景二:云服务器部署

以腾讯云 Linux + 宝塔面板、2 核 2G 为例。核心思路:**在本机构建好 `linux/amd64` 镜像,传到服务器加载运行**,不在服务器上构建。

### 5.1 前置条件

**本机:**

- 已安装 Docker Desktop(Windows,WSL2 后端),用于构建 linux/amd64 镜像。
- 仓库已包含 [Dockerfile](../../Dockerfile)、[.dockerignore](../../.dockerignore)。

**服务器:**

- 云服务器一台(本文以腾讯云 Linux、2 核 2G、宝塔面板为例)。
- 已安装 Docker 引擎(宝塔「Docker」管理器首次使用会引导安装)。
- 有 root 或 sudo 权限。
- SSH 端口(22)可从本机访问。

### 5.2 内存与 swap

`next build` 峰值要吃 2-4G 内存,2G 服务器**在服务器上构建一定 OOM**。所以全程在本机构建,服务器只负责运行。但运行时也要留余量,2G 服务器建议加 2G swap。

SSH 或宝塔「终端」执行,先检查:

```bash
free -h
swapon --show
```

如果没有 swap,创建 2G:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

> 宝塔面板可能装了 Nginx / MySQL 等服务占用内存。部署前确认 `free -h` 的 `available` 列**至少剩 500MB**。若不足,先停掉不必要的服务或升级配置。

### 5.3 本机构建镜像

在项目根目录构建 `linux/amd64` 镜像并导出:

```powershell
# 构建指定架构镜像
docker build --platform linux/amd64 -t po-agent:0.1.0 .

# 导出为 tar(Windows PowerShell 没有 gzip,直接导出未压缩 tar)
docker save po-agent:0.1.0 -o po-agent.tar
```

> `--platform linux/amd64` 必须显式指定,否则本机可能构建出架构不匹配的镜像,服务器上跑不起来。
>
> [Dockerfile](../../Dockerfile) 默认走 npmmirror 加速;如需切回官方源:
> `docker build --platform linux/amd64 --build-arg NPM_REGISTRY=https://registry.npmjs.org -t po-agent:0.1.0 .`
>
> **想要更小的压缩文件**:Windows PowerShell 没有 `gzip`。若装了 Git for Windows,在 **Git Bash**(非 PowerShell)里执行 `docker save po-agent:0.1.0 | gzip > po-agent.tar.gz` 可得到压缩包,上传更快。`docker load` 对 `.tar` 和 `.tar.gz` 都能自动识别。

### 5.4 上传镜像到服务器

两种方式,任选其一。下面以未压缩的 `po-agent.tar` 为例;若用了 Git Bash 压缩,把文件名换成 `po-agent.tar.gz` 即可。

**方式一:宝塔文件管理器上传(适合不熟 scp)**

1. 宝塔面板 ->「文件」。
2. 进入 `/opt/` 目录(没有则新建)。
3. 上传本机的 `po-agent.tar`。

**方式二:scp 上传**

```powershell
scp po-agent.tar root@你的服务器IP:/opt/
```

### 5.5 服务器加载镜像

宝塔「终端」或 SSH 执行:

```bash
docker load -i /opt/po-agent.tar
docker images   # 确认 po-agent:0.1.0 在列
```

> `docker load` 能自动识别 `.tar` 和 `.tar.gz`,压缩包用 `docker load < /opt/po-agent.tar.gz` 亦可。
>
> 若提示 `docker: command not found`,在宝塔 ->「Docker」里安装 Docker 管理器。

### 5.6 服务器上的 docker-compose.yml

在服务器上创建运行目录和工作区目录:

```bash
mkdir -p /opt/po-agent /root/po-agent-workspace
```

创建 `/opt/po-agent/docker-compose.yml`(可用宝塔文件管理器或 `nano`):

```yaml
services:
  po-agent:
    image: po-agent:0.1.0
    container_name: po-agent
    ports:
      # 关键:只绑 127.0.0.1,不对公网开放
      - "127.0.0.1:51732:51732"
    environment:
      PI_CODING_AGENT_DIR: /data/pi-agent
      PORT: "51732"
      HOSTNAME: "0.0.0.0"
    volumes:
      # 持久化:凭证 / 模型配置 / 项目列表 / 会话历史
      - po-agent-data:/data/pi-agent
      # 服务器工作区:改成你放项目的目录
      - /root/po-agent-workspace:/workspace
    restart: unless-stopped

volumes:
  po-agent-data:
```

与本机 [docker-compose.yml](../../docker-compose.yml) 的两个关键区别:

1. **`ports` 绑定 `127.0.0.1`**:`127.0.0.1:51732:51732` 表示只监听本机回环,公网访问不到。这是安全的核心。
2. **工作区挂载**换成服务器目录(服务器没有 Desktop)。

### 5.7 启动与验证

```bash
cd /opt/po-agent
docker compose up -d
docker compose logs -f po-agent   # 看到 Ready 即成功
```

启动后检查内存占用,确认 2G 够用:

```bash
docker stats --no-stream
free -h
```

如果容器反复重启或内存爆满,说明可用内存不足,需升级配置或停掉部分宝塔服务。

### 5.8 从本机访问(SSH 隧道)

因为端口只绑了 `127.0.0.1`,要通过 SSH 隧道访问。本机 Windows PowerShell:

```powershell
ssh -L 51732:localhost:51732 root@你的服务器IP
```

保持这个 SSH 窗口不关,本机浏览器打开 **http://localhost:51732** 即可,流量走 SSH 加密,公网完全暴露不到。

### 5.9 宝塔面板注意事项

| 事项 | 说明 |
|---|---|
| **防火墙** | 宝塔「安全」+ 腾讯云安全组都**不要**放行 51732。SSH 隧道走 22 端口,本来就有 |
| **Docker 管理器** | 宝塔「Docker」面板可查看容器状态、日志,可替代命令行监控 |
| **终端** | 宝塔「终端」可直接跑 docker 命令,不必单独 SSH |

### 5.10 后续更新

代码更新后,重复 5.3-5.5 步:本机构建新镜像 -> 导出 tar -> 上传 -> 服务器 `docker load`,然后:

```bash
cd /opt/po-agent
docker compose up -d   # 自动用新镜像重启容器
```

> 频繁更新时,每次传几百 MB 的 tar 包较慢。可改用 Docker Hub 镜像仓库(见 5.11):`docker push` 到仓库,服务器 `docker pull`,只传变化层,无需 scp。

### 5.11 替代方案:通过 Docker Hub 传输镜像(无需 tar)

5.3-5.5 的 tar 方式每次传完整镜像,频繁更新较慢。另一种方式是把镜像推送到 Docker Hub,服务器直接拉取--后续只传变化的层,且是 CI/CD 自动部署的基础。

**前置:注册 Docker Hub 账号并建仓库**

1. 注册 [hub.docker.com](https://hub.docker.com),记下用户名(下面用 `你的用户名` 代替)。
2. `Repositories -> Create`,仓库名填 `po-agent`,可见性选 **Public**(服务器拉取不用 login)。
3. `Account Settings -> Security -> New Access Token`,生成令牌(代替密码,更安全),复制保存。

**本机:登录、打标签、推送**

```powershell
# 登录(用户名 + 上一步的 token)
docker login

# 给镜像打 Docker Hub 格式的标签(版本号 + latest)
docker tag po-agent:0.1.0 你的用户名/po-agent:0.1.0
docker tag po-agent:0.1.0 你的用户名/po-agent:latest

# 推送
docker push 你的用户名/po-agent:0.1.0
docker push 你的用户名/po-agent:latest
```

> `docker tag` 不复制镜像,只是加个别名,很快。`latest` 标签让服务器每次拉最新版本。

**服务器:拉取镜像**

```bash
docker pull 你的用户名/po-agent:latest
```

**服务器 docker-compose.yml 的镜像地址**改成 Docker Hub 路径(替换 5.6 里的 `image`):

```yaml
services:
  po-agent:
    image: 你的用户名/po-agent:latest   # 原来是 po-agent:0.1.0
    ...
```

> public 镜像服务器不用 `docker login`。若设为 private,服务器需先 `docker login` 再 pull。
>
> **速度说明**:本机 push 到 Docker Hub(国际源)可能慢;服务器从国内拉国际源也可能慢。但后续更新只拉变化的层,比每次传完整 tar 快。若服务器拉取太慢,考虑阿里云 ACR 个人版(国内源,需确认当前是否免费)。

## 7. 首次使用配置

容器跑起来、能访问后,在浏览器 UI 里完成:

1. **登录模型 provider**:走 device code 流程,页面上会显示授权码和链接,按提示在 provider 端完成授权。
2. **配置模型**:填入 API key 或选择已登录的 provider,配置要用的大模型。
3. **添加项目**:浏览 `/workspace` 选中你的项目目录添加。

这些状态写入数据卷(见第 8 节),重启容器后仍在。

## 8. 数据持久化

环境变量 `PI_CODING_AGENT_DIR=/data/pi-agent`,挂命名卷 `po-agent-data`。该目录包含:

| 文件/目录 | 内容 |
|---|---|
| `auth.json` | provider 凭证 / API key |
| `models.json` | 模型配置 |
| `projects.json` | 已注册项目路径(workspace roots 启动时从这里回灌) |
| `sessions/` | 会话历史 |

`docker compose down` 只删容器,数据卷保留;`docker compose down -v` 才会连数据卷一起删(凭证会丢)。

## 9. 国内镜像源

[Dockerfile](../../Dockerfile) 与 [Dockerfile.dev](../../Dockerfile.dev) 通过 `NPM_REGISTRY` build-arg 控制 npm 源,默认 `https://registry.npmmirror.com`。

**本机部署**切回官方源:

```bash
docker compose build --build-arg NPM_REGISTRY=https://registry.npmjs.org
# 开发模式
docker compose -f docker-compose.dev.yml build --build-arg NPM_REGISTRY=https://registry.npmjs.org
```

**云服务器部署**在 `docker build` 时传 build-arg:

```powershell
docker build --platform linux/amd64 --build-arg NPM_REGISTRY=https://registry.npmjs.org -t po-agent:0.1.0 .
```

## 10. 常用运维命令

### 本机 Docker Desktop

```bash
# 启动(经脚本自动挂工作区)
.\scripts\docker-up.ps1            # Windows
./scripts/docker-up.sh             # Mac/Linux

# 停止并删容器(保留数据卷)
docker compose down

# 查看日志
docker compose logs -f po-agent

# 重新构建(改了代码或依赖后)
docker compose up --build -d

# 连数据卷一起清空(慎用,凭证会丢)
docker compose down -v
```

### 云服务器

```bash
cd /opt/po-agent

# 启动
docker compose up -d

# 停止并删容器(保留数据卷)
docker compose down

# 查看日志
docker compose logs -f po-agent

# 查看资源占用
docker stats --no-stream

# 连数据卷一起清空(慎用,凭证会丢)
docker compose down -v
```
