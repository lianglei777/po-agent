import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const composerSources = [
  new URL("../text-ai-composer.tsx", import.meta.url),
  new URL("../image-ai-composer.tsx", import.meta.url),
  new URL("../video-ai-composer.tsx", import.meta.url),
].map((url) => readFileSync(fileURLToPath(url), "utf8"));

describe("canvas composer consistency", () => {
  it("keeps expand and submit interactions in shared components", () => {
    for (const source of composerSources) {
      expect(source).toContain("<CanvasNodeComposerShell");
      expect(source).toContain("expandLabel={t.pipeline.textAiExpand}");
      expect(source).toContain("<CanvasComposerSubmitAction");
      expect(source).not.toContain("<Maximize2");
    }
  });
});
