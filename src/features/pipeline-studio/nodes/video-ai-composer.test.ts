import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./video-ai-composer.tsx", import.meta.url)),
  "utf8",
);

describe("video AI composer route selection", () => {
  it("shows all enabled video routes instead of filtering them by current assets", () => {
    expect(source).toContain("routes={routes}");
    expect(source).toContain("videoGenerationRoutes(response.routes)");
    expect(source).not.toContain("videoRouteSupportsPrompt");
  });

  it("uses inferred capability only for the initial recommendation", () => {
    expect(source).toContain("const initialCapability = useRef(inferredCapability)");
    expect(source).toContain("initialCapability.current");
  });

  it("uses the compact flat picker with model details behind an information icon", () => {
    expect(source).toContain("itemDetailsLabel={t.pipeline.generationModelDetails}");
    expect(source).not.toContain("group:");
  });
});
