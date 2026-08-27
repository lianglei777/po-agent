# 自动上下文压缩设计

## 产品语义

上下文压缩由 Agent Runtime 自动管理。Chat Input 不提供手动 Compact 操作，用户只在“设置 → 常规”中控制全局“自动上下文压缩”偏好。

该偏好默认开启，写入 Pi 的全局 `settings.json`。它不依赖当前 Session，因此在新对话、历史会话或没有活动 Runtime 时都可以读取和修改。

## 设置链路

```text
WorkspaceSettings
  -> GET/PATCH /api/agent-settings
  -> AgentSettingsService
  -> AgentSettingsStore
  -> Pi SettingsManager
  -> global settings.json
```

设置成功写入后，`AgentSettingsService` 调用 `AgentRuntimeRegistry.reloadAgentSettings()`，让当前进程中的存活 Runtime 重新读取全局与项目设置。之后新建或恢复的 Runtime 会在初始化时自然读取最新值。

前端采用受控 Switch：

- 初次加载期间显示 loading 并禁止重复操作；
- 保存时先乐观更新；
- 保存失败时恢复旧值，并在设置行旁显示可见错误；
- 不通过 Chat Store、BranchState 或活动 Session 传递设置。

## 自动压缩生命周期

Pi SDK 在需要时自动触发 compaction。Runtime 将 SDK 事件映射为稳定的 Agent SSE 事件：

```ts
type AgentEvent =
  | { type: "compaction_start" }
  | {
      type: "compaction_end";
      aborted?: boolean;
      errorMessage?: string;
    };
```

前端收到 `compaction_start` 后设置 `isCompacting = true`，收到 `compaction_end` 后清除状态；成功时刷新 Session history，使最新的上下文结构进入消息状态，失败时使用统一 action error 展示错误。

`compactionSummary` 是提供给模型的内部消息，仍由消息展示层过滤，不在 Chat 中渲染。

## 停止与清理

Pi SDK 的普通 `abort()` 不会取消正在进行的 compaction，因此保留 `abort_compaction` 命令。主停止操作在 `isCompacting` 时发送 `abort_compaction`，其余运行阶段发送普通 `abort`。

必须继续保留：

- `isCompacting` Runtime 状态；
- `compaction_start` / `compaction_end` SSE 映射；
- 自动压缩完成后的 history 刷新；
- `abort_compaction`；
- Runtime 销毁、SSE 断开和错误清理行为。

## 已移除的手动链路

- Chat Input 的 Compact / Abort compact 按钮；
- `compact` Agent command 和手动压缩 HTTP 响应；
- `compactionAvailable` Runtime 字段及前端可用性派生；
- 手动压缩成功、无内容可压缩和错误提示状态；
- Chat Store 中的自动压缩偏好副本。

## 主要文件

| 文件 | 职责 |
|---|---|
| `src/features/agent-settings/use-agent-settings.ts` | 设置加载、乐观更新、失败回滚 |
| `src/app/api/agent-settings/route.ts` | 全局 Agent 设置 HTTP 入口 |
| `src/server/application/agent-settings-service.ts` | 持久化设置并刷新存活 Runtime |
| `src/server/infrastructure/pi/pi-agent-settings-store.ts` | Pi SettingsManager 适配器 |
| `src/server/infrastructure/runtime/in-memory-agent-registry.ts` | 广播 Runtime 设置刷新 |
| `src/features/chat/use-chat-controller.ts` | 自动压缩 SSE 状态与停止逻辑 |
| `src/features/chat/message-presentation.ts` | 过滤内部 compaction summary |
