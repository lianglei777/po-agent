import type {
  AgentRuntime,
  AgentRuntimeRegistry,
  ModelConfigInvalidation,
} from "@/server/ports/agent-runtime";

type RuntimeEntry = {
  runtime: AgentRuntime;
  idleTimer: ReturnType<typeof setTimeout>;
};

export class InMemoryAgentRegistry implements AgentRuntimeRegistry {
  private readonly runtimes = new Map<string, RuntimeEntry>();
  private readonly startLocks = new Map<string, Promise<AgentRuntime>>();

  constructor(private readonly idleTimeoutMs = 10 * 60 * 1000) {}

  get(sessionId: string): AgentRuntime | undefined {
    const entry = this.runtimes.get(sessionId);
    if (!entry) return undefined;
    if (!entry.runtime.isAlive()) {
      this.destroy(sessionId);
      return undefined;
    }
    this.touch(sessionId);
    return entry.runtime;
  }

  async getOrStart(
    key: string,
    factory: () => Promise<AgentRuntime>,
  ): Promise<AgentRuntime> {
    const existing = this.get(key);
    if (existing) return existing;
    const pending = this.startLocks.get(key);
    if (pending) return pending;

    const start = factory()
      .then((runtime) => {
        this.register(runtime.sessionId, runtime);
        return runtime;
      })
      .finally(() => {
        this.startLocks.delete(key);
      });
    this.startLocks.set(key, start);
    return start;
  }

  register(sessionId: string, runtime: AgentRuntime): void {
    const existing = this.runtimes.get(sessionId);
    if (existing?.runtime !== runtime) existing?.runtime.destroy();
    if (existing) clearTimeout(existing.idleTimer);
    this.runtimes.set(sessionId, {
      runtime,
      idleTimer: this.createTimer(sessionId),
    });
  }

  remove(sessionId: string): void {
    const entry = this.runtimes.get(sessionId);
    if (entry) clearTimeout(entry.idleTimer);
    this.runtimes.delete(sessionId);
  }

  destroy(sessionId: string): void {
    const entry = this.runtimes.get(sessionId);
    if (!entry) return;
    clearTimeout(entry.idleTimer);
    this.runtimes.delete(sessionId);
    entry.runtime.destroy();
  }

  touch(sessionId: string): void {
    const entry = this.runtimes.get(sessionId);
    if (!entry) return;
    clearTimeout(entry.idleTimer);
    entry.idleTimer = this.createTimer(sessionId);
  }

  invalidateModelConfig(invalidation: ModelConfigInvalidation): void {
    for (const { runtime } of this.runtimes.values()) {
      runtime.invalidateModelConfig(invalidation);
    }
  }

  invalidateWebAccessConfig(): void {
    for (const { runtime } of this.runtimes.values()) {
      runtime.invalidateWebAccessConfig();
    }
  }

  async reloadAgentSettings(): Promise<void> {
    await Promise.all(
      [...this.runtimes.values()].map(({ runtime }) =>
        runtime.reloadAgentSettings(),
      ),
    );
  }

  private createTimer(sessionId: string): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => this.destroy(sessionId), this.idleTimeoutMs);
    timer.unref?.();
    return timer;
  }
}
