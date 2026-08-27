# Po Agent Desktop 部署手册

本手册说明如何在本机以 Electron 桌面应用形式运行和打包 po-agent。按步骤操作即可跑起来。

## 1. 概述

- po-agent 是**单个 Next.js 应用**:前端和"后端"(`src/app/api/*` 的 Route Handlers)同进程。Desktop 方案用一个 **Electron 壳**包住 Next.js 的 standalone server 产物,启动时在本地随机端口起 server,Electron 窗口直接 `loadURL` 加载它。
- 与其它运行方式的区别:

  | 方式             | 命令                                    | 说明                              |
  | ---------------- | --------------------------------------- | --------------------------------- |
  | 纯 web 开发      | `npm run dev`                           | `next dev`,端口 51731,无 Electron |
  | Docker 部署      | 见 [docker-deploy.md](docker-deploy.md) | 容器化,端口 51732                 |
  | **Desktop 开发** | `npm run desktop:dev`                   | Electron 加载本机 standalone 产物 |
  | **Desktop 打包** | `npm run desktop:dist`                  | 产出 Windows 安装包               |

- Desktop 启动时由 Electron 主进程在 `127.0.0.1` 上**随机分配空闲端口**,不与 `dev`(51731)或 Docker(51732)冲突,三者可同时运行。
- 应用状态(凭证、模型配置、项目列表、会话历史)写入用户数据目录,卸载不丢(除非手动删)。

## 2. 前置条件

- **Node.js**(项目当前要求 Node 22+,与 Docker 基础镜像一致)。
- 仓库已 `npm install`,`electron` 与 `electron-builder` 已在 devDependencies,无需全局安装。
- Windows 打包需 Windows 机器;macOS 的 `dmg` 需 macOS 机器(见第 11 节)。

## 3. 涉及的仓库文件

| 文件                                                                | 作用                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [desktop/main.mjs](../../desktop/main.mjs)                             | Electron 主进程:起 server、建窗口、IPC 目录选择                    |
| [desktop/preload.cjs](../../desktop/preload.cjs)                       | 预加载脚本:向渲染进程暴露 `window.poAgentDesktop`                  |
| [desktop/desktop-runtime.mjs](../../desktop/desktop-runtime.mjs)       | 运行时工具:端口、server 路径、环境变量、数据目录                   |
| [desktop/prepare-standalone.mjs](../../desktop/prepare-standalone.mjs) | 打包前把 `.next/static`、`public` 补进 standalone 产物             |
| [next.config.ts](../../next.config.ts)                                 | `output: "standalone"` 产出独立可运行的 server.js                  |
| [package.json](../../package.json)                                     | `scripts` 定义运行/打包命令,`build` 字段定义 electron-builder 配置 |

## 4. 运行机制

Desktop 应用是"Electron 壳 + 内嵌 Next.js server"的结构。启动流程:

```
┌──────────────────────────────────────────────────┐
│  Electron 主进程  (desktop/main.mjs)              │
│  1. findFreePort()        → 127.0.0.1:<随机端口>  │
│  2. spawn(process.execPath, [server.js])          │
│       env: ELECTRON_RUN_AS_NODE=1                 │
│            PI_CODING_AGENT_DIR=<用户数据目录>      │
│            PORT=<随机>  HOSTNAME=127.0.0.1         │
│            NODE_ENV=production                    │
│  3. waitForServer(url)    → 轮询直到 server 响应   │
│  4. BrowserWindow.loadURL(url)                    │
└──────────────────────────────────────────────────┘
        ↕  IPC  (preload.cjs 桥接)
┌──────────────────────────────────────────────────┐
│  渲染进程  (Next.js 前端)                          │
│  window.poAgentDesktop.selectProjectDirectory()   │
│    → 调主进程弹原生目录选择框                       │
└──────────────────────────────────────────────────┘
```

关键点:

- **Electron 自身当 Node 用**:`ELECTRON_RUN_AS_NODE=1` 让 Electron 可执行文件以纯 Node 模式运行 standalone 的 `server.js`,无需另装 Node。打包后的安装包里不含 Node 运行时,复用 Electron 自带的。
- **server 路径自适应**:开发时用 `.next/standalone/server.js`,打包后用 `resources/server/server.js`(见 [desktop-runtime.mjs](../../desktop/desktop-runtime.mjs) 的 `getStandaloneServerPath`)。
- **原生目录选择**:UI 里"添加项目"时,通过 `preload.cjs` 暴露的 `window.poAgentDesktop.selectProjectDirectory()` 调用 Electron 原生目录选择框,选中的路径注册为 workspace root,agent 即可读写该项目文件。

## 5. 开发模式运行

```bash
npm run desktop:dev
```

等价于 `npm run build && npm run desktop:prepare && electron .`:

1. `next build` 产出 `.next/standalone`(含精简 `node_modules` + `server.js`)
2. `desktop:prepare` 把 `.next/static`、`public` 补进 standalone
3. `electron .` 启动 Electron,加载本机的 standalone server

适合开发 desktop 主进程代码([desktop/main.mjs](../../desktop/main.mjs) 等)时验证。注意改 Next.js 源码需要重新 `build`(不像 `npm run dev` 有热更新);只改 desktop 主进程代码,重启 `electron .` 即可。

> 若只开发前端/后端逻辑、不需要 Electron 环境,直接 `npm run dev`(端口 51731)更快,有热更新。

## 6. 打包

打包分三步:`next build` → `desktop:prepare` → `electron-builder`。有两个产物形态:

| 命令                   | 产物                                                  | 用途                                          |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `npm run desktop:pack` | `.desktop-dist\win-unpacked\`(免安装目录)             | 本机快速验证打包结果,双击 `Po Agent.exe` 即跑 |
| `npm run desktop:dist` | `.desktop-dist\Po Agent Setup 0.1.0.exe`(NSIS 安装包) | 分发给其他 Windows 机器安装                   |

`pack` 不调用 NSIS,更快;`dist` 多一步下载 nsis 并编译安装包。两者都需要下载 `winCodeSign`(代码签名工具,`--dir` 模式也用)。

打包配置见 [package.json](../../package.json) 的 `build` 字段:

- `main: desktop/main.mjs` - Electron 入口
- `files`: `desktop/**/*` + `package.json` + icon 打进 `app.asar`(主进程代码)
- `extraResources`: `.next/standalone` 作为 `server/` 资源随安装包分发
- `win.target: nsis`、`mac.target: dmg`
- `directories.output: .desktop-dist`

## 7. 国内镜像打包

electron-builder 打包时要从 GitHub 下载三类二进制,国内直连会超时(`connect ETIMEDOUT 20.205.243.166:443`):

| 下载项                    | 环境变量                           | 默认源                                                 |
| ------------------------- | ---------------------------------- | ------------------------------------------------------ |
| electron 二进制(~144MB)   | `ELECTRON_MIRROR`                  | github.com/electron/electron                           |
| winCodeSign / nsis / 7zip | `ELECTRON_BUILDER_BINARIES_MIRROR` | github.com/electron-userland/electron-builder-binaries |

**必须两个都设**,只设后者 electron 二进制仍走 GitHub 会超时。项目已内置 `:cn` 后缀的 script,用 `cross-env` 设双镜像指向 npmmirror:

```bash
# 免安装目录(国内)
npm run desktop:pack:cn

# NSIS 安装包(国内)
npm run desktop:dist:cn
```

等价于手动:

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npm run desktop:dist
```

下载的二进制会缓存,二次构建免重下:

- electron 二进制:`%LOCALAPPDATA%\electron\Cache\`
- winCodeSign/nsis/7zip:`%LOCALAPPDATA%\electron-builder\Cache\`

> 原 `desktop:dist` / `desktop:pack` 不变,海外或 CI 环境继续直连 GitHub。国内环境用 `:cn` 版本。

## 8. 产物结构

### `win-unpacked/`(免安装目录,`pack` 产出)

```
.desktop-dist\win-unpacked\
├─ Po Agent.exe              # 主程序(含 electron 运行时,~225MB)
├─ *.dll / *.pak / *.dat         # electron 运行时(ffmpeg、Chromium 等)
├─ locales\                      # 语言包
└─ resources\
   ├─ app.asar                   # Electron 主进程代码(desktop/main.mjs 等)
   └─ server\                    # standalone Next.js server
      ├─ server.js               # server 入口
      ├─ node_modules\           # 精简后的运行时依赖
      └─ .next\static\           # 前端静态资源
```

### NSIS 安装包(`dist` 产出)

- `.desktop-dist\Po Agent Setup 0.1.0.exe`(~146MB,压缩后)
- `.desktop-dist\Po Agent Setup 0.1.0.exe.blockmap`(差量更新块映射,**当前未启用自动更新,暂闲置**,见第 14 节)

安装后,程序在 `%LOCALAPPDATA%\Programs\Po Agent\`,数据在用户数据目录(见第 9 节)。

### 分发安装包给他人

安装包自包含(Electron 运行时 + server + 应用代码),目标机器**无需预装 Node.js 或任何依赖**,双击即可安装。但需注意:

| 项               | 说明                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| SmartScreen 拦截 | 安装包未签名,首次双击会弹"Windows 已保护你的电脑",需点"更多信息"->"仍要运行"。正式分发建议申请代码签名证书 |
| 系统架构         | 仅 64 位 Windows(打包的是 x64)。32 位或 ARM64 需单独打包                                                   |
| 安装权限         | 不需要管理员,装到当前用户目录(`perMachine=false`)                                                          |
| 首次配置         | 安装包不带凭证/配置,接收方首次启动需自行登录 provider、配置模型、添加项目(见第 9 节)                       |
| 网络             | 运行时需访问模型 provider,目标机器要能连这些服务                                                           |

### 构建副产物(可删,不参与运行)

| 文件                                          | 作用                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| `.desktop-dist\builder-effective-config.yaml` | electron-builder 合并所有配置源后的**最终生效配置**快照,排查配置类问题用      |
| `.desktop-dist\builder-debug.yml`             | 实际使用的**文件匹配模式**(含自动追加的默认排除规则),排查"文件该不该打进包"用 |

`.desktop-dist` 整个目录是构建输出,应被 gitignore,不进版本库。

## 9. 数据持久化

server 启动时环境变量 `PI_CODING_AGENT_DIR` 指向用户数据目录(见 [desktop-runtime.mjs](../../desktop/desktop-runtime.mjs) 的 `getPiAgentDir`),路径按 OS 不同:

| OS      | 路径                                                  |
| ------- | ----------------------------------------------------- |
| Windows | `%APPDATA%\Po Agent\pi-agent\`                        |
| macOS   | `~/Library/Application Support/Po Agent/pi-agent/`    |
| Linux   | `~/.config/Po Agent/pi-agent/`(或 `$XDG_CONFIG_HOME`) |

目录内容:

| 文件/目录           | 内容                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `auth.json`         | provider 凭证 / API key                                                                                   |
| `models.json`       | 模型配置                                                                                                  |
| `projects.json`     | 已注册项目路径(workspace roots 启动时从这里回灌)                                                          |
| `web-search.json`   | Web Access Provider、API Key 和搜索/抓取路由配置；首次使用写入保守默认值，也可在应用的 Web 访问设置页维护 |
| `web-search-cache/` | `pi-web-access` 的短期搜索与抓取正文缓存，不是永久 Session Artifact                                       |
| `sessions/`         | 会话历史                                                                                                  |

卸载应用不会删用户数据目录;要彻底清除,手动删上述目录。

## 10. 端口说明

| 场景                 | 端口                        |
| -------------------- | --------------------------- |
| 本机 `npm run dev`   | 51731                       |
| Docker 生产/开发容器 | 51732                       |
| **Desktop 应用**     | **随机空闲端口**(127.0.0.1) |

Desktop 每次启动由 `findFreePort` 分配空闲端口,不固定。与 dev(51731)、Docker(51732)不冲突,三者可同时运行。端口只监听 `127.0.0.1`,不对外暴露。

## 11. 跨平台说明

- **`win-unpacked` 产物不可跨平台使用**。它是 Windows 专属:`Po Agent.exe` 是 PE 格式可执行文件( macOS 需 Mach-O)、`*.dll` 是 Windows 动态库(macOS 用 `.dylib`)、electron 二进制是 `win32-x64` 版本。虽然 `resources/app.asar`(JS 业务代码)跨平台,但包裹它的运行时是 Windows 的。
- **electron-builder 默认只打当前操作系统**。在 Windows 上跑只产出 win 包。
- **macOS 的 `dmg` 只能在 macOS 上生成**(需 `hdiutil`,macOS 专有工具)。在 Windows 上即使加 `--mac` 也只能产 `zip`,产不了 `dmg`。
- 要产出 macOS 包:在 macOS 机器上 `git clone` → `npm install` → `npm run desktop:dist:cn`,会产出 `Po Agent-0.1.0.dmg`。`:cn` 的双镜像在 macOS 上同样适用。
- 要一次构建多平台,建议用 CI(如 GitHub Actions matrix,每个平台一个 runner),而非单机交叉打包。

## 12. 故障排查

| 现象                                                                          | 排查                                                                                                           |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 打包报 `connect ETIMEDOUT 20.205.243.166:443` 或 `Timeout awaiting 'request'` | GitHub 直连超时,改用 `:cn` 后缀命令(见第 7 节)                                                                 |
| `desktop:dev` 启动后白屏、窗口无响应                                          | server 没起来。确认 `.next/standalone\server.js` 存在(需先 `npm run build`);`waitForServer` 30s 超时会弹错误框 |
| `next build` 报 NFT 警告(`Encountered unexpected file in NFT list`)           | 已知警告,源于 [next.config.ts](../../next.config.ts) trace 链路,不影响产物,可忽略                                 |
| 打包后运行报找不到 `server.js`                                                | 确认 `extraResources` 配置未改;打包产物 `resources\server\server.js` 应存在                                    |
| 安装时 Windows SmartScreen 拦截                                               | 安装包未代码签名(无证书),`signtool` 跳过。点"更多信息"→"仍要运行"即可；详见第 8 节(分发安装包给他人)           |
| 找不到 `cross-env`                                                            | `npm install` 重装依赖;`cross-env` 在 devDependencies                                                          |
| 改了 desktop 主进程代码打包后没生效                                           | `desktop/**/*` 打进 `app.asar`,需重新 `npm run desktop:dist:cn`                                                |
| 凭证/项目丢失                                                                 | 确认未手动删用户数据目录(第 9 节);检查 `PI_CODING_AGENT_DIR` 是否被覆盖                                        |
| 打包很慢、每次都重新下载                                                      | 确认缓存目录(第 7 节)未被清理;首次下载后二次构建应复用缓存                                                     |

## 13. 验证清单

- [ ] `npm run desktop:dev` 启动,Electron 窗口打开,页面正常加载
- [ ] UI 里"添加项目"能弹出原生目录选择框,选中目录后能注册为 workspace root
- [ ] `npm run desktop:pack:cn` 产出 `.desktop-dist\win-unpacked\Po Agent.exe`,双击能跑
- [ ] `npm run desktop:dist:cn` 产出 `.desktop-dist\Po Agent Setup 0.1.0.exe`
- [ ] 安装包能在另一台 Windows 机器上安装并启动
- [ ] 登录一个 provider、配置一个模型、添加一个项目,重启应用后仍在(数据持久化生效)
- [ ] （可选）国内网络下 `:cn` 命令下载无超时

## 14. 待办:自动更新与增量分发

当前**未启用自动更新**(`--publish never`、无 `publish` 配置、未集成 `electron-updater`),`.blockmap` 文件生成了但闲置。将来要支持差量更新(用户升级时只下载变化的块,而非完整安装包),需完成以下 TODO:

- [ ] 在 [package.json](../../package.json) 的 `build` 字段加 `publish` 配置(GitHub Releases / S3 / 通用 server)
- [ ] 安装 `electron-updater` 依赖
- [ ] 在 [desktop/main.mjs](../../desktop/main.mjs) 集成 `autoUpdater`(`autoUpdater.checkForUpdatesAndNotify()`)
- [ ] 打包命令从 `--publish never` 改为 `always` 或 `onTagOrDraft`,发布时把安装包 + blockmap + `latest.yml` 推到 publish 目标
- [ ] 验证:旧版本升级到新版本时,electron-updater 用 blockmap 差量下载,而非下载完整安装包
