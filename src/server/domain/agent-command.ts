import type {
  AgentCommand as ContractAgentCommand,
  AgentGenerationPolicy as ContractAgentGenerationPolicy,
} from "@/contracts/agent";

export type ActiveGenerationTurn = ContractAgentGenerationPolicy & {
  originalPrompt: string;
  allowedToolNames?: ReadonlySet<"generate_image" | "generate_video">;
};

export type AgentCommand = ContractAgentCommand;

export {
  THINKING_LEVELS,
  type AgentGenerationPolicy,
  type ImageInput,
  type ThinkingLevel,
} from "@/contracts/agent";
