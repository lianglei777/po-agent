import type { SseErrorEvent, SuccessResponse } from "./common";
import type {
  ComposerGenerationMode,
  GenerationAssetRef,
  GenerationRouteDto,
  JsonValue,
  GenerationRunViewDto,
} from "./generation";

export const THINKING_LEVELS = [
  "auto",
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface ImageInput {
  type: "image";
  data: string;
  mimeType: string;
}

export interface AgentGenerationAsset {
  slot: string;
  name: string;
  mediaType: "image" | "video" | "audio";
  mimeType: string;
  ref: GenerationAssetRef;
}

export interface AgentGenerationPolicy {
  mode: Exclude<ComposerGenerationMode, { type: "chat" }>;
  reviewFirst: boolean;
  assets: AgentGenerationAsset[];
  /** 服务端 planner 已确认的执行计划；存在时 Agent 首轮必须调用对应生成工具。 */
  plan?: {
    toolName: "generate_image" | "generate_video";
    routeId: string;
    prompt: string;
    parameters: Record<string, JsonValue>;
  };
}

export interface AgentTurnGenerationInput {
  mode: Exclude<ComposerGenerationMode, { type: "chat" }>;
  reviewFirst: boolean;
  assets: AgentGenerationAsset[];
}

export interface AgentTurnRequest {
  /** 客户端为本轮生成的稳定标识，用于请求重试时复用同一 Generation Run。 */
  turnId: string;
  message: string;
  images?: ImageInput[];
  generation?: AgentTurnGenerationInput;
}

export type AgentTurnResponse =
  | { type: "accepted"; intent: "chat" }
  | { type: "accepted"; intent: "attachment-understanding" }
  | {
      type: "accepted";
      intent: "generation";
      run: GenerationRunViewDto;
      route: GenerationRouteDto;
      effectivePrompt: string;
      parameters: Record<string, JsonValue>;
    }
  | {
      type: "clarification";
      reason:
        | "AMBIGUOUS_INTENT"
        | "GENERATION_ROUTE_MISMATCH"
        | "MODEL_ATTACHMENT_UNSUPPORTED";
      question?: string;
      suggestedRoute?: GenerationRouteDto;
    }
  | { type: "invalid"; message: string };

export interface AgentTurnSnapshotResponse {
  agent: AgentRuntimeState;
  generationRuns: GenerationRunViewDto[];
}

export type AgentCommand =
  | {
      type: "prompt";
      message: string;
      images?: ImageInput[];
      generation?: AgentGenerationPolicy;
      generationReview?: boolean;
      /** 服务端注入的生成审计上下文；传输层不会接受客户端提供该字段。 */
      generationContext?: string;
      /** 服务端用于持久化 Composer 附件呈现元数据；不授予生成工具权限。 */
      generationContextAssets?: AgentGenerationAsset[];
    }
  | { type: "abort" }
  | { type: "get_state" }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "fork"; entryId: string }
  | { type: "navigate_tree"; targetId: string }
  | { type: "set_thinking_level"; level: ThinkingLevel }
  | { type: "steer"; message: string; images?: ImageInput[] }
  | { type: "follow_up"; message: string; images?: ImageInput[] }
  | { type: "get_tools" }
  | { type: "set_tools"; toolNames: string[] }
  | { type: "abort_compaction" }
  | { type: "set_auto_retry"; enabled: boolean }
  | { type: "reload_instructions" };

export type AgentFailureCode =
  | "MODEL_REQUEST_FAILED"
  | "MODEL_AUTH_FAILED"
  | "MODEL_RATE_LIMITED"
  | "MODEL_PROTOCOL_ERROR"
  | "MODEL_TIMEOUT"
  | "MODEL_UNAVAILABLE"
  | "UNKNOWN_AGENT_ERROR";

export interface AgentFailure {
  code: AgentFailureCode;
  message: string;
  technicalMessage?: string;
  provider?: string;
  model?: string;
  retryable: boolean;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  source: {
    type: "base64" | "url";
    mediaType?: string;
    data?: string;
    url?: string;
  };
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

export interface ToolCallContent {
  type: "toolCall";
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export type AssistantContent =
  | TextContent
  | ImageContent
  | ThinkingContent
  | ToolCallContent;

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

export interface UserMessage {
  role: "user";
  content: string | Array<TextContent | ImageContent>;
  timestamp?: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: AssistantContent[];
  provider: string;
  model: string;
  stopReason?: string;
  errorMessage?: string;
  failure?: AgentFailure;
  timestamp?: number;
  usage?: TokenUsage;
}

export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName?: string;
  content: Array<TextContent | ImageContent>;
  details?: unknown;
  isError?: boolean;
  timestamp?: number;
}

export interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp?: number;
}

export interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string;
  timestamp?: number;
}

export interface CustomMessage {
  role: "custom";
  customType: string;
  content: string | Array<TextContent | ImageContent>;
  display: boolean;
  details?: unknown;
  timestamp?: number;
}

export interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode?: number;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp?: number;
}

export type AgentMessage =
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | CompactionSummaryMessage
  | BranchSummaryMessage
  | CustomMessage
  | BashExecutionMessage;

export type AgentEvent =
  | SseErrorEvent
  | { type: "connected"; sessionId: string }
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "agent_error"; error: AgentFailure }
  | { type: "message_start"; message: Partial<AssistantMessage> }
  | { type: "message_update"; message: Partial<AssistantMessage> }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string }
  | {
      type: "tool_execution_update";
      toolCallId: string;
      toolName: string;
      content: Array<TextContent | ImageContent>;
      details?: unknown;
    }
  | { type: "tool_execution_end"; toolCallId: string; isError?: boolean }
  | {
      type: "retry_start";
      attempt: number;
      maxAttempts: number;
      errorMessage?: string;
    }
  | { type: "retry_end" }
  | { type: "compaction_start" }
  | {
      type: "compaction_end";
      aborted?: boolean;
      errorMessage?: string;
    };

export interface ContextUsage {
  percent: number | null;
  contextWindow: number;
  tokens: number | null;
}

export interface AgentRuntimeState {
  sessionId: string;
  sessionFile: string;
  isStreaming: boolean;
  isCompacting: boolean;
  autoRetryEnabled: boolean;
  model?: {
    id: string;
    provider: string;
  };
  contextUsage: ContextUsage | null;
  systemPrompt: string;
  thinkingLevel: ThinkingLevel;
}

export interface AgentRuntimeSnapshot {
  loaded: boolean;
  state?: AgentRuntimeState;
}

export interface CreateAgentRequest {
  cwd: string;
  provider?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
  toolNames?: string[];
}

export interface CreateAgentResponse {
  sessionId: string;
}

export interface AgentRuntimeResponse {
  running: boolean;
  state?: AgentRuntimeState;
}

export interface PromptAcceptedResponse {
  accepted: true;
}

export interface ForkAgentResponse {
  sessionId: string;
  sessionFile: string;
}

export interface NavigateTreeResponse {
  editorText?: string;
  cancelled: boolean;
  aborted?: boolean;
  summaryEntry?: unknown;
}

export interface AgentToolInfo {
  name: string;
  description: string;
  parameters: unknown;
  sourceInfo: unknown;
}

export interface AgentToolsResponse {
  active: string[];
  available: AgentToolInfo[];
}

export type AgentCommandResponse =
  | SuccessResponse
  | PromptAcceptedResponse
  | AgentRuntimeState
  | ForkAgentResponse
  | NavigateTreeResponse
  | AgentToolsResponse;

export type AgentCommandResult<C extends AgentCommand> =
  C["type"] extends "prompt"
    ? PromptAcceptedResponse
    : C["type"] extends "get_state"
      ? AgentRuntimeState
      : C["type"] extends "fork"
        ? ForkAgentResponse
        : C["type"] extends "navigate_tree"
          ? NavigateTreeResponse
          : C["type"] extends "get_tools"
              ? AgentToolsResponse
              : C["type"] extends "reload_instructions"
                ? AgentRuntimeState
                : SuccessResponse;
