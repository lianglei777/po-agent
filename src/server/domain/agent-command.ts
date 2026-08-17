import type {
  AgentCommand as ContractAgentCommand,
  AgentGenerationAsset,
  AgentGenerationPolicy as ContractAgentGenerationPolicy,
  TextContent,
} from "@/contracts/agent";
import type { JsonValue } from "@/contracts/generation";

export type ActiveGenerationTurn = ContractAgentGenerationPolicy & {
  originalPrompt: string;
};

/** 应用工作流持久化用户生成请求，不触发一次新的模型调用。 */
export type RecordUserTurnCommand = {
  type: "record_user_turn";
  turnId: string;
  message: string;
  generationContext?: string;
  assets: AgentGenerationAsset[];
  plan: {
    toolName: "generate_image" | "generate_video";
    routeId: string;
    prompt: string;
    parameters: Record<string, JsonValue>;
  };
};

/** 确定性生成编排完成后，把工具事实补回同一条会话分支。 */
export type RecordGenerationTurnResultCommand = {
  type: "record_generation_turn_result";
  turnId: string;
  toolName: "generate_image" | "generate_video";
  result: {
    content: TextContent[];
    details?: unknown;
    isError: boolean;
  };
};

export type AgentCommand =
  | ContractAgentCommand
  | RecordUserTurnCommand
  | RecordGenerationTurnResultCommand;

export {
  THINKING_LEVELS,
  type AgentGenerationAsset,
  type AgentGenerationPolicy,
  type ImageInput,
  type ThinkingLevel,
} from "@/contracts/agent";
