import { describe, expect, it } from "vitest";
import { createRunningHubRoutes } from "./runninghub-routes";

describe("createRunningHubRoutes", () => {
  it("provides one stable catalog default for every supported capability", () => {
    const routes = createRunningHubRoutes("2026-08-06T00:00:00.000Z");

    expect(routes).toHaveLength(18);
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
  });

  it("assigns product names for grouping", () => {
    const routes = createRunningHubRoutes("2026-08-06T00:00:00.000Z");
    const products = [...new Set(routes.map((route) => route.product))];

    expect(products).toEqual([
      "Seedream v5 Pro",
      "Seedance 2.0",
      "Seedance 2.5",
      "MiniMax Hailuo H3",
      "PixVerse V6",
      "Wan 2.7",
      "Wan 3.0",
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
});
