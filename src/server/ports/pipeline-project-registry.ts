export interface PipelineProjectRegistration {
  projectId: string;
  rootPath: string;
  lastOpenedAt: string;
}

export interface PipelineProjectRegistry {
  list(): Promise<PipelineProjectRegistration[]>;
  get(projectId: string): Promise<PipelineProjectRegistration | null>;
  upsert(registration: PipelineProjectRegistration): Promise<void>;
  remove(projectId: string): Promise<boolean>;
}
