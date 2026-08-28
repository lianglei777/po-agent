import { describe, expect, it } from "vitest";
import { generationOptionVisual } from "./generation-parameter-presentation";

describe("generationOptionVisual", () => {
  it("derives a reduced ratio while preserving exact API dimensions", () => {
    expect(generationOptionVisual("1024*1536")).toEqual({
      dimensions: "1024×1536",
      height: 1536,
      ratio: "2:3",
      width: 1024,
    });
  });

  it("accepts ratio values and ignores non-visual options", () => {
    expect(generationOptionVisual("16:9")?.ratio).toBe("16:9");
    expect(generationOptionVisual("adaptive")).toBeNull();
  });
});
