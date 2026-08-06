import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRunningHubRoutes } from "@/server/infrastructure/content-generation/runninghub/runninghub-routes";

const source = readFileSync(
  fileURLToPath(new URL("./content-generation-center.tsx", import.meta.url)),
  "utf8",
);

describe("content generation conversation", () => {
  it("refreshes durable local runs without directly polling the provider", () => {
    expect(source).toContain("REFRESH_INTERVAL_MS = 2_000");
    expect(source).toContain("loadGenerationRuns(session.id)");
    expect(source).not.toContain("pollContentGenerationJob");
  });

  it("provides five RunningHub routes with stable semantic input schemas", () => {
    const routes = createRunningHubRoutes();
    expect(routes.map((route) => route.id)).toEqual([
      "runninghub-seedream-v5-pro-text-to-image",
      "runninghub-seedream-v5-pro-image-to-image",
      "runninghub-seedance-2-text-to-video",
      "runninghub-seedance-2-image-to-video",
      "runninghub-seedance-2-multimodal-video",
    ]);
    expect(routes.every((route) => route.revision === 2)).toBe(true);
    expect(routes[2].inputSchema.parameters?.map((field) => field.key)).toContain("aspectRatio");
    expect(routes[1].inputSchema.assets?.map((slot) => slot.key)).toEqual(["imageUrls"]);
    expect(routes[3].inputSchema.assets).toMatchObject([
      { key: "firstFrameUrl", required: true, maxFiles: 1 },
      { key: "lastFrameUrl", required: false, maxFiles: 1 },
    ]);
    expect(routes[4].inputSchema.assets?.map((slot) => slot.key)).toEqual([
      "imageUrls",
      "videoUrls",
      "audioUrls",
    ]);
  });

  it("renders durable runs as user and provider turns with local artifacts", () => {
    expect(source).toContain("<GenerationTurn");
    expect(source).toContain("<GenerationResult");
    expect(source).toContain("<MediaPreview");
    expect(source).toContain("view.run.input.assets");
    expect(source).toContain("view.artifacts");
    expect(source).toContain("artifact.localPath");
    expect(source).not.toContain("submitResponse");
  });

  it("provides cancellation and same-run retry actions", () => {
    expect(source).toContain("cancelGenerationRun");
    expect(source).toContain("retryGenerationRun");
    expect(source).toContain('status === "failed" || status === "cancelled"');
    expect(source).toContain("retryRun");
    expect(source).toContain("cancelRun");
  });

  it("lets every persisted session select an enabled generation route", () => {
    expect(source).toContain("selectedRouteId");
    expect(source).toContain("setSelectedRouteId");
    expect(source).toContain("routes.map((item)");
    expect(source).not.toContain("contentGenerationApiId");
  });
});
