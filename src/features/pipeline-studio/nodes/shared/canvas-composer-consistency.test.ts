import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const composerSources = [
  new URL("../text-ai-composer.tsx", import.meta.url),
  new URL("../image-ai-composer.tsx", import.meta.url),
  new URL("../video-ai-composer.tsx", import.meta.url),
].map((url) => readFileSync(fileURLToPath(url), "utf8"));
const audioComposerSource = readFileSync(fileURLToPath(new URL("../audio-ai-composer.tsx", import.meta.url)), "utf8");
const imageNodeSource = readFileSync(fileURLToPath(new URL("../image-canvas-node.tsx", import.meta.url)), "utf8");
const videoNodeSource = readFileSync(fileURLToPath(new URL("../video-canvas-node.tsx", import.meta.url)), "utf8");
const audioNodeSource = readFileSync(fileURLToPath(new URL("../audio-canvas-node.tsx", import.meta.url)), "utf8");

describe("canvas composer consistency", () => {
  it("keeps expand and submit interactions in shared components", () => {
    for (const source of composerSources) {
      expect(source).toContain("<CanvasNodeComposerShell");
      expect(source).toContain("expandLabel={t.pipeline.textAiExpand}");
      expect(source).toContain("<CanvasComposerSubmitAction");
      expect(source).not.toContain("<Maximize2");
    }
  });

  it("uses the same flat model picker and information interaction for every generation composer", () => {
    for (const source of [...composerSources, audioComposerSource]) {
      expect(source).toContain("<CanvasModelPicker");
      expect(source).toContain("itemDetailsLabel={t.pipeline.generationModelDetails}");
      expect(source).not.toContain("group:");
    }
  });

  it("uses the shared server-owned stale state for generated media", () => {
    for (const source of [imageNodeSource, videoNodeSource]) {
      expect(source).toContain("generationProvenance?.stale");
      expect(source).toContain("generationOutputStaleBadge");
    }
    expect(videoNodeSource).not.toContain("videoSelection?.historical");
    expect(videoNodeSource).not.toContain("source.updatedAt > selectedAt");
  });

  it("mounts the audio generation composer from the audio node", () => {
    expect(audioNodeSource).toContain("<AudioAiComposer");
    expect(audioNodeSource).toContain("label={t.pipeline.audioAiGenerate}");
    expect(audioComposerSource).toContain("audioGenerationRoutes(response.routes)");
    expect(audioComposerSource).toContain("hasVideoReference");
  });
});
