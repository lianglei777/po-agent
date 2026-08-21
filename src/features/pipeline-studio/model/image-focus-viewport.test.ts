import { describe, expect, it } from "vitest";
import { calculateImageFocusViewport } from "./image-focus-viewport";

describe("calculateImageFocusViewport", () => {
  it("enlarges a small image node without exceeding the editing cap", () => {
    expect(calculateImageFocusViewport({
      currentZoom: 0.5,
      nodeWidth: 360,
      nodeHeight: 300,
      viewportWidth: 1440,
      viewportHeight: 900,
    })).toBe(1.6);
  });

  it("keeps the current zoom when the canvas is already closer", () => {
    expect(calculateImageFocusViewport({
      currentZoom: 1.4,
      nodeWidth: 900,
      nodeHeight: 700,
      viewportWidth: 1024,
      viewportHeight: 768,
    })).toBe(1.4);
  });

  it("uses a readable minimum focus zoom for large nodes", () => {
    expect(calculateImageFocusViewport({
      currentZoom: 0.2,
      nodeWidth: 1600,
      nodeHeight: 1200,
      viewportWidth: 1024,
      viewportHeight: 768,
    })).toBe(0.85);
  });
});
