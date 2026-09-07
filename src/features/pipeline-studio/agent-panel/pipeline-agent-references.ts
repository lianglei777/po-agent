export interface PipelineAgentReferenceState {
  pendingNodeIds: string[];
  referencedNodeIds: string[];
  selectionNodeIds: string[];
}

export const EMPTY_PIPELINE_AGENT_REFERENCES: PipelineAgentReferenceState = {
  pendingNodeIds: [],
  referencedNodeIds: [],
  selectionNodeIds: [],
};

export function observePipelineAgentSelection(
  state: PipelineAgentReferenceState,
  selectedNodeIds: string[],
): PipelineAgentReferenceState {
  if (arraysEqual(state.selectionNodeIds, selectedNodeIds)) return state;
  const referenced = new Set(state.referencedNodeIds);
  return {
    ...state,
    selectionNodeIds: selectedNodeIds,
    pendingNodeIds: selectedNodeIds.filter((nodeId) => !referenced.has(nodeId)),
  };
}

export function commitPipelineAgentSelection(
  state: PipelineAgentReferenceState,
): PipelineAgentReferenceState {
  if (!state.pendingNodeIds.length) return state;
  return {
    ...state,
    pendingNodeIds: [],
    referencedNodeIds: [...new Set([...state.referencedNodeIds, ...state.pendingNodeIds])],
  };
}

export function dismissPipelineAgentSelection(
  state: PipelineAgentReferenceState,
): PipelineAgentReferenceState {
  return state.pendingNodeIds.length ? { ...state, pendingNodeIds: [] } : state;
}

export function removePipelineAgentReference(
  state: PipelineAgentReferenceState,
  nodeId: string,
): PipelineAgentReferenceState {
  return {
    ...state,
    referencedNodeIds: state.referencedNodeIds.filter((candidate) => candidate !== nodeId),
  };
}

export function clearPipelineAgentReferences(
  state: PipelineAgentReferenceState,
): PipelineAgentReferenceState {
  return { ...state, pendingNodeIds: [], referencedNodeIds: [] };
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
