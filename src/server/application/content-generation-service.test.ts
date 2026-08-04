import { describe, expect, it, vi } from "vitest";
import type { SaveContentGenerationApiRequest } from "@/contracts/content-generation";
import type { ContentGenerationState } from "@/server/domain/content-generation";
import { ContentGenerationService } from "./content-generation-service";

function api(): SaveContentGenerationApiRequest {
  return {
    id: "runninghub-video",
    name: "RunningHub video",
    providerName: "RunningHub",
    capability: "text-to-video",
    requiresImages: false,
    apiKey: "secret-key",
    commonHeaders: { Authorization: "Bearer {{secret.apiKey}}" },
    submit: {
      method: "POST",
      url: "https://provider.example/generate",
      headers: { "Content-Type": "application/json" },
      bodyTemplate: { prompt: "{{input.prompt}}" },
      taskIdPath: "taskId",
      statusPath: "status",
    },
    completion: {
      mode: "polling",
      request: {
        method: "POST",
        url: "https://provider.example/query",
        bodyTemplate: { taskId: "{{job.remoteTaskId}}" },
      },
      statusPath: "status",
      pendingValues: ["QUEUED", "RUNNING"],
      successValues: ["SUCCESS"],
      failureValues: ["FAILED"],
      errorPath: "errorMessage",
      intervalMs: 5000,
      timeoutMs: 120000,
    },
    output: {
      collectionPath: "results",
      urlPath: "url",
      typePath: "outputType",
      textPath: "text",
      defaultMediaType: "video",
      downloadRemoteFiles: true,
    },
  };
}

function setup(queryResponse: unknown) {
  let state: ContentGenerationState = {
    version: 1,
    apis: [api()],
    sessions: [],
    jobs: [],
  };
  const repository = {
    read: vi.fn(async () => structuredClone(state)),
    write: vi.fn(async (next: ContentGenerationState) => {
      state = structuredClone(next);
    }),
    getApi: vi.fn(async (id: string) =>
      structuredClone(state.apis.find((item) => item.id === id) ?? null),
    ),
    listSessions: vi.fn(async () => structuredClone(state.sessions)),
    getSession: vi.fn(async (id: string) =>
      structuredClone(state.sessions.find((item) => item.id === id) ?? null),
    ),
    getJob: vi.fn(async (id: string) =>
      structuredClone(state.jobs.find((item) => item.id === id) ?? null),
    ),
  };
  const provider = {
    upload: vi.fn(),
    request: vi
      .fn()
      .mockResolvedValueOnce({ taskId: "remote-1", status: "RUNNING" })
      .mockResolvedValue(queryResponse),
    download: vi.fn(async () => ({
      data: new Uint8Array([1, 2, 3]),
      contentType: "video/mp4",
    })),
  };
  const artifacts = {
    save: vi.fn(async () => ".po-agent/generated/job/output-1.mp4"),
  };
  const service = new ContentGenerationService(
    repository,
    provider,
    artifacts,
    { listRoots: async () => ["D:\\project"], addRoot: vi.fn() },
  );
  return { service, provider, artifacts, getState: () => state };
}

describe("ContentGenerationService", () => {
  it("submits once, polls the remote task, and stores downloaded outputs", async () => {
    const test = setup({
      status: "SUCCESS",
      token: "must-not-be-persisted",
      results: [
        { url: "https://provider.example/result.mp4", outputType: "mp4" },
      ],
    });
    const session = await test.service.createSession({
      cwd: "D:\\project",
      apiId: "runninghub-video",
    });

    const created = await test.service.createJob({
      sessionId: session.id,
      prompt: "rainy bamboo forest",
      files: [],
    });
    expect(created).toMatchObject({
      phase: "running",
      remoteTaskId: "remote-1",
      submitRequest: {
        body: { prompt: "rainy bamboo forest" },
      },
      submitResponse: {
        body: { taskId: "remote-1", status: "RUNNING" },
      },
    });
    await expect(test.service.listSessionInfo()).resolves.toEqual([
      expect.objectContaining({
        contentGenerationPhase: "running",
        firstMessage: "rainy bamboo forest",
        messageCount: 2,
      }),
    ]);

    const completed = await test.service.pollJob(created.id);

    expect(completed).toMatchObject({
      phase: "succeeded",
      outputs: [{
        contentType: "video/mp4",
        localPath: ".po-agent/generated/job/output-1.mp4",
      }],
      latestQueryResponse: {
        body: {
          status: "SUCCESS",
          token: "[REDACTED]",
          results: [
            { url: "https://provider.example/result.mp4", outputType: "mp4" },
          ],
        },
      },
    });
    expect(test.provider.request).toHaveBeenCalledTimes(2);
    expect(test.provider.download).toHaveBeenCalledWith(
      "https://provider.example/result.mp4",
    );
    expect(test.artifacts.save).toHaveBeenCalledOnce();
    await expect(test.service.listSessionInfo()).resolves.toEqual([
      expect.objectContaining({ contentGenerationPhase: "succeeded" }),
    ]);
  });

  it("keeps the remote task active when a query fails", async () => {
    const test = setup(Promise.reject(new Error("temporary query failure")));
    const session = await test.service.createSession({
      cwd: "D:\\project",
      apiId: "runninghub-video",
    });
    const created = await test.service.createJob({
      sessionId: session.id,
      prompt: "test",
      files: [],
    });

    const queried = await test.service.pollJob(created.id);

    expect(queried.phase).toBe("running");
    expect(queried.remoteTaskId).toBe("remote-1");
    expect(queried.error).toEqual({
      stage: "query",
      message: "temporary query failure",
    });
    expect(test.provider.request).toHaveBeenCalledTimes(2);
  });

  it("prevents a second paid submission while a job is active", async () => {
    const test = setup({ status: "RUNNING" });
    const session = await test.service.createSession({
      cwd: "D:\\project",
      apiId: "runninghub-video",
    });
    await test.service.createJob({
      sessionId: session.id,
      prompt: "first",
      files: [],
    });

    await expect(
      test.service.createJob({
        sessionId: session.id,
        prompt: "second",
        files: [],
      }),
    ).rejects.toMatchObject({ code: "CONTENT_JOB_ACTIVE" });
    expect(test.provider.request).toHaveBeenCalledOnce();
  });
});
