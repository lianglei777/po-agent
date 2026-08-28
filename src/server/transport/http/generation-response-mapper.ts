import type {
  GenerationRunViewDto,
  GenerationRouteDto,
  ProviderJobDto,
} from "@/contracts/generation";
import type { GenerationRunView } from "@/server/application/content-generation/generation-run-service";
import type { ProviderJob } from "@/server/domain/generation";
import type { GenerationRoute } from "@/server/domain/generation";

export function generationRouteDto(route: GenerationRoute): GenerationRouteDto {
  return {
    id: route.id,
    name: route.name,
    navigationLabel: route.navigationLabel,
    description: route.description,
    tags: route.tags,
    capability: route.capability,
    product: route.product,
    providerId: route.providerId,
    enabled: route.enabled,
    isDefault: route.isDefault,
    revision: route.revision,
    defaults: route.defaults,
    inputSchema: route.inputSchema,
  };
}

export function generationRunViewDto(
  view: GenerationRunView,
): GenerationRunViewDto {
  const run = view.run;
  return {
    run: {
      id: run.id,
      sessionId: run.sessionId,
      capability: run.capability,
      routeId: run.routeId,
      parentRunId: run.parentRunId,
      status: run.status,
      prompt: run.prompt,
      input: run.input,
      source: run.source,
      sourceRef: run.sourceRef,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      completedAt: run.completedAt,
    },
    jobs: view.jobs.map(providerJobDto),
    artifacts: view.artifacts.map((artifact) => ({ ...artifact })),
  };
}

function providerJobDto(job: ProviderJob): ProviderJobDto {
  return {
    id: job.id,
    runId: job.runId,
    attempt: job.attempt,
    providerId: job.providerId,
    providerOperation: job.providerOperation,
    status: job.status,
    remoteTaskId: job.remoteTaskId,
    remoteStatus: job.remoteStatus,
    nextPollAt: job.nextPollAt,
    lastErrorCode: job.lastErrorCode,
    lastErrorMessage: job.lastErrorMessage,
    transientFailureCount: job.transientFailureCount,
    requestSnapshot: job.requestSnapshot,
    responseSnapshot: job.responseSnapshot,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
