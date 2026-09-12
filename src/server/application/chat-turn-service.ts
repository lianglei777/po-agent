import type { AgentService } from "./agent-service";

/** 为 Chat 初次载入提供会话状态；消息提交统一走标准 Agent 命令端点。 */
export class ChatTurnService {
  constructor(private readonly agents: AgentService) {}

  async getSnapshot(sessionId: string) {
    return { agent: await this.agents.getState(sessionId) };
  }
}
