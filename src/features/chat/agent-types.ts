import type {
  AgentGenerationAsset,
  AgentMessage as ApiAgentMessage,
  AgentRuntimeState,
  UserMessage as ApiUserMessage,
} from "@/contracts/agent";
import type { SessionDetailResponse } from "@/contracts/sessions";

export type {
  AgentCommand,
  AgentGenerationAsset,
  AgentGenerationPolicy,
  AgentEvent,
  AgentFailure,
  AgentRuntimeState,
  AssistantMessage,
  CompactionSummaryMessage,
  ContextUsage,
  ImageContent,
  ImageInput,
  TextContent,
  ThinkingContent,
  ThinkingLevel,
  TokenUsage,
  ToolCallContent,
  ToolResultMessage,
} from "@/contracts/agent";
export type { SessionTreeNode } from "@/contracts/sessions";
export type { ModelInfo } from "@/contracts/models";

export type UserMessage = ApiUserMessage & {
  clientId?: string;
  status?: "pending" | "failed";
  /** 仅用于对话呈现；素材本体仍由内容生成工具按服务端绑定的引用读取。 */
  generationAssets?: AgentGenerationAsset[];
};

export type AgentMessage =
  | Exclude<ApiAgentMessage, ApiUserMessage>
  | UserMessage;

export type RuntimeState = AgentRuntimeState;
export type SessionDetail = SessionDetailResponse;

export type AttachedImage = {
  type: "image";
  data: string;
  mimeType: string;
  id: string;
  name: string;
  previewUrl: string;
};

export type SessionStats = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
};
