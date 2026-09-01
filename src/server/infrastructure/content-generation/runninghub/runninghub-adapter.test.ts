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

    const assets = await adapter.prepareAssets({
      operation: "seedance-2-image-to-video",
      executionConfig: {},
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

  it("uses explicit binding order instead of asynchronous upload order", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ taskId: "ordered-task", status: "RUNNING" }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);

    await adapter.submit({
      operation: "seedream-v5-pro-image-to-image",
      generation: { prompt: "让图片1模仿图片2" },
      assets: [
        { slot: "imageUrls", bindingId: "ref-2", order: 1, name: "second.png", mimeType: "image/png", reference: { kind: "url", url: "https://example.test/second.png" } },
        { slot: "imageUrls", bindingId: "ref-1", order: 0, name: "first.png", mimeType: "image/png", reference: { kind: "url", url: "https://example.test/first.png" } },
      ],
      credential: "secret-key",
    });

    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).imageUrls).toEqual([
      "https://example.test/first.png",
      "https://example.test/second.png",
    ]);
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

  it.each([
    ["minimax-hailuo-h3-text-to-video", "/openapi/v2/minimax/hailuo-h3/text-to-video"],
    ["minimax-hailuo-h3-image-to-video", "/openapi/v2/minimax/hailuo-h3/image-to-video"],
    ["minimax-hailuo-h3-multimodal-video", "/openapi/v2/minimax/hailuo-h3/multimodal-to-video"],
    ["pixverse-v6-text-to-video", "/openapi/v2/pixverse-v6/text-to-video"],
    ["pixverse-v6-image-to-video", "/openapi/v2/pixverse-v6/image-to-video"],
    ["wan-2-7-text-to-video", "/openapi/v2/alibaba/wan-2.7/text-to-video"],
    ["wan-2-7-image-to-video", "/openapi/v2/alibaba/wan-2.7/image-to-video"],
    ["wan-2-7-reference-to-video", "/openapi/v2/alibaba/wan-2.7/reference-to-video"],
    ["wan-3-image-to-video", "/openapi/v2/alibaba/wan-3.0/image-to-video"],
    ["wan-3-reference-to-video", "/openapi/v2/alibaba/wan-3.0/reference-to-video"],
    ["seedance-2-mini-image-to-video", "/openapi/v2/rhart-video/sparkvideo-2.0/image-to-video"],
    ["seedance-2-fast-image-to-video", "/openapi/v2/rhart-video/sparkvideo-2.0-fast/image-to-video"],
    ["seedance-2-mini-multimodal-video", "/openapi/v2/rhart-video/sparkvideo-2.0-mini/multimodal-video"],
    ["seedance-2-fast-multimodal-video", "/openapi/v2/rhart-video/sparkvideo-2.0-fast/multimodal-video"],
    ["extract-background-audio", "/openapi/v2/rhart-audio/extract-background"],
    ["extract-vocal-audio", "/openapi/v2/rhart-audio/extract-vocal"],
    ["minimax-h3-oss-multimodal-video", "/openapi/v2/rhart-video/minimax-h3-oss/fl2va-advanced"],
  ])("submits %s to its trusted endpoint", async (operation, path) => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      taskId: "new-operation",
      status: "RUNNING",
    }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);

    await adapter.submit({
      operation,
      generation: { prompt: "complete generation prompt" },
      assets: [],
      credential: "secret-key",
    });

    expect(fetcher.mock.calls[0][0]).toBe(`https://www.runninghub.cn${path}`);
  });

  it("maps MiniMax, PixVerse, Wan 2.7 and Wan 3.0 semantic fields", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      taskId: "mapped-operation",
      status: "RUNNING",
    }));
    const adapter = new RunningHubAdapter(fetcher as typeof fetch);
    const image = { slot: "firstFrameUrl", name: "first.png", mimeType: "image/png", reference: { kind: "url", url: "https://assets.test/first.png" } };
    const audio = { slot: "audioUrls", name: "music.mp3", mimeType: "audio/mpeg", reference: { kind: "url", url: "https://assets.test/music.mp3" } };

    await adapter.submit({
      operation: "minimax-hailuo-h3-image-to-video",
      generation: { prompt: "move", parameters: { resolution: "2K", durationSeconds: 12, watermark: true } },
      assets: [image],
      credential: "secret-key",
    });
    await adapter.submit({
      operation: "pixverse-v6-text-to-video",
      generation: { prompt: "move", parameters: { resolution: "1080p", durationSeconds: 7, generateAudio: false, aspectRatio: "21:9" } },
      assets: [],
      credential: "secret-key",
    });
    await adapter.submit({
      operation: "wan-2-7-image-to-video",
      generation: { prompt: "move", parameters: { resolution: "1080P", durationSeconds: 8, negativePrompt: "blur", promptExtend: true, seed: 9 } },
      assets: [image, audio],
      credential: "secret-key",
    });
    await adapter.submit({
      operation: "wan-3-reference-to-video",
      generation: { prompt: "视频1中的人物看向图1", parameters: { resolution: "1080P", durationSeconds: "auto", aspectRatio: "adaptive", generateAudio: true, fileUrl: "https://docs.test/brief.pdf" } },
      assets: [audio],
      credential: "secret-key",
    });

    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      resolution: "2K",
      duration: "12",
      aigc_watermark: true,
      firstFrameUrl: "https://assets.test/first.png",
    });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      duration: 7,
      generateAudioSwitch: false,
      aspectRatio: "21:9",
    });
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toMatchObject({
      firstImageUrl: "https://assets.test/first.png",
      audioUrl: "https://assets.test/music.mp3",
      negativePrompt: "blur",
      promptExtend: true,
      seed: 9,
    });
    expect(JSON.parse(String(fetcher.mock.calls[3][1]?.body))).toMatchObject({
      duration: "auto",
      audio: true,
      audioUrls: ["https://assets.test/music.mp3"],
      fileUrl: "https://docs.test/brief.pdf",
      linkUrl: null,
    });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
