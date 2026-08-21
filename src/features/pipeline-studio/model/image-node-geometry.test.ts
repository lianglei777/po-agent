import { describe, expect, it } from "vitest";
import { calculateImageNodeSize } from "./image-node-geometry";

describe("image node geometry", () => {
  it("adapts a node to landscape and portrait media", () => {
    expect(calculateImageNodeSize({ naturalWidth: 1600, naturalHeight: 900, currentWidth: 360 }))
      .toEqual({ width: 360, height: 202.5 });
    expect(calculateImageNodeSize({ naturalWidth: 800, naturalHeight: 1600, currentWidth: 360 }))
      .toEqual({ width: 360, height: 720 });
  });

  it("keeps very wide and very tall images inside the canvas limits", () => {
    expect(calculateImageNodeSize({ naturalWidth: 4000, naturalHeight: 400, currentWidth: 360 }))
      .toEqual({ width: 1200, height: 120 });
    expect(calculateImageNodeSize({ naturalWidth: 400, naturalHeight: 4000, currentWidth: 360 }))
      .toEqual({ width: 120, height: 1200 });
  });
});
