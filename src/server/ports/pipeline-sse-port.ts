export type PipelineSseEventType =
  | "node_created"
  | "node_updated"
  | "node_deleted"
  | "edge_created"
  | "edge_deleted"
  | "asset_updated"
  | "frame_updated"
  | "generation_progress"
  | "generation_completed"
  | "generation_failed"
  | "workflow_run_updated"
  | "agent_message"
  | "agent_thinking"
  | "agent_tool_call"
  | "canvas_updated";

export interface PipelineSseEvent {
  type: PipelineSseEventType;
  projectId: string;
  payload: unknown;
}

export interface PipelineSsePort {
  emit(event: PipelineSseEvent): void;
  subscribe(projectId: string, listener: (event: PipelineSseEvent) => void): () => void;
}
