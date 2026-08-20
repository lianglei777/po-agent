import { describe, expect, it } from "vitest";
import { calculateTextEditingViewport } from "./text-editing-viewport";

describe("text editing viewport", () => {
  it("zooms a small text node to the preferred editing scale", () => {
    const result = calculateTextEditingViewport({
      currentZoom: 0.4,
      nodeWidth: 320,
      nodeHeight: 220,
      viewportWidth: 1440,
      viewportHeight: 900,
    });

    expect(result.zoom).toBe(1.35);
    expect(result.centerOffsetY).toBeCloseTo(-22.22, 2);
  });

  it("keeps an already comfortable zoom without exceeding the cap", () => {
    expect(calculateTextEditingViewport({
      currentZoom: 1.4,
      nodeWidth: 320,
      nodeHeight: 220,
      viewportWidth: 1440,
      viewportHeight: 900,
    }).zoom).toBe(1.4);

    expect(calculateTextEditingViewport({
      currentZoom: 2,
      nodeWidth: 320,
      nodeHeight: 220,
      viewportWidth: 1440,
      viewportHeight: 900,
    }).zoom).toBe(1.45);
  });

  it("reduces the zoom when a large node needs more room", () => {
    const result = calculateTextEditingViewport({
      currentZoom: 0.5,
      nodeWidth: 1200,
      nodeHeight: 800,
      viewportWidth: 1440,
      viewportHeight: 900,
    });

    expect(result.zoom).toBe(0.75);
  });
});
