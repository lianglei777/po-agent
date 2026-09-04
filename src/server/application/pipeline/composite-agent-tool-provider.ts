import type { AgentToolContext, AgentToolDefinition, AgentToolProvider } from "@/server/ports/agent-tool";

export class CompositeAgentToolProvider implements AgentToolProvider {
  constructor(private readonly providers: AgentToolProvider[]) {}

  getTools(input: AgentToolContext): AgentToolDefinition[] {
    const allTools: AgentToolDefinition[] = [];
    for (const provider of this.providers) {
      allTools.push(...provider.getTools(input));
    }
    return allTools;
  }
}
