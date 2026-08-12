import { describe, expect, it } from "vitest";
import { createRunningHubRoutes } from "./runninghub-routes";

describe("createRunningHubRoutes", () => {
  it("provides one explicit default route for every supported capability", () => {
    const routes = createRunningHubRoutes("2026-08-06T00:00:00.000Z");

    expect(routes.map((route) => route.capability)).toEqual([
      "text-to-image",
      "image-to-image",
      "text-to-video",
      "image-to-video",
      "multimodal-to-video",
      "text-to-video",
      "image-to-video",
      "multimodal-to-video",
    ]);
    expect(routes.every((route) =>
      route.providerId === "runninghub" &&
      !route.enabled &&
      route.isDefault &&
      route.revision === 4 &&
      route.inputSchema.prompt.required !== undefined
    )).toBe(true);
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

    expect(products).toEqual(["Seedream v5 Pro", "Seedance 2.0", "Seedance 2.5"]);
    expect(routes.every((route) => route.product.length > 0)).toBe(true);
  });
});
