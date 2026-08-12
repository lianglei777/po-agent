import type {
  GenerationArtifact,
  GenerationCapability,
  GenerationRoute,
  GenerationRun,
  GenerationRunStatus,
  GenerationSession,
  ProviderJob,
  ProviderJobStatus,
} from "@/server/domain/generation";

export interface CreateGenerationRunResult {
  created: boolean;
  run: GenerationRun;
  job?: ProviderJob;
}

export interface CreateGenerationRetryResult {
  created: boolean;
  run: GenerationRun;
  job: ProviderJob;
}

export interface GenerationRepository {
  upsertSession(session: GenerationSession): Promise<void>;
  getSession(id: string): Promise<GenerationSession | null>;

  upsertRoute(route: GenerationRoute): Promise<void>;
  getRoute(id: string): Promise<GenerationRoute | null>;
  findDefaultRoute(
    capability: GenerationCapability,
  ): Promise<GenerationRoute | null>;
  listRoutes(): Promise<GenerationRoute[]>;
  setRouteEnabled(id: string, enabled: boolean, updatedAt: string): Promise<boolean>;
  isProviderEnabled(providerId: string): Promise<boolean>;
  setProviderEnabled(providerId: string, enabled: boolean, updatedAt: string): Promise<void>;

  createRun(
    run: GenerationRun,
    job?: ProviderJob,
  ): Promise<CreateGenerationRunResult>;
  confirmRun(
    run: GenerationRun,
    job: ProviderJob,
  ): Promise<CreateGenerationRunResult | null>;
  createRetryJob(
    run: GenerationRun,
    job: ProviderJob,
  ): Promise<CreateGenerationRetryResult | null>;
  getRun(id: string): Promise<GenerationRun | null>;
  listRunsBySession(sessionId: string): Promise<GenerationRun[]>;
  updateRun(
    run: GenerationRun,
    expectedStatuses?: GenerationRunStatus[],
  ): Promise<boolean>;

  getJob(id: string): Promise<ProviderJob | null>;
  getArtifact(id: string): Promise<GenerationArtifact | null>;
  listJobsByRun(runId: string): Promise<ProviderJob[]>;
  updateJob(
    job: ProviderJob,
    expectedStatuses?: ProviderJobStatus[],
  ): Promise<boolean>;
  listExpiredJobsByStatus(input: {
    status: ProviderJobStatus;
    now: string;
  }): Promise<ProviderJob[]>;
  claimDueJobs(input: {
    owner: string;
    now: string;
    leaseExpiresAt: string;
    limit: number;
  }): Promise<ProviderJob[]>;

  addArtifacts(artifacts: GenerationArtifact[]): Promise<void>;
  listArtifactsByRun(runId: string): Promise<GenerationArtifact[]>;
}
