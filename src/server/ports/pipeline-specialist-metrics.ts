import type { PipelineSpecialistKind } from "@/server/domain/pipeline-specialist";

export interface PipelineSpecialistMetricInput {
  event: "specialist-run" | "generation-preflight";
  projectId: string;
  outcome: "success" | "no-change" | "failure";
  durationMs: number;
  specialist?: PipelineSpecialistKind;
  profileVersion?: string;
  operationCount?: number;
  repairUsed?: boolean;
  requestedNodeCount?: number;
  preparedNodeCount?: number;
  reusedNodeCount?: number;
  staleNodeCount?: number;
  missingNodeCount?: number;
  errorCode?: string;
}

export interface PipelineSpecialistMetrics {
  record(input: PipelineSpecialistMetricInput): Promise<void>;
}
