import { describe, expect, it, vi } from "vitest";
import type { SaveContentGenerationApiRequest } from "@/contracts/content-generation";
import type { ContentGenerationState } from "@/server/domain/content-generation";
import { ContentGenerationService } from "./content-generation-service";

function api(): SaveContentGenerationApiRequest {
  return {
    id: "runninghub-video",
    providerId: "runninghub",
    name: "RunningHub video",
    capability: "text-to-video",
    credentialMode: "override",
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

function setup(queryResponse: unknown, configuredApi = api()) {
  let state: ContentGenerationState = {
    version: 2,
    providers: [{
      id: "runninghub",
      name: "RunningHub",
      type: "runninghub",
      commonHeaders: { Authorization: "Bearer {{secret.apiKey}}" },
    }],
    apis: [configuredApi],
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
    getProvider: vi.fn(async (id: string) =>
      structuredClone(state.providers.find((item) => item.id === id) ?? null),
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
    upload: vi.fn(async () => ({ code: 0, data: { download_url: "https://provider.example/upload.png" } })),
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

  it("re-polls a query-stage failure and succeeds when the remote recovers", async () => {
    const test = setup({ status: "FAILED", errorMessage: "Internal server error" });
    const session = await test.service.createSession({
      cwd: "D:\\project",
      apiId: "runninghub-video",
    });
    const created = await test.service.createJob({
      sessionId: session.id,
      prompt: "test",
      files: [],
    });

    const failed = await test.service.pollJob(created.id);
    expect(failed.phase).toBe("failed");
    expect(failed.error).toEqual({ stage: "query", message: "Internal server error" });

    // 设置重试后的远端响应
    test.provider.request.mockResolvedValueOnce({
      status: "SUCCESS",
      results: [{ url: "https://provider.example/result.mp4", outputType: "mp4" }],
    });

    const retried = await test.service.pollJob(created.id);
    expect(retried.phase).toBe("succeeded");
    expect(retried.error).toBeUndefined();
    expect(retried.outputs).toHaveLength(1);
    expect(test.provider.request).toHaveBeenCalledTimes(3);
  });

  it("skips the timeout check when re-polling a query-stage failure", async () => {
    const test = setup({ status: "FAILED", errorMessage: "Internal server error" });
    const session = await test.service.createSession({
      cwd: "D:\\project",
      apiId: "runninghub-video",
    });
    const created = await test.service.createJob({
      sessionId: session.id,
      prompt: "test",
      files: [],
    });

    const failed = await test.service.pollJob(created.id);
    expect(failed.phase).toBe("failed");

    // 将 created 时间提前到超过 timeoutMs（120000ms）
    const state = test.getState();
    const job = state.jobs.find((item) => item.id === created.id);
    if (job) job.created = new Date(Date.now() - 200_000).toISOString();

    // 重试时应跳过超时检查，正常查询远端
    test.provider.request.mockResolvedValueOnce({ status: "RUNNING" });
    const retried = await test.service.pollJob(created.id);
    expect(retried.phase).toBe("running");
    expect(retried.error).toBeUndefined();
  });

  it("does not re-poll a submit-stage failure", async () => {
    const test = setup({ status: "RUNNING" });
    const session = await test.service.createSession({
      cwd: "D:\\project",
      apiId: "runninghub-video",
    });
    const created = await test.service.createJob({
      sessionId: session.id,
      prompt: "test",
      files: [],
    });

    // 模拟 submit 阶段失败
    const state = test.getState();
    const job = state.jobs.find((item) => item.id === created.id);
    if (job) {
      job.phase = "failed";
      job.error = { stage: "submit", message: "Submit failed" };
    }

    const result = await test.service.pollJob(created.id);
    expect(result.phase).toBe("failed");
    expect(result.error).toEqual({ stage: "submit", message: "Submit failed" });
    // 没有发起额外的查询请求
    expect(test.provider.request).toHaveBeenCalledTimes(1);
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

  it("maps dynamic parameters and named assets into the provider request", async () => {
    const configuredApi: SaveContentGenerationApiRequest = {
      ...api(),
      capability: "image-to-video",
      requiresImages: true,
      inputSchema: {
        prompt: { required: false },
        parameters: [{
          key: "resolution",
          label: "Resolution",
          type: "select",
          required: true,
          defaultValue: "720p",
          options: [{ label: "720p", value: "720p" }],
        }],
        assets: [{
          key: "firstFrameUrl",
          label: "First frame",
          mediaType: "image",
          required: true,
          maxFiles: 1,
          acceptedTypes: ["image/png"],
        }],
      },
      upload: {
        url: "https://provider.example/upload",
        fileField: "file",
        urlPath: "data.download_url",
        successPath: "code",
        successValues: [0],
      },
      submit: {
        ...api().submit,
        bodyTemplate: {
          prompt: "{{input.prompt}}",
          resolution: "{{input.resolution}}",
          firstFrameUrl: "{{input.firstFrameUrl}}",
        },
      },
    };
    const test = setup({ status: "RUNNING" }, configuredApi);
    const session = await test.service.createSession({
      cwd: "D:\\project",
      apiId: "runninghub-video",
    });

    const created = await test.service.createJob({
      sessionId: session.id,
      prompt: "",
      parameters: {},
      files: [{
        slot: "firstFrameUrl",
        name: "frame.png",
        mimeType: "image/png",
        data: new Uint8Array([1, 2, 3]),
      }],
    });

    expect(created.submitRequest?.body).toEqual({
      resolution: "720p",
      firstFrameUrl: "https://provider.example/upload.png",
    });
    expect(created.uploadedAssets).toEqual([{
      slot: "firstFrameUrl",
      name: "frame.png",
      mediaType: "image",
      url: "https://provider.example/upload.png",
    }]);
  });

  it("inherits the provider credential unless an API uses an override", async () => {
    const test = setup({ status: "RUNNING" });
    await test.service.saveProvider({
      id: "runninghub",
      name: "RunningHub",
      type: "runninghub",
      apiKey: "provider-key",
      commonHeaders: { Authorization: "Bearer {{secret.apiKey}}" },
    });
    const next = {
      ...api(),
      id: "runninghub-image",
      apiKey: undefined,
      credentialMode: "inherit" as const,
      catalogId: "runninghub-seedance-2-image-to-video",
    };

    await expect(test.service.saveApi(next)).resolves.toMatchObject({
      id: "runninghub-image",
      hasApiKeyOverride: false,
    });
    expect(test.getState().apis.find((item) => item.id === "runninghub-image")?.apiKey)
      .toBeUndefined();

    const session = await test.service.createSession({
      cwd: "D:\\project",
      apiId: "runninghub-image",
    });
    await test.service.createJob({ sessionId: session.id, prompt: "test", files: [] });
    expect(test.provider.request).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ Authorization: "Bearer provider-key" }),
      expect.any(Object),
    );
  });

  it("listApis and listProviders include built-in RunningHub entries when repository is empty", async () => {
    const test = setup({ status: "RUNNING" });
    // 清空存储，模拟首次使用
    test.getState().providers = [];
    test.getState().apis = [];

    const providers = await test.service.listProviders();
    expect(providers.some((p) => p.id === "builtin-runninghub")).toBe(true);

    const apis = await test.service.listApis();
    const catalogIds = apis.map((a) => a.catalogId);
    expect(catalogIds).toContain("runninghub-seedream-v5-pro-text-to-image");
    expect(catalogIds).toContain("runninghub-seedance-2-text-to-video");
    expect(apis.some((a) => a.id === "builtin-runninghub-seedream-v5-pro-text-to-image")).toBe(true);
  });

  it("createSession resolves a built-in RunningHub API without prior storage", async () => {
    const test = setup({ status: "RUNNING" });
    // 清空 API，但保留已存储的供应商使 cwd 校验通过
    test.getState().apis = [];

    const session = await test.service.createSession({
      cwd: "D:\\project",
      apiId: "builtin-runninghub-seedance-2-text-to-video",
    });
    expect(session.apiId).toBe("builtin-runninghub-seedance-2-text-to-video");

    // 内置 API 可以提交作业
    const job = await test.service.createJob({
      sessionId: session.id,
      prompt: "test",
      files: [],
    });
    expect(job.phase).toBe("running");
  });
});
