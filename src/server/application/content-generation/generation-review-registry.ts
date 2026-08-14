import type { ActiveGenerationTurn } from "@/server/domain/agent-command";

/**
 * 记录当前 Agent 轮次是否要求在供应商调用前进行参数确认。
 * 状态只覆盖正在执行的 prompt，避免把一次性的用户选择固化为 Session 模式。
 */
export class GenerationReviewRegistry {
  private readonly sessions = new Map<string, ActiveGenerationTurn>();

  begin(sessionId: string, policy: ActiveGenerationTurn | undefined): void {
    if (policy) this.sessions.set(sessionId, policy);
    else this.sessions.delete(sessionId);
  }

  end(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  requiresReview(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.reviewFirst === true;
  }

  current(sessionId: string): ActiveGenerationTurn | undefined {
    return this.sessions.get(sessionId);
  }
}
