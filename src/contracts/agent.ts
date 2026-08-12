import type { SseErrorEvent, SuccessResponse } from "./common";

export const THINKING_LEVELS = [
  "auto",
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export interface ImageInput {
  type: "image";
  data: string;
  mimeType: string;
}

export type AgentCommand =
  | {
      type: "prompt";
      message: string;
      images?: ImageInput[];
      generationReview?: boolean;
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
