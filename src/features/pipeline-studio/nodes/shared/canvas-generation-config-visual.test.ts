import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./canvas-generation-config.tsx", import.meta.url),
  "utf8",
);

describe("canvas generation config summary", () => {
  it("shows generate-audio state as accessible audio icons", () => {
    expect(source).toContain('field.key === "generateAudio"');
    expect(source).toContain("<Volume2 aria-hidden=\"true\"");
    expect(source).toContain("<VolumeX aria-hidden=\"true\"");
    expect(source).toContain("aria-label={audioStatusLabel}");
    expect(source).toContain("title={audioStatusLabel}");
  });
});
