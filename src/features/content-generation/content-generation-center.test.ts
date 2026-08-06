import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createContentGenerationApiDraft, createRunningHubDraft, createRunningHubDrafts } from "./defaults";

const source = readFileSync(
  fileURLToPath(new URL("./content-generation-center.tsx", import.meta.url)),
  "utf8",
);

describe("content generation conversation", () => {
  it("uses local durable-run refreshes without directly polling the provider", () => {
    expect(createContentGenerationApiDraft().completion).toMatchObject({
      intervalMs: 5000,
    });
    expect(createRunningHubDraft().completion).toMatchObject({
      intervalMs: 5000,
    });
    expect(source).toContain("REFRESH_INTERVAL_MS = 2_000");
    expect(source).toContain("loadGenerationRuns(session.id)");
    expect(source).not.toContain("pollContentGenerationJob");
  });

  it("provides five RunningHub catalog APIs with per-job input schemas", () => {
    const templates = createRunningHubDrafts();
    expect(templates.map((template) => template.catalogId)).toEqual([
      "runninghub-seedream-v5-pro-text-to-image",
      "runninghub-seedream-v5-pro-image-to-image",
      "runninghub-seedance-2-text-to-video",
      "runninghub-seedance-2-image-to-video",
      "runninghub-seedance-2-multimodal-video",
    ]);
    expect(templates[0].capability).toBe("text-to-image");
    expect(templates[0].output.defaultMediaType).toBe("image");
    expect(templates[1].capability).toBe("image-to-image");
    expect(templates[1].requiresImages).toBe(true);
    expect(templates[1].inputSchema?.assets?.map((slot) => slot.key)).toEqual(["imageUrls"]);
    expect(templates[3].inputSchema?.assets).toMatchObject([
      { key: "firstFrameUrl", required: true, maxFiles: 1 },
      { key: "lastFrameUrl", required: false, maxFiles: 1 },
    ]);
    expect(templates[4].inputSchema?.assets?.map((slot) => slot.key)).toEqual([
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

  it("provides explicit cancellation and same-run retry actions", () => {
    expect(source).toContain("cancelGenerationRun");
    expect(source).toContain("retryGenerationRun");
    expect(source).toContain('status === "failed" || status === "cancelled"');
    expect(source).toContain("RotateCcw");
    expect(source).toContain("retryRun");
    expect(source).toContain("cancelRun");
  });

  it("allows one session to select different generation capabilities", () => {
    expect(source).toContain("selectedApiId");
    expect(source).toContain("setSelectedApiId");
    expect(source).toContain("apis.map((item)");
    expect(source).not.toContain("session.contentGenerationApiId);");
  });
});
