import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GenerationRoute,
  GenerationRun,
  GenerationSession,
  ProviderJob,
} from "@/server/domain/generation";
import { SqliteDatabase } from "./sqlite-database";
import { SqliteGenerationRepository } from "./sqlite-generation-repository";

const NOW = "2026-08-06T00:00:00.000Z";

describe("SqliteGenerationRepository", () => {
  let database: SqliteDatabase;
  let repository: SqliteGenerationRepository;

  beforeEach(async () => {
    database = new SqliteDatabase(":memory:");
    repository = new SqliteGenerationRepository(database);
    await repository.upsertSession(session());
    await repository.upsertRoute(route());
  });

  afterEach(() => database.close());

  it("creates a run and provider job atomically and reuses the idempotency key", async () => {
    const first = await repository.createRun(run(), job());
    const duplicate = await repository.createRun(
      { ...run(), id: "run-duplicate" },
      { ...job(), id: "job-duplicate", runId: "run-duplicate" },
    );

    expect(first.created).toBe(true);
    expect(duplicate).toEqual({ ...first, created: false });
    await expect(repository.listRunsBySession("session-1")).resolves.toEqual([
      run(),
    ]);
    await expect(repository.listJobsByRun("run-1")).resolves.toEqual([job()]);
  });

  it("keeps only one enabled default route per capability", async () => {
    await repository.upsertRoute({
      ...route(),
      id: "route-2",
      name: "Second route",
      revision: 2,
    });

    await expect(repository.findDefaultRoute("text-to-video")).resolves.toEqual(
      expect.objectContaining({ id: "route-2", isDefault: true }),
    );
    await expect(repository.getRoute("route-1")).resolves.toEqual(
      expect.objectContaining({ isDefault: false }),
    );
  });

  it("uses expected statuses to protect state transitions", async () => {
    await repository.createRun(run(), job());
    const next = { ...run(), status: "running" as const, updatedAt: "later" };

    await expect(repository.updateRun(next, ["failed"])).resolves.toBe(false);
    await expect(repository.updateRun(next, ["queued"])).resolves.toBe(true);
    await expect(repository.getRun("run-1")).resolves.toEqual(next);
  });

  it("adds an idempotent retry job while keeping the same run", async () => {
    await repository.createRun(run(), job());
    const failedRun = { ...run(), status: "failed" as const, updatedAt: "failed" };
    await repository.updateRun(failedRun, ["queued"]);
    const retriedRun = {
      ...failedRun,
      status: "queued" as const,
      errorCode: undefined,
      errorMessage: undefined,
      updatedAt: "retried",
    };
    const retryJob = {
      ...job(),
      id: "job-2",
      attempt: 2,
      retryKey: "retry-1",
      createdAt: "retried",
      updatedAt: "retried",
    };

    const first = await repository.createRetryJob(retriedRun, retryJob);
    const repeated = await repository.createRetryJob(retriedRun, {
      ...retryJob,
      id: "job-duplicate",
    });

    expect(first).toEqual({ created: true, run: retriedRun, job: retryJob });
    expect(repeated).toEqual({ created: false, run: retriedRun, job: retryJob });
    await expect(repository.listJobsByRun("run-1")).resolves.toHaveLength(2);
  });

  it("claims only due jobs whose lease is available", async () => {
    await repository.createRun(run(), job());

    const first = await repository.claimDueJobs({
      owner: "worker-1",
      now: NOW,
      leaseExpiresAt: "2026-08-06T00:01:00.000Z",
      limit: 10,
    });
    const second = await repository.claimDueJobs({
      owner: "worker-2",
      now: NOW,
      leaseExpiresAt: "2026-08-06T00:01:00.000Z",
      limit: 10,
    });

    expect(first).toEqual([
      expect.objectContaining({
        id: "job-1",
        leaseOwner: "worker-1",
        leaseExpiresAt: "2026-08-06T00:01:00.000Z",
      }),
    ]);
    expect(second).toEqual([]);
  });

  it("stores structured artifacts for a run", async () => {
    await repository.createRun(run(), job());
    const artifact = {
      id: "artifact-1",
      runId: "run-1",
      jobId: "job-1",
      kind: "video" as const,
      localPath: ".po-agent/generated/run-1/output.mp4",
      contentType: "video/mp4",
      sizeBytes: 1024,
      createdAt: NOW,
    };

    await repository.addArtifacts([artifact, artifact]);

    await expect(repository.listArtifactsByRun("run-1")).resolves.toEqual([
      artifact,
    ]);
  });
});

function session(): GenerationSession {
  return {
    id: "session-1",
    cwd: "D:\\project",
    origin: "chat",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function route(): GenerationRoute {
  return {
    id: "route-1",
    name: "RunningHub text to video",
    capability: "text-to-video",
    providerId: "runninghub",
    providerOperation: "text-to-video",
    enabled: true,
    isDefault: true,
    revision: 1,
    defaults: { durationSeconds: 5 },
    adapterConfig: { workflowId: "workflow-1" },
    credentialRef: "runninghub:default",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function run(): GenerationRun {
  return {
    id: "run-1",
    sessionId: "session-1",
    capability: "text-to-video",
    routeId: "route-1",
    status: "queued",
    prompt: "rainy bamboo forest",
    input: {
      prompt: "rainy bamboo forest",
      parameters: { durationSeconds: 5 },
    },
    source: "agent-tool",
    sourceRef: "tool-call-1",
    idempotencyKey: "idem-1",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function job(): ProviderJob {
  return {
    id: "job-1",
    runId: "run-1",
    attempt: 1,
    providerId: "runninghub",
    providerOperation: "text-to-video",
    routeRevision: 1,
    resolvedConfigSnapshot: {
      defaults: { durationSeconds: 5 },
      adapterConfig: { workflowId: "workflow-1" },
    },
    credentialRef: "runninghub:default",
    status: "created",
    nextPollAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
