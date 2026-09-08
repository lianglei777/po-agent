import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./studio-canvas.tsx", import.meta.url)), "utf8");

describe("studio canvas controls", () => {
  it("keeps map and fit controls in the bottom-left toolbar", () => {
    expect(source).toContain("<MapPinned className=\"size-4\" />");
    expect(source).toContain("<Minimize2 className=\"size-4\" />");
    expect(source).toContain("onFit={() => instanceRef.current?.fitView");
    expect(source).not.toContain("<Minimize2 className=\"size-4\" />\n          </button>");
  });

  it("uses the requested Lucide node icons in the creation menu", () => {
    expect(source).toContain("icon={<ImageIcon />}");
    expect(source).toContain("icon={<Play />}");
    expect(source).toContain("icon={<Music2 />}");
  });
});
