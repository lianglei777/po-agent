import { describe, expect, it } from "vitest";
import { createRunningHubRoutes } from "./runninghub-routes";

describe("createRunningHubRoutes", () => {
  it("provides one stable catalog default for every supported capability", () => {
    const routes = createRunningHubRoutes("2026-08-06T00:00:00.000Z");

    expect(routes).toHaveLength(26);
    expect(routes.every((route) =>
      route.providerId === "runninghub" &&
      !route.enabled &&
      route.inputSchema.prompt.required !== undefined
    )).toBe(true);
    for (const capability of [
      "text-to-image",
      "image-to-image",
      "text-to-video",
      "image-to-video",
      "multimodal-to-video",
      "video-to-audio",
    ] as const) {
      expect(routes.filter((route) => route.capability === capability && route.isDefault))
        .toHaveLength(1);
    }
    expect(JSON.stringify(routes.map((route) => route.inputSchema)))
      .not.toContain('"advanced"');
  });

  it("includes seedance 2.5 routes with bitrateMode and outputFormat defaults", () => {
    const routes = createRunningHubRoutes("2026-08-06T00:00:00.000Z");
    const seedance25Routes = routes.filter((route) =>
      route.providerOperation.startsWith("seedance-2-5"),
    );

    expect(seedance25Routes).toHaveLength(3);
    expect(seedance25Routes.every((route) =>
      route.defaults.bitrateMode === "standard" &&
      route.defaults.outputFormat === "mp4",
    )).toBe(true);
    expect(seedance25Routes[0].inputSchema.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "aspectRatio", presentation: { control: "ratio-grid", optionVisual: "ratio", summary: true } }),
      expect.objectContaining({ key: "durationSeconds", presentation: { control: "slider", summary: true, unit: "s" } }),
    ]));
  });

  it("assigns product names for grouping", () => {
    const routes = createRunningHubRoutes("2026-08-06T00:00:00.000Z");
    const products = [...new Set(routes.map((route) => route.product))];

    expect(products).toEqual([
      "Seedream v5 Pro",
      "Seedance 2.0",
      "Seedance 2.0 Mini",
      "Seedance 2.0 Fast",
      "Seedance 2.5",
      "MiniMax Hailuo H3",
      "PixVerse V6",
      "Wan 2.7",
      "Wan 3.0",
      "可灵对口型",
      "RunningHub 音频分离",
      "MiniMax H3 OSS",
    ]);
    expect(routes.every((route) => route.product.length > 0)).toBe(true);
  });

  it("models the new operation-specific inputs without leaking vendor fields", () => {
    const routes = createRunningHubRoutes("2026-08-26T00:00:00.000Z");
    const byOperation = new Map(routes.map((route) => [route.providerOperation, route]));

    expect(byOperation.get("minimax-hailuo-h3-image-to-video")?.inputSchema.constraints)
      .toEqual([{ kind: "at-least-one-asset", slots: ["firstFrameUrl", "lastFrameUrl"] }]);
    expect(byOperation.get("pixverse-v6-image-to-video")?.inputSchema.assets)
      .toMatchObject([{ key: "firstFrameUrl", required: true, maxFileSizeBytes: 10 * 1024 * 1024 }]);
    expect(byOperation.get("wan-2-7-reference-to-video")?.inputSchema.assets?.map((slot) => slot.maxFiles))
      .toEqual([5, 5, 1]);
    expect(byOperation.get("wan-3-reference-to-video")?.inputSchema.constraints)
      .toEqual([{ kind: "mutually-exclusive-parameters", keys: ["fileUrl", "linkUrl"] }]);
    expect(byOperation.get("wan-3-reference-to-video")?.defaults.resolution).toBe("1080P");
    expect(byOperation.get("wan-3-image-to-video")?.defaults.durationSeconds).toBe("auto");
  });

  it("models self-deploy audio extraction and advanced multimodal inputs", () => {
    const routes = createRunningHubRoutes("2026-09-01T00:00:00.000Z");
    const byOperation = new Map(routes.map((route) => [route.providerOperation, route]));
    const vocal = byOperation.get("extract-vocal-audio")!;
    const background = byOperation.get("extract-background-audio")!;
    const multimodal = byOperation.get("minimax-h3-oss-multimodal-video")!;

    expect([vocal, background].every((route) => route.capability === "video-to-audio")).toBe(true);
    expect(vocal.inputSchema.assets).toMatchObject([
      { key: "videoUrl", mediaType: "video", required: true, maxFiles: 1, maxFileSizeBytes: 200 * 1024 * 1024 },
    ]);
    expect(multimodal.inputSchema.assets?.map((slot) => [slot.key, slot.maxFiles, slot.maxFileSizeBytes]))
      .toEqual([
        ["imageUrls", 9, 100 * 1024 * 1024],
        ["videoUrls", 3, 100 * 1024 * 1024],
        ["audioUrls", 3, 100 * 1024 * 1024],
      ]);
    expect(multimodal.inputSchema.constraints).toEqual([{
      kind: "at-least-one-asset",
      slots: ["imageUrls", "videoUrls", "audioUrls"],
    }]);
  });

  it("models Seedance 2.0 Mini and Fast limits from the provider contracts", () => {
    const routes = createRunningHubRoutes("2026-09-01T00:00:00.000Z");
    const byOperation = new Map(routes.map((route) => [route.providerOperation, route]));
    const miniImage = byOperation.get("seedance-2-mini-image-to-video")!;
    const fastImage = byOperation.get("seedance-2-fast-image-to-video")!;
    const miniMultimodal = byOperation.get("seedance-2-mini-multimodal-video")!;
    const fastMultimodal = byOperation.get("seedance-2-fast-multimodal-video")!;

    expect(miniImage.inputSchema.assets).toMatchObject([
      { key: "firstFrameUrl", required: true, maxFiles: 1, maxFileSizeBytes: 30 * 1024 * 1024 },
      { key: "lastFrameUrl", required: false, maxFiles: 1, maxFileSizeBytes: 30 * 1024 * 1024 },
    ]);
    expect(miniImage.inputSchema.parameters?.find((field) => field.key === "resolution")?.options?.map((option) => option.value))
      .toEqual(["480p", "720p", "native1080p", "native4k", "1080p", "2k", "4k"]);
    expect(fastImage.inputSchema.parameters?.find((field) => field.key === "resolution")?.options?.map((option) => option.value))
      .toEqual(["480p", "720p", "1080p", "2k", "4k"]);
    expect(miniMultimodal.inputSchema.assets?.map((slot) => [slot.key, slot.maxFiles, slot.maxFileSizeBytes]))
      .toEqual([
        ["imageUrls", 9, 30 * 1024 * 1024],
        ["videoUrls", 3, 50 * 1024 * 1024],
        ["audioUrls", 3, 50 * 1024 * 1024],
      ]);
    expect(fastMultimodal.inputSchema.assets?.find((slot) => slot.key === "audioUrls")?.maxFileSizeBytes)
      .toBe(15 * 1024 * 1024);
    for (const route of [miniImage, fastImage, miniMultimodal, fastMultimodal]) {
      expect(route.inputSchema.parameters?.find((field) => field.key === "durationSeconds")?.options?.map((option) => option.value))
        .toEqual([-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    }
  });
});
