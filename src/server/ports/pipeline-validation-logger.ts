export interface PipelineValidationLogInput {
  entrypoint: "agent-plan" | "mutation-batch" | "template-initialization";
  projectId: string;
  role: string;
  sourceNodeId: string;
  sourceType: string | null;
  targetNodeId: string;
  targetType: string | null;
  sessionId?: string;
  action?: "create" | "update";
  planId?: string;
  edgeId?: string;
}

export interface PipelineValidationLogger {
  log(input: PipelineValidationLogInput): Promise<void>;
}
