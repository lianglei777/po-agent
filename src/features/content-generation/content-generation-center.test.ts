import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createRunningHubRoutes } from "@/server/infrastructure/content-generation/runninghub/runninghub-routes";

const source = readFileSync(
  fileURLToPath(new URL("./content-generation-center.tsx", import.meta.url)),
  "utf8",
);
const composerSource = readFileSync(
  fileURLToPath(new URL("./content-generation-composer.tsx", import.meta.url)),
  "utf8",
);

describe("content generation conversation", () => {
  it("uses Ant Design controls without deprecated v6 alert props", () => {
    expect(source).toContain('from "antd"');
    expect(composerSource).toContain('from "antd"');
    expect(source).not.toContain("<Alert message=");
    expect(composerSource).not.toContain("<Alert className=\"mt-2\" message=");
  });

  it("refreshes durable local runs without directly polling the provider", () => {
    expect(source).toContain("REFRESH_INTERVAL_MS = 2_000");
    expect(source).toContain("loadGenerationRuns(session.id)");
    expect(source).not.toContain("pollContentGenerationJob");
  });

  it("provides all RunningHub routes with stable semantic input schemas", () => {
    const routes = createRunningHubRoutes();
    expect(routes.map((route) => route.id)).toEqual([
      "runninghub-seedream-v5-pro-text-to-image",
      "runninghub-seedream-v5-pro-image-to-image",
      "runninghub-seedance-2-text-to-video",
      "runninghub-seedance-2-image-to-video",
      "runninghub-seedance-2-multimodal-video",
      "runninghub-seedance-2-5-text-to-video",
      "runninghub-seedance-2-5-image-to-video",
      "runninghub-seedance-2-5-multimodal-video",
    ]);
    expect(routes.every((route) => route.revision === 3)).toBe(true);
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
    // Seedance 2.5 路由包含新增的 bitrateMode 与 outputFormat 字段
    expect(routes[5].inputSchema.parameters?.map((field) => field.key)).toContain("bitrateMode");
    expect(routes[5].inputSchema.parameters?.map((field) => field.key)).toContain("outputFormat");
    // 2.5 multimodal 素材上限提升：图片 30、视频 10、音频 10
    expect(routes[7].inputSchema.assets?.map((slot) => slot.maxFiles)).toEqual([30, 10, 10]);
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

  it("keeps route selection with the route-dependent composer inputs", () => {
    expect(source).toContain("selectedRouteId");
    expect(source).toContain("setSelectedRouteId");
    expect(source).toContain("centerRevisionRef.current");
    expect(source).toContain("void setSelectedRouteId(");
    expect(source).not.toContain("<header");
    expect(composerSource).toContain("routes: GenerationRouteDto[]");
    expect(composerSource).toContain("onChange={onRouteChange}");
    expect(composerSource).toContain("options={routes.map((item)");
    expect(composerSource.indexOf("t.contentGeneration.capability"))
      .toBeLessThan(composerSource.indexOf("<AssetSlotInput"));
    expect(source).not.toContain("contentGenerationApiId");
  });

  it("hides persisted center state until the current session owns it", () => {
    expect(source).toContain("centerSessionId === session.id");
    expect(source).toContain("!ownsCenterSession || centerLoading");
  });
});
