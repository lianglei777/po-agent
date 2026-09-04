import type { AgentRuntimeResponse } from "@/contracts/agent";
import type { CanvasSaveState } from "../state/canvas-store";

export function pipelineAgentIsRunning(agentState?: AgentRuntimeResponse): boolean {
  return Boolean(agentState?.state?.isStreaming);
}

export function pipelineAgentCanvasContextReady(saveState: CanvasSaveState, pendingMutationCount: number): boolean {
  return saveState !== "saving" && pendingMutationCount === 0;
}
