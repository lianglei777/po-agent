import type { AgentCommand } from "@/server/domain/agent-command";
import type { AgentEvent } from "@/server/domain/agent-event";
import type { AgentRuntimeState } from "@/server/domain/agent-state";
import type { AgentToolDefinition } from "@/server/ports/agent-tool";

export interface ModelConfigTarget {
  provider: string;
  modelId?: string;
}

export type ModelConfigInvalidation =
  | { scope: "all" }
  | { scope: "targets"; targets: ModelConfigTarget[] };

/**
 * Agent 运行时端口，表示一个存活的 Agent 会话实例。
 *
 * 封装向 Agent 发送命令、读取状态、订阅事件以及销毁实例的能力。
 * 具体实现由 infrastructure 层的 Pi SDK 适配器提供。
 */
export interface AgentRuntime {
  /** 会话唯一标识。 */
  readonly sessionId: string;
  /** 会话持久化文件路径。 */
  readonly sessionFile: string;
  /** 判断运行时实例是否仍然存活。 */
  isAlive(): boolean;
  /** 标记模型配置已更新，在下一次请求模型前重新加载。 */
  invalidateModelConfig(invalidation: ModelConfigInvalidation): void;
  /** 向 Agent 发送命令并等待返回结果。 */
  execute<T = unknown>(command: AgentCommand): Promise<T>;
  /** 获取 Agent 当前运行时状态。 */
  getState(): Promise<AgentRuntimeState>;
  /**
   * 订阅 Agent 事件流。
   *
   * 返回的取消函数用于移除监听器，避免内存泄漏。
   */
  subscribe(listener: (event: AgentEvent) => void): () => void;
  /** 销毁运行时实例，释放底层资源。 */
  destroy(): void;
}

/** 创建 Agent 运行时实例所需的输入参数。 */
export interface CreateRuntimeInput {
  /** 调用方指定的会话标识；未提供时由实现生成。 */
  requestedSessionId?: string;
  /** 会话持久化文件路径；未提供时由实现决定。 */
  sessionFile?: string;
  /** Agent 工作目录。 */
  cwd: string;
  /** 允许 Agent 使用的工具名称列表；未提供时使用默认工具集。 */
  toolNames?: string[];
  /** 项目自有工具，由 infrastructure 适配为底层 SDK 工具。 */
  customTools?: AgentToolDefinition[];
}

/** Agent 运行时工厂端口，负责创建新的运行时实例。 */
export interface AgentRuntimeFactory {
  create(input: CreateRuntimeInput): Promise<AgentRuntime>;
}

/**
 * Agent 运行时注册表端口。
 *
 * 管理活跃运行时实例的生命周期与并发访问，避免重复创建相同会话。
 */
export interface AgentRuntimeRegistry {
  /** 根据会话标识获取运行时实例，不存在时返回 `undefined`。 */
  get(sessionId: string): AgentRuntime | undefined;
  /**
   * 获取或启动运行时实例。
   *
   * 若指定 key 对应的实例已存在则直接返回，否则调用 factory 创建并注册。
   * 保证并发请求不会重复创建同一会话。
   */
  getOrStart(
    key: string,
    factory: () => Promise<AgentRuntime>,
  ): Promise<AgentRuntime>;
  /** 注册一个运行时实例。 */
  register(sessionId: string, runtime: AgentRuntime): void;
  /** 移除注册但不销毁实例。 */
  remove(sessionId: string): void;
  /** 销毁并移除指定会话的运行时实例。 */
  destroy(sessionId: string): void;
  /** 更新指定会话的最近访问时间，用于空闲回收等策略。 */
  touch(sessionId: string): void;
  /** 通知所有已加载运行时模型配置已更新。 */
  invalidateModelConfig(invalidation: ModelConfigInvalidation): void;
}
