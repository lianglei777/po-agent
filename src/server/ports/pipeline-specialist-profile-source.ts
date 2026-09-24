import type { PipelineSpecialistKind, PipelineSpecialistProfile } from "@/server/domain/pipeline-specialist";

export interface PipelineSpecialistProfileSource {
  get(kind: PipelineSpecialistKind): Promise<PipelineSpecialistProfile>;
}
