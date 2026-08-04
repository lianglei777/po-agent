import type {
  AgentMessage,
  AgentRuntimeResponse,
  ThinkingLevel,
} from "./agent";
import type { ContentGenerationJobPhase } from "./content-generation";
import type { SuccessResponse } from "./common";

export interface SessionInfo {
  id: string;
  path: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  parentSessionId?: string;
  mode?: "chat" | "content-generation";
  contentGenerationApiId?: string;
  contentGenerationPhase?: ContentGenerationJobPhase;
}

export interface SessionEntry {
  id: string;
  parentId: string | null;
  type: string;
  timestamp: string;
  message?: AgentMessage;
  [key: string]: unknown;
}

export interface SessionTreeNode {
  entry: SessionEntry;
  children: SessionTreeNode[];
  label?: string;
}

export interface SessionContext {
  messages: AgentMessage[];
  entryIds: string[];
  thinkingLevel: ThinkingLevel;
  model: {
    provider: string;
    modelId: string;
  } | null;
}

export interface SessionDetailResponse {
  sessionId: string;
  filePath: string;
  info: SessionInfo | null;
  tree: SessionTreeNode[];
  leafId: string | null;
  context: SessionContext;
  agentState?: AgentRuntimeResponse;
}

export type ListSessionsResponse = SessionInfo[];
export interface RenameSessionRequest {
  name: string;
}
export type RenameSessionResponse = SuccessResponse;
export type DeleteSessionResponse = SuccessResponse;
export interface SessionContextResponse {
  context: SessionContext;
}
