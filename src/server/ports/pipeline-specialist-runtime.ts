import type { PipelineSpecialistProfile } from "@/server/domain/pipeline-specialist";

export interface PipelineSpecialistRuntime {
  run(input: {
    profile: PipelineSpecialistProfile;
    context: string;
    outputContract: string;
    model?: string;
    repairResponse?: string;
    signal?: AbortSignal;
  }): Promise<string>;
}
