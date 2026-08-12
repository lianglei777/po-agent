/**
 * 记录当前 Agent 轮次是否要求在供应商调用前进行参数确认。
 * 状态只覆盖正在执行的 prompt，避免把一次性的用户选择固化为 Session 模式。
 */
export class GenerationReviewRegistry {
  private readonly sessions = new Set<string>();

  begin(sessionId: string, required: boolean): void {
    if (required) this.sessions.add(sessionId);
    else this.sessions.delete(sessionId);
  }

  end(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  requiresReview(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }
}
