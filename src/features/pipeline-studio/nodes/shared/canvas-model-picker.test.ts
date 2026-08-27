import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./canvas-model-picker.tsx", import.meta.url)),
  "utf8",
);

describe("canvas model picker", () => {
  it("delays pointer previews without delaying keyboard focus", () => {
    expect(source).toContain("setTimeout(() => setPreviewId(itemId), 80)");
    expect(source).toContain("onFocus={() => {");
    expect(source).toContain("setPreviewId(item.id)");
  });

  it("animates detail disclosure and respects reduced-motion preferences", () => {
    expect(source).toContain("transition-[grid-template-rows]");
    expect(source).toContain("transition-[opacity,transform]");
    expect(source).toContain("motion-reduce:transition-none");
    expect(source).toContain("[scrollbar-gutter:stable]");
  });
});
