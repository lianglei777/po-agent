# ADR 0001：统一 Session 与持久化生成运行时

- 状态：已接受
- 日期：2026-08-06

## 背景

早期内容生成实现使用独立 JSON Session/Job、可编辑 HTTP 模板和专用 API。该模型会把供应商协议泄漏到应用层，并让聊天与生成形成两套 Session、状态和 UI 分支。

当前产品面向本地优先、单用户和长驻 Node.js 进程。内容生成任务可能持续较长时间，需要跨页面断开和进程重启保存状态，同时当前仅接入 RunningHub，但要保留未来增加供应商的明确边界。

## 决策

1. 只保留一种 Pi Session。Chat 与 Generate 是同一 Session 的两个视图，不是两种 Session 类型。
2. Pi Session 文件保存消息树和模型上下文；SQLite 保存 Session 投影、Generation Run、Provider Job、Route 和 Artifact。
3. application 只使用稳定的 capability、语义参数和素材槽位。供应商 operation、字段映射和响应解析封装在 adapter 中。
4. Route 由应用代码维护并种入 SQLite；对客户端返回只读 `inputSchema`，不开放通用 HTTP 模板编辑器。
5. Worker 通过 SQLite lease 推进任务。HTTP 请求、SSE 或工具等待结束不决定 Run 生命周期。
6. 凭证通过独立 credential store 引用，不写入 SQLite、Run、Job、日志或响应。
7. 不迁移开发期 `content-generation.json`，不双写，也不保留旧读取回退。

## 结果

- 生成 UI 与 Agent 工具共享同一 Run 状态机、幂等和恢复语义。
- 新供应商通过实现 provider port、adapter 和受控 Route 加入，不改变应用输入契约。
- 当前设置页只管理 RunningHub 凭证并展示只读 Route；新增供应商时可以扩展凭证管理，而无需恢复通用协议编辑。
- SQLite schema migration 仍需长期维护；多进程或 Serverless 部署前必须重新设计 Worker 协调和数据库边界。
