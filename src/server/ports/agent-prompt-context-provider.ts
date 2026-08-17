import type { ActiveGenerationTurn } from "@/server/domain/agent-command";
import type { AgentGenerationAsset } from "@/contracts/agent";

export interface AgentPromptContextProvider {
  getPromptContext(
    sessionId: string,
    generation?: ActiveGenerationTurn,
    assets?: AgentGenerationAsset[],
  ): Promise<string | undefined>;
}
