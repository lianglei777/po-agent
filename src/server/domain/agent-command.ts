import type { AgentGenerationPolicy as ContractAgentGenerationPolicy } from "@/contracts/agent";

export type ActiveGenerationTurn = ContractAgentGenerationPolicy & {
  originalPrompt: string;
};

export {
  THINKING_LEVELS,
  type AgentGenerationAsset,
  type AgentGenerationPolicy,
  type AgentCommand,
  type ImageInput,
  type ThinkingLevel,
} from "@/contracts/agent";
