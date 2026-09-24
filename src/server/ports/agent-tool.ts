export interface AgentToolJsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AgentToolTextContent {
  type: "text";
  text: string;
}

export interface AgentToolResult<TDetails = unknown> {
  content: AgentToolTextContent[];
  details: TDetails;
  /** 当前工具结果已经完整回答本轮目标时，结束工具循环，避免额外一次模型收尾请求。 */
  terminate?: boolean;
}

export interface AgentToolExecutionContext<TDetails = unknown> {
  toolCallId: string;
  input: Record<string, unknown>;
  signal?: AbortSignal;
  onUpdate?: (result: AgentToolResult<TDetails>) => void;
}

/** 项目自有的 Agent 工具定义，不暴露具体 Agent SDK 的类型。 */
export interface AgentToolDefinition<TDetails = unknown> {
  name: string;
  label: string;
  description: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters: AgentToolJsonSchema;
  execute(
    context: AgentToolExecutionContext<TDetails>,
  ): Promise<AgentToolResult<TDetails>>;
}

export interface AgentToolProvider {
  getTools(input: AgentToolContext): AgentToolDefinition[];
}

export interface AgentToolContext {
  sessionId: string;
  cwd: string;
  pipelineProjectId?: string;
  enabledSkillNames?: ReadonlySet<string>;
}

export interface AgentSessionScopeProvider {
  getPipelineProjectId(sessionId: string): Promise<string | null>;
}
