import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/server/domain/app-error";
import type { GenerationProvider } from "@/server/ports/generation-provider";
import type { GenerationFileStore } from "@/server/ports/generation-file-store";
import { createRunningHubRoutes } from "@/server/infrastructure/content-generation/runninghub/runninghub-routes";
import { SqliteDatabase } from "@/server/infrastructure/sqlite/sqlite-database";
import { SqliteGenerationRepository } from "@/server/infrastructure/sqlite/sqlite-generation-repository";
import { GenerationExecutionService } from "./generation-execution-service";
import { GenerationRunService } from "./generation-run-service";
import { GenerationWorker } from "./generation-worker";
import { seedGenerationRoutes } from "./seed-generation-routes";

describe("GenerationWorker", () => {
  let database: SqliteDatabase;
  let repository: SqliteGenerationRepository;
  let now: Date;
  let provider: GenerationProvider;
  let execution: GenerationExecutionService;
  let worker: GenerationWorker;
  let runService: GenerationRunService;
  let files: GenerationFileStore & { saveOutput: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    database = new SqliteDatabase(":memory:");
    repository = new SqliteGenerationRepository(database);
    now = new Date("2026-08-06T00:00:00.000Z");
    await seedGenerationRoutes(
      repository,
      createRunningHubRoutes(now.toISOString()).map((route) => ({ ...route, enabled: true })),
    );
    await repository.setProviderEnabled("runninghub", true, now.toISOString());
    await repository.upsertSession({
      id: "session-1",
      cwd: "D:\\project",
      origin: "chat",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    provider = {
      providerId: "runninghub",
      prepareAssets: vi.fn(async () => []),
      submit: vi.fn<GenerationProvider["submit"]>(async () => ({
        state: "pending",
        remoteTaskId: "remote-1",
        remoteStatus: "RUNNING",
        outputs: [],
      })),
      poll: vi.fn<GenerationProvider["poll"]>(async () => ({
        state: "succeeded",
        remoteTaskId: "remote-1",
        remoteStatus: "SUCCESS",
        outputs: [{
          url: "https://bucket.myqcloud.com/output.mp4",
          outputType: "mp4",
        }, {
          outputType: "text",
          text: "22819",
        }],
      })),
      download: vi.fn(async () => ({
        data: new Uint8Array([1, 2, 3]),
        contentType: "video/mp4",
      })),
    };
    files = {
      saveInput: vi.fn(async () => ".po-agent/generation-inputs/input.png"),
      readInput: vi.fn(),
      saveOutput: vi.fn(async () =>
        ".po-agent/generated/id-1/rainy-bamboo-forest-1.mp4"
      ),
    };
    execution = new GenerationExecutionService(
      repository,
      [provider],
      { getCredential: vi.fn(async () => "secret-key") },
      files,
      () => now,
    );
    worker = new GenerationWorker(
      repository,
      execution,
      "worker-1",
      () => now,
    );
    let sequence = 0;
    runService = new GenerationRunService(repository, {
      createId: () => `id-${++sequence}`,
      now: () => now,
    });
  });

  afterEach(() => database.close());

  it("submits, polls, downloads, and completes a durable run", async () => {
    const created = await runService.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "rainy bamboo forest",
      source: "agent-tool",
      idempotencyKey: "idem-1",
    });

    await expect(worker.runOnce()).resolves.toBe(1);
    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: { status: "running" },
      jobs: [{ status: "submitted", remoteTaskId: "remote-1" }],
    });

    now = new Date("2026-08-06T00:00:05.000Z");
    await expect(worker.runOnce()).resolves.toBe(1);
    expect(files.saveOutput).toHaveBeenCalledWith(expect.objectContaining({
      nameHint: "rainy-bamboo-forest",
    }));

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: { status: "succeeded", completedAt: now.toISOString() },
      jobs: [{ status: "succeeded", remoteStatus: "SUCCESS" }],
      artifacts: [{
        id: "id-2-1",
        kind: "video",
        localPath: ".po-agent/generated/id-1/rainy-bamboo-forest-1.mp4",
        contentType: "video/mp4",
        sizeBytes: 3,
      }, {
        id: "id-2-2",
        kind: "text",
        text: "22819",
      }],
    });
    expect(provider.submit).toHaveBeenCalledOnce();
    expect(provider.poll).toHaveBeenCalledOnce();
    expect(provider.download).toHaveBeenCalledOnce();
    expect(worker.getMetrics()).toMatchObject({
      claimedJobs:2,
      completedAdvances:2,
      failedAdvances:0,
      activeByProvider:{runninghub:0},
      maxObservedByProvider:{runninghub:1},
    });
  });

  it("retries a retained output download without submitting another provider task", async () => {
    const created = await runService.createRun({
      sessionId: "session-1", capability: "text-to-video", prompt: "recover output",
      source: "direct-ui", idempotencyKey: "recover-output",
    });
    const job = created.jobs[0]!;
    await repository.updateRun({ ...created.run, status: "failed", errorCode: "GENERATION_DOWNLOAD_FAILED", errorMessage: "timeout", updatedAt: now.toISOString() }, ["queued"]);
    await repository.updateJob({
      ...job,
      status: "failed",
      remoteStatus: "SUCCESS",
      pendingOutputs: [{ url: "https://bucket.myqcloud.com/output.mp4", outputType: "mp4" }],
      failure: { phase: "output-download", origin: "local", outputAvailable: true, recoveryAction: "redownload", retryMayCharge: false },
      updatedAt: now.toISOString(),
    }, ["created"]);

    await runService.retryDownload(created.run.id, "download-retry-1");
    await worker.runOnce();

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: { status: "succeeded" },
      jobs: [{ status: "succeeded", pendingOutputs: undefined }],
      artifacts: [{ kind: "video" }],
    });
    expect(provider.submit).not.toHaveBeenCalled();
    expect(provider.poll).not.toHaveBeenCalled();
    expect(provider.download).toHaveBeenCalledOnce();
  });

  it("rejects a downloaded body whose content type does not match the output", async () => {
    vi.mocked(provider.download).mockResolvedValueOnce({
      data: new TextEncoder().encode("provider error"),
      contentType: "application/json",
    });
    const created = await runService.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "rainy bamboo forest",
      source: "api",
      idempotencyKey: "mismatched-download-content-type",
    });

    await worker.runOnce();
    now = new Date("2026-08-06T00:00:05.000Z");
    await worker.runOnce();

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: {
        status: "failed",
        errorCode: "GENERATION_PROVIDER_PROTOCOL_ERROR",
      },
      jobs: [{ status: "failed" }],
      artifacts: [],
    });
    expect(files.saveOutput).not.toHaveBeenCalled();
  });

  it("persists Retry-After and exponential backoff across poll failures", async () => {
    const created=await runService.createRun({sessionId:"session-1",capability:"text-to-video",prompt:"backoff",source:"api",idempotencyKey:"backoff"});
    await worker.runOnce();
    now=new Date("2026-08-06T00:00:05.000Z");
    vi.mocked(provider.poll).mockRejectedValueOnce(new AppError("GENERATION_PROVIDER_RATE_LIMITED","slow down",429,{retryAfterMs:120_000}));
    await worker.runOnce();
    await expect(repository.getJob(created.jobs[0].id)).resolves.toMatchObject({status:"polling",transientFailureCount:1,nextPollAt:"2026-08-06T00:02:05.000Z",lastErrorCode:"GENERATION_PROVIDER_RATE_LIMITED"});

    now=new Date("2026-08-06T00:02:05.000Z");
    vi.mocked(provider.poll).mockRejectedValueOnce(new Error("temporary network failure"));
    await worker.runOnce();
    await expect(repository.getJob(created.jobs[0].id)).resolves.toMatchObject({status:"polling",transientFailureCount:2,nextPollAt:"2026-08-06T00:02:15.000Z"});
  });

  it("fails a job after eight consecutive recoverable errors", async () => {
    const created=await runService.createRun({sessionId:"session-1",capability:"text-to-video",prompt:"retry cap",source:"api",idempotencyKey:"retry-cap"});
    await worker.runOnce();
    const submitted=await repository.getJob(created.jobs[0].id);
    if(!submitted)throw new Error("Expected submitted job");
    now=new Date("2026-08-06T00:00:05.000Z");
    await repository.updateJob({...submitted,transientFailureCount:7,nextPollAt:now.toISOString(),updatedAt:now.toISOString()});
    vi.mocked(provider.poll).mockRejectedValueOnce(new Error("still unavailable"));

    await worker.runOnce();

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({run:{status:"failed",errorCode:"GENERATION_PROVIDER_ERROR"},jobs:[{status:"failed"}]});
  });

  it("limits concurrent advances independently per provider", async () => {
    for(const id of ["session-2","session-3"]){await repository.upsertSession({id,cwd:`D:\\${id}`,origin:"chat",createdAt:now.toISOString(),updatedAt:now.toISOString()});}
    await Promise.all(["session-1","session-2","session-3"].map((sessionId,index)=>runService.createRun({sessionId,capability:"text-to-video",prompt:`job ${index}`,source:"api",idempotencyKey:`concurrent-${index}`})));
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    let active=0;
    let maximum=0;
    vi.mocked(provider.submit).mockImplementation(async()=>{
      active+=1;maximum=Math.max(maximum,active);
      await gate;
      active-=1;
      return{state:"pending",remoteTaskId:"remote",outputs:[]};
    });
    worker=new GenerationWorker(repository,execution,"worker-concurrent",()=>now,1_000,180_000,{runninghub:{maxConcurrent:2}});
    const running=worker.runOnce(3);
    await vi.waitFor(()=>expect(active).toBe(2));
    release();
    await expect(running).resolves.toBe(3);
    expect(maximum).toBe(2);
    expect(worker.getMetrics()).toMatchObject({claimedJobs:3,completedAdvances:3,maxObservedByProvider:{runninghub:2}});
  });

  it("executes the provider config frozen when the job was created", async () => {
    const route = await repository.getRoute(
      "runninghub-seedance-2-text-to-video",
    );
    if (!route) throw new Error("Expected seeded route");
    await runService.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      routeId: route.id,
      prompt: "frozen provider contract",
      source: "api",
      idempotencyKey: "frozen-config",
    });
    await repository.upsertRoute({
      ...route,
      revision: route.revision + 1,
      adapterConfig: { protocol: "future-contract" },
      updatedAt: now.toISOString(),
    });

    await worker.runOnce();

    expect(provider.prepareAssets).toHaveBeenCalledWith(expect.objectContaining({
      executionConfig: route.adapterConfig,
    }));
    expect(provider.submit).toHaveBeenCalledWith(expect.objectContaining({
      executionConfig: route.adapterConfig,
    }));
  });

  it("marks an ambiguous provider submission without resubmitting", async () => {
    vi.mocked(provider.submit).mockRejectedValueOnce(new Error("connection reset"));
    const created = await runService.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "test",
      source: "api",
      idempotencyKey: "idem-1",
    });

    await worker.runOnce();

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: {
        status: "failed",
        errorCode: "GENERATION_SUBMISSION_UNKNOWN",
      },
      jobs: [{
        status: "submission_unknown",
        lastErrorMessage: "connection reset",
      }],
    });
    expect(provider.submit).toHaveBeenCalledOnce();
  });

  it("records a confirmed provider rejection without marking submission unknown", async () => {
    vi.mocked(provider.submit).mockRejectedValueOnce(new AppError(
      "GENERATION_PROVIDER_ERROR",
      "invalid API key",
      401,
      { submissionRejected: true, providerCode: "InvalidApiKey" },
    ));
    const created = await runService.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "test",
      source: "api",
      idempotencyKey: "confirmed-provider-rejection",
    });

    await worker.runOnce();

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: {
        status: "failed",
        errorCode: "InvalidApiKey",
        errorMessage: "invalid API key",
      },
      jobs: [{
        status: "failed",
        lastErrorCode: "InvalidApiKey",
      }],
    });
  });

  it("rejects an asset that exceeds the selected Route limit before upload", async () => {
    vi.mocked(files.readInput).mockResolvedValueOnce({
      slot: "firstFrameUrl",
      name: "large.png",
      mimeType: "image/png",
      data: new Uint8Array(10 * 1024 * 1024 + 1),
    });
    const created = await runService.createRun({
      sessionId: "session-1",
      capability: "image-to-video",
      routeId: "runninghub-pixverse-v6-image-to-video",
      prompt: "animate the image",
      assets: [{
        slot: "firstFrameUrl",
        ref: { type: "workspace-file", relativePath: "large.png" },
      }],
      source: "api",
      idempotencyKey: "oversized-pixverse-input",
    });

    await worker.runOnce();

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: { status: "failed", errorCode: "FILE_TOO_LARGE" },
    });
    expect(provider.prepareAssets).not.toHaveBeenCalled();
  });

  it("backs off a rate-limited asset preparation without submitting paid work", async () => {
    vi.mocked(files.readInput).mockResolvedValueOnce({slot:"firstFrameUrl",name:"frame.png",mimeType:"image/png",data:new Uint8Array([1])});
    vi.mocked(provider.prepareAssets).mockRejectedValueOnce(new AppError("GENERATION_PROVIDER_RATE_LIMITED","upload limited",429,{retryAfterMs:30_000}));
    const created=await runService.createRun({sessionId:"session-1",capability:"image-to-video",routeId:"runninghub-pixverse-v6-image-to-video",prompt:"animate",assets:[{slot:"firstFrameUrl",ref:{type:"workspace-file",relativePath:"frame.png"}}],source:"api",idempotencyKey:"upload-backoff"});

    await worker.runOnce();

    await expect(repository.getJob(created.jobs[0].id)).resolves.toMatchObject({status:"uploading",transientFailureCount:1,nextPollAt:"2026-08-06T00:00:30.000Z"});
    expect(provider.submit).not.toHaveBeenCalled();
  });

  it("recovers an expired submitting job as unknown instead of retrying", async () => {
    const created = await runService.createRun({
      sessionId: "session-1",
      capability: "text-to-video",
      prompt: "test",
      source: "api",
      idempotencyKey: "idem-1",
    });
    const job = created.jobs[0];
    await repository.updateRun({
      ...created.run,
      status: "running",
    });
    await repository.updateJob({
      ...job,
      status: "submitting",
      leaseOwner: "stopped-worker",
      leaseExpiresAt: "2026-08-05T23:59:59.000Z",
    });

    await worker.runOnce();

    await expect(runService.getRun(created.run.id)).resolves.toMatchObject({
      run: { status: "failed", errorCode: "GENERATION_SUBMISSION_UNKNOWN" },
      jobs: [{ status: "submission_unknown" }],
    });
    expect(provider.submit).not.toHaveBeenCalled();
  });
});
