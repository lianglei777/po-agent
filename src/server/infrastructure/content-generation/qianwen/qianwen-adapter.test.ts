import { describe, expect, it, vi } from "vitest";
import { QianwenAdapter } from "./qianwen-adapter";
import { createQianwenRoutes } from "./qianwen-catalog";

const [ROUTE] = createQianwenRoutes("2026-08-27T00:00:00.000Z");

describe("QianwenAdapter", () => {
  it("submits an async Wan 3.0 task with the required headers", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      request_id: "request-1",
      output: { task_id: "task-1", task_status: "PENDING" },
    }));
    const adapter = new QianwenAdapter(fetcher);

    const result = await adapter.submit({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      generation: {
        prompt: "海边奔跑的金毛",
        parameters: {
          resolution: "720P",
          aspectRatio: "16:9",
          durationSeconds: 10,
          generateAudio: false,
          promptExtend: true,
          watermark: false,
          seed: 9,
        },
      },
      assets: [],
      credential: "secret-key",
    });

    expect(result).toMatchObject({
      state: "pending",
      remoteTaskId: "task-1",
      remoteStatus: "PENDING",
      outputs: [],
      retryAfterMs: 15_000,
    });
    expect(JSON.stringify(result.requestSnapshot)).not.toContain("secret-key");
    expect(fetcher).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer secret-key",
          "Content-Type": "application/json",
          "X-DashScope-Async": "enable",
        },
        redirect: "error",
      }),
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      model: "wan3.0-video",
      input: { prompt: "海边奔跑的金毛" },
      parameters: {
        resolution: "720P",
        ratio: "16:9",
        duration: 10,
        audio: false,
        prompt_extend: true,
        watermark: false,
        seed: 9,
      },
    });
  });

  it("polls a completed task and redacts signed output URLs in snapshots", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      request_id: "request-2",
      output: {
        task_id: "task-2",
        task_status: "SUCCEEDED",
        video_url: "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/video.mp4?OSSAccessKeyId=access-key&Signature=signature&security-token=token",
      },
    }));
    const adapter = new QianwenAdapter(fetcher);

    const result = await adapter.poll({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      remoteTaskId: "task-2/unsafe",
      credential: "secret-key",
    });

    expect(fetcher.mock.calls[0][0]).toBe(
      "https://dashscope.aliyuncs.com/api/v1/tasks/task-2%2Funsafe",
    );
    expect(result).toMatchObject({
      state: "succeeded",
      remoteTaskId: "task-2",
      outputs: [{
        url: expect.stringContaining("OSSAccessKeyId=access-key"),
        outputType: "mp4",
      }],
      rawSnapshot: {
        output: {
          video_url: expect.stringContaining("OSSAccessKeyId=%5BREDACTED%5D"),
        },
      },
    });
    expect(JSON.stringify(result.rawSnapshot)).not.toContain("access-key");
    expect(JSON.stringify(result.rawSnapshot)).not.toContain("Signature=signature");
    expect(JSON.stringify(result.rawSnapshot)).not.toContain("security-token=token");
  });

  it("normalizes provider failures without scheduling another poll", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      output: {
        task_id: "task-3",
        task_status: "FAILED",
        code: "InvalidParameter",
        message: "invalid ratio",
      },
    }));
    const adapter = new QianwenAdapter(fetcher);

    await expect(adapter.poll({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      remoteTaskId: "task-3",
      credential: "secret-key",
    })).resolves.toMatchObject({
      state: "failed",
      errorCode: "InvalidParameter",
      errorMessage: "invalid ratio",
      retryAfterMs: undefined,
    });
  });

  it("rejects assets until the OSS preparation stage is implemented", async () => {
    const adapter = new QianwenAdapter(vi.fn() as unknown as typeof fetch);

    await expect(adapter.prepareAssets({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      assets: [{
        slot: "firstFrameUrl",
        name: "frame.png",
        mimeType: "image/png",
        data: new Uint8Array([1]),
      }],
      credential: "secret-key",
    })).rejects.toMatchObject({ code: "GENERATION_OPERATION_UNSUPPORTED" });
  });

  it("downloads only allowlisted DashScope result hosts without redirects", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(
      new Uint8Array([1, 2, 3]),
      { status: 200, headers: { "content-type": "video/mp4" } },
    ));
    const adapter = new QianwenAdapter(fetcher);

    await expect(adapter.download(
      "https://attacker.test/video.mp4",
    )).rejects.toMatchObject({ code: "GENERATION_DOWNLOAD_URL_REJECTED" });
    await expect(adapter.download(
      "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/video.mp4?Signature=signed",
    )).resolves.toEqual({
      data: new Uint8Array([1, 2, 3]),
      contentType: "video/mp4",
    });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });

  it("maps invalid JSON and HTTP errors to operational provider errors", async () => {
    const invalidJson = new QianwenAdapter(vi.fn<typeof fetch>(async () => (
      new Response("not-json", { status: 200 })
    )));
    await expect(invalidJson.poll({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      remoteTaskId: "task-4",
      credential: "secret-key",
    })).rejects.toMatchObject({ code: "GENERATION_PROVIDER_PROTOCOL_ERROR" });

    const failedRequest = new QianwenAdapter(vi.fn<typeof fetch>(async () => jsonResponse(
      { code: "InvalidApiKey", message: "invalid API key" },
      401,
    )));
    await expect(failedRequest.poll({
      operation: ROUTE.providerOperation,
      executionConfig: ROUTE.adapterConfig,
      remoteTaskId: "task-5",
      credential: "secret-key",
    })).rejects.toMatchObject({
      code: "GENERATION_PROVIDER_ERROR",
      message: "invalid API key",
    });
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
