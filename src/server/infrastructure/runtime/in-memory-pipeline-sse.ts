import type { PipelineSseEvent, PipelineSsePort } from "@/server/ports/pipeline-sse-port";

export class InMemoryPipelineSse implements PipelineSsePort {
  private listeners = new Map<string, Set<(event: PipelineSseEvent) => void>>();

  emit(event: PipelineSseEvent): void {
    const subs = this.listeners.get(event.projectId);
    if (subs) {
      for (const listener of subs) {
        try {
          listener(event);
        } catch {
          // listener 错误不影响其他订阅者
        }
      }
    }
  }

  subscribe(projectId: string, listener: (event: PipelineSseEvent) => void): () => void {
    let subs = this.listeners.get(projectId);
    if (!subs) {
      subs = new Set();
      this.listeners.set(projectId, subs);
    }
    subs.add(listener);
    return () => {
      const current = this.listeners.get(projectId);
      if (current) {
        current.delete(listener);
        if (current.size === 0) this.listeners.delete(projectId);
      }
    };
  }
}
