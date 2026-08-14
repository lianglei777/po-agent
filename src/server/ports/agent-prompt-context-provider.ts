import type { ActiveGenerationTurn } from "@/server/domain/agent-command";

export interface AgentPromptContextProvider {
  getPromptContext(
    sessionId: string,
    generation?: ActiveGenerationTurn,
  ): Promise<string | undefined>;
}
