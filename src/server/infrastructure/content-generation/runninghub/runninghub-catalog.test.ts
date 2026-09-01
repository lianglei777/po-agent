import { describe, expect, it } from "vitest";
import {
  createRunningHubRoutes,
  RUNNINGHUB_OPERATIONS,
} from "./runninghub-catalog";
import {
  buildRunningHubRequest,
  resolveRunningHubExecutionConfig,
} from "./runninghub-request-builder";

describe("RunningHub catalog", () => {
  it("compiles every operation into a frozen trusted execution config", () => {
    const routes = createRunningHubRoutes("2026-08-27T00:00:00.000Z");

    expect(RUNNINGHUB_OPERATIONS).toHaveLength(25);
    expect(routes).toHaveLength(25);
    expect(routes.find((route) => route.id === "runninghub-wan-3-reference-to-video")?.navigationLabel)
      .toBe("reference-to-video");
    expect(routes.find((route) => route.id === "runninghub-seedream-v5-pro-text-to-image")?.navigationLabel)
      .toBe("text-to-image");
    for (const route of routes) {
      expect(route.revision).toBeGreaterThanOrEqual(10);
      expect(route.adapterConfig).toMatchObject({
        protocol: "runninghub-standard-v1",
        operation: route.providerOperation,
      });
      expect(JSON.stringify(route.adapterConfig)).not.toContain("https://");
      expect(JSON.stringify(route.adapterConfig)).not.toMatch(
        /authorization|credential|api[-_]?key/i,
      );
    }
  });

  it("builds only declared request fields and applies finite serializers", () => {
    const config = resolveRunningHubExecutionConfig(
      "wan-2-7-text-to-video",
      {},
    );

    expect(buildRunningHubRequest(config, {
      prompt: "rain over a quiet lake",
      parameters: {
        durationSeconds: 8,
        resolution: "1080P",
        unknownVendorField: "must-not-leak",
      },
    }, [])).toEqual({
      prompt: "rain over a quiet lake",
      negativePrompt: null,
      resolution: "1080P",
      duration: "8",
      promptExtend: false,
      seed: null,
      audioUrl: null,
      aspectRatio: "16:9",
    });
  });

  it("rejects an arbitrary endpoint in a persisted execution config", () => {
    expect(() => resolveRunningHubExecutionConfig(
      "seedance-2-text-to-video",
      {
        protocol: "runninghub-standard-v1",
        operation: "seedance-2-text-to-video",
        endpoint: "https://attacker.test/collect",
        fields: [],
      },
    )).toThrow("RunningHub operation is not supported");
  });

  it("maps Seedance 2.0 Mini and Fast requests using their trusted protocols", () => {
    const imageAssets = [
      { slot: "firstFrameUrl", order: 0, name: "first.png", mimeType: "image/png", reference: { kind: "url" as const, url: "https://assets.test/first.png" } },
      { slot: "lastFrameUrl", order: 1, name: "last.png", mimeType: "image/png", reference: { kind: "url" as const, url: "https://assets.test/last.png" } },
    ];
    const multimodalAssets = [
      { slot: "imageUrls", order: 0, name: "image.png", mimeType: "image/png", reference: { kind: "url" as const, url: "https://assets.test/image.png" } },
      { slot: "videoUrls", order: 0, name: "video.mp4", mimeType: "video/mp4", reference: { kind: "url" as const, url: "https://assets.test/video.mp4" } },
      { slot: "audioUrls", order: 0, name: "audio.mp3", mimeType: "audio/mpeg", reference: { kind: "url" as const, url: "https://assets.test/audio.mp3" } },
    ];

    const imageConfig = resolveRunningHubExecutionConfig("seedance-2-fast-image-to-video", {});
    expect(imageConfig.endpoint).toBe("/openapi/v2/rhart-video/sparkvideo-2.0-fast/image-to-video");
    expect(buildRunningHubRequest(imageConfig, {
      prompt: "camera pushes in",
      parameters: { resolution: "1080p", durationSeconds: -1, aspectRatio: "16:9" },
    }, imageAssets)).toMatchObject({
      prompt: "camera pushes in",
      resolution: "1080p",
      duration: "-1",
      ratio: "16:9",
      firstFrameUrl: "https://assets.test/first.png",
      lastFrameUrl: "https://assets.test/last.png",
    });

    const multimodalConfig = resolveRunningHubExecutionConfig("seedance-2-mini-multimodal-video", {});
    expect(multimodalConfig.endpoint).toBe("/openapi/v2/rhart-video/sparkvideo-2.0-mini/multimodal-video");
    expect(buildRunningHubRequest(multimodalConfig, {
      prompt: "use image 1 and video 1",
      parameters: {},
    }, multimodalAssets)).toMatchObject({
      imageUrls: ["https://assets.test/image.png"],
      videoUrls: ["https://assets.test/video.mp4"],
      audioUrls: ["https://assets.test/audio.mp3"],
    });
  });

  it("maps self-deploy audio separation and numbered multimodal assets", () => {
    const audioConfig = resolveRunningHubExecutionConfig("extract-vocal-audio", {});
    expect(buildRunningHubRequest(audioConfig, { prompt: "" }, [{
      slot: "videoUrl", name: "source.mp4", mimeType: "video/mp4",
      reference: { kind: "url", url: "https://assets.test/source.mp4" },
    }])).toEqual({ videoUrl: "https://assets.test/source.mp4" });

    const multimodalConfig = resolveRunningHubExecutionConfig("minimax-h3-oss-multimodal-video", {});
    expect(buildRunningHubRequest(multimodalConfig, {
      prompt: "follow the references",
      parameters: { aspectRatio: "16:9 (Widescreen)", durationSeconds: 8 },
    }, [
      { slot: "imageUrls", order: 1, name: "two.png", mimeType: "image/png", reference: { kind: "url", url: "https://assets.test/two.png" } },
      { slot: "imageUrls", order: 0, name: "one.png", mimeType: "image/png", reference: { kind: "url", url: "https://assets.test/one.png" } },
      { slot: "audioUrls", order: 0, name: "voice.mp3", mimeType: "audio/mpeg", reference: { kind: "url", url: "https://assets.test/voice.mp3" } },
    ])).toMatchObject({
      image1: "https://assets.test/one.png",
      image2: "https://assets.test/two.png",
      image9: null,
      video1: null,
      video3: null,
      audio1: "https://assets.test/voice.mp3",
      audio3: null,
      prompt: "follow the references",
      aspectRatio: "16:9 (Widescreen)",
      duration: 8,
    });
  });
});
