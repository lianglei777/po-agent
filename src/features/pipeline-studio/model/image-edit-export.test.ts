import { describe, expect, it } from "vitest";
import { EMPTY_IMAGE_EDIT_TRANSFORM, rotateImagePreview } from "./image-edit-transform";
import { editedImageFileName, transformedImageSize } from "./image-edit-export";

describe("image edit export", () => {
  it("swaps output dimensions for sideways rotations", () => {
    expect(transformedImageSize(EMPTY_IMAGE_EDIT_TRANSFORM, { width: 1600, height: 900 }))
      .toEqual({ width: 1600, height: 900 });
    expect(transformedImageSize(rotateImagePreview(EMPTY_IMAGE_EDIT_TRANSFORM, "right"), { width: 1600, height: 900 }))
      .toEqual({ width: 900, height: 1600 });
  });

  it("creates a stable PNG name for the derived image", () => {
    expect(editedImageFileName("reference.jpeg")).toBe("reference-edited.png");
    expect(editedImageFileName("  ")).toBe("image-edited.png");
  });
});
