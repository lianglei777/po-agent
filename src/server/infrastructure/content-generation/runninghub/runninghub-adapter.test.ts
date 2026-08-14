import { describe, expect, it, vi } from "vitest";
import { RunningHubAdapter } from "./runninghub-adapter";

describe("RunningHubAdapter", () => {
  it("maps normalized video input to the RunningHub request", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      taskId: "remote-1",
      status: "RUNNING",
      errorCode: "",
      errorMessage: "",
      results: null,
    }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);

    const result = await adapter.submit({
      operation: "seedance-2-text-to-video",
      generation: {
        prompt: "rainy bamboo forest",
        parameters: {
          resolution: "1080p",
          durationSeconds: 10,
          generateAudio: false,
          aspectRatio: "16:9",
          webSearch: true,
          returnLastFrame: true,
          seed: 7,
        },
      },
      assets: [],
      credential: "secret-key",
    });

    expect(result).toMatchObject({
      state: "pending",
      remoteTaskId: "remote-1",
      remoteStatus: "RUNNING",
      outputs: [],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://www.runninghub.cn/openapi/v2/rhart-video/sparkvideo-2.0/text-to-video",
    );
    expect(init?.headers).toEqual({
      Authorization: "Bearer secret-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "rainy bamboo forest",
      resolution: "1080p",
      duration: "10",
      generateAudio: false,
      ratio: "16:9",
      webSearch: true,
      returnLastFrame: true,
      seed: 7,
    });
  });

  it("uploads named assets before submitting image-to-video", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({
        code: 0,
        message: "success",
        data: { download_url: "https://www.runninghub.cn/view?file=first.png&Rh-Comfy-Auth=secret" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        taskId: "remote-2",
        status: "RUNNING",
      }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);

    const assets = await adapter.upload({
      assets: [{
        slot: "firstFrameUrl",
        name: "first.png",
        mimeType: "image/png",
        data: new Uint8Array([1, 2, 3]),
      }],
      credential: "secret-key",
    });
    const result = await adapter.submit({
      operation: "seedance-2-image-to-video",
      generation: { prompt: "camera pushes in" },
      assets,
      credential: "secret-key",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://www.runninghub.cn/openapi/v2/media/upload/binary",
    );
    expect(fetcher.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      prompt: "camera pushes in",
      firstFrameUrl: "https://www.runninghub.cn/view?file=first.png&Rh-Comfy-Auth=secret",
      lastFrameUrl: null,
    });
    expect(result.requestSnapshot).toMatchObject({
      firstFrameUrl: expect.stringContaining("Rh-Comfy-Auth=%5BREDACTED%5D"),
    });
    expect(JSON.stringify(result.requestSnapshot)).not.toContain("secret");
  });

  it("normalizes successful polling outputs and redacts snapshots", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      taskId: "remote-1",
      status: "SUCCESS",
      token: "must-not-persist",
      webhookSign: "must-also-not-persist",
      credential: "must-never-persist",
      password: "must-also-never-persist",
      callbackUrl: "http://callback.test/path?X-Amz-Credential=access-key&X-Amz-Signature=signature",
      results: [{
        url: "https://bucket.myqcloud.com/output.mp4",
        outputType: "mp4",
        text: null,
      }],
    }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);

    const result = await adapter.poll({
      operation: "seedance-2-text-to-video",
      remoteTaskId: "remote-1",
      credential: "secret-key",
    });

    expect(result).toMatchObject({
      state: "succeeded",
      outputs: [{
        url: "https://bucket.myqcloud.com/output.mp4",
        outputType: "mp4",
      }],
      rawSnapshot: {
        token: "[REDACTED]",
        webhookSign: "[REDACTED]",
        credential: "[REDACTED]",
        password: "[REDACTED]",
        callbackUrl: expect.stringContaining("X-Amz-Credential=%5BREDACTED%5D"),
      },
    });
    expect(JSON.stringify(result.rawSnapshot)).not.toContain("access-key");
    expect(JSON.stringify(result.rawSnapshot)).not.toContain("signature");
  });

  it("bounds oversized provider audit snapshots", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      taskId: "remote-large",
      status: "RUNNING",
      debug: "x".repeat(80 * 1024),
    }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);

    const result = await adapter.poll({
      operation: "seedance-2-text-to-video",
      remoteTaskId: "remote-large",
      credential: "secret-key",
    });

    expect(result.rawSnapshot).toMatchObject({
      truncated: true,
      originalSizeBytes: expect.any(Number),
      preview: expect.any(String),
    });
    expect(Buffer.byteLength(JSON.stringify(result.rawSnapshot), "utf8"))
      .toBeLessThan(64 * 1024);
  });

  it("accepts a successful task response wrapped in data", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      code: 0,
      message: "success",
      data: { taskId: "nested-task", status: "RUNNING", results: null },
    }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);

    await expect(adapter.submit({
      operation: "seedream-v5-pro-text-to-image",
      generation: { prompt: "a complete image prompt" },
      assets: [],
      credential: "secret-key",
    })).resolves.toMatchObject({
      state: "pending",
      remoteTaskId: "nested-task",
      remoteStatus: "RUNNING",
    });
  });

  it("preserves a provider business error returned with HTTP 200", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      code: 4001,
      message: "prompt length must be between 5 and 5000",
    }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);

    await expect(adapter.submit({
      operation: "seedream-v5-pro-text-to-image",
      generation: { prompt: "..." },
      assets: [],
      credential: "secret-key",
    })).resolves.toMatchObject({
      state: "failed",
      errorCode: "4001",
      errorMessage: "prompt length must be between 5 and 5000",
    });
  });

  it("rejects output download URLs outside the allowlist", async () => {
    const adapter = new RunningHubAdapter(vi.fn() as unknown as typeof fetch);

    await expect(
      adapter.download("http://127.0.0.1/private"),
    ).rejects.toMatchObject({
      code: "GENERATION_DOWNLOAD_URL_REJECTED",
    });
  });

  it("maps seedance 2.5 text-to-video with bitrateMode and outputFormat", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      taskId: "remote-25",
      status: "RUNNING",
      errorCode: "",
      errorMessage: "",
      results: null,
    }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);

    await adapter.submit({
      operation: "seedance-2-5-text-to-video",
      generation: {
        prompt: "cinematic city night",
        parameters: {
          resolution: "1080p",
          durationSeconds: 10,
          generateAudio: true,
          aspectRatio: "16:9",
          webSearch: false,
          returnLastFrame: false,
          bitrateMode: "high",
          outputFormat: "mov",
          seed: 42,
        },
      },
      assets: [],
      credential: "secret-key",
    });

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(
      "https://www.runninghub.cn/openapi/v2/bytedance/seedance-2.5-token/text-to-video",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      prompt: "cinematic city night",
      resolution: "1080p",
      duration: "10",
      generateAudio: true,
      ratio: "16:9",
      webSearch: false,
      returnLastFrame: false,
      bitrateMode: "high",
      outputFormat: "mov",
      seed: 42,
    });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
