import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createContentGenerationApiDraft, createRunningHubDraft, createRunningHubDrafts } from "./defaults";

const source = readFileSync(
  fileURLToPath(new URL("./content-generation-center.tsx", import.meta.url)),
  "utf8",
);

describe("content generation conversation", () => {
  it("uses a five-second polling floor and five-second configuration defaults", () => {
    expect(createContentGenerationApiDraft().completion).toMatchObject({
      intervalMs: 5000,
    });
    expect(createRunningHubDraft().completion).toMatchObject({
      intervalMs: 5000,
    });
    expect(source).toContain("MIN_POLL_INTERVAL_MS = 5000");
    expect(source).toContain("Math.max(api.completion.intervalMs, MIN_POLL_INTERVAL_MS)");
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

  it("renders jobs as user and provider turns with local media and response details", () => {
    expect(source).toContain("<GenerationTurn");
    expect(source).toContain("<GenerationResult");
    expect(source).toContain("<MediaPreview");
    expect(source).toContain("job.submitRequest");
    expect(source).toContain("job.submitResponse");
    expect(source).toContain("job.latestQueryResponse");
    expect(source).toContain("job.outputs.filter(isDisplayOutput)");
    expect(source).not.toContain("providerTextOutput");
    expect(source).not.toContain("submitting || activeJob ?");
  });

  it("provides a retry button for query-stage failures", () => {
    expect(source).toContain("retryPoll");
    expect(source).toContain("retryingJobId");
    expect(source).toContain('job.error?.stage === "query"');
    expect(source).toContain("RotateCcw");
    expect(source).toContain("retryQuery");
    expect(source).toContain("retrying");
  });
});
