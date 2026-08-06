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
    ]);
    expect(routes.every((route) =>
      route.providerId === "runninghub" &&
      route.enabled &&
      route.isDefault &&
      route.revision === 1
    )).toBe(true);
  });
});
