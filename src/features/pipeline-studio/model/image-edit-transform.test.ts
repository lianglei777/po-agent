import { describe, expect, it } from "vitest";
import {
  EMPTY_IMAGE_EDIT_TRANSFORM,
  flipImagePreview,
  imagePreviewChanged,
  imagePreviewTransformCss,
  rotateImagePreview,
} from "./image-edit-transform";

describe("image edit preview transform", () => {
  it("normalizes repeated quarter turns", () => {
    let transform = EMPTY_IMAGE_EDIT_TRANSFORM;
    transform = rotateImagePreview(transform, "right");
    transform = rotateImagePreview(transform, "right");
    transform = rotateImagePreview(transform, "right");
    transform = rotateImagePreview(transform, "right");
    expect(transform.quarterTurns).toBe(0);
    expect(rotateImagePreview(EMPTY_IMAGE_EDIT_TRANSFORM, "left").quarterTurns).toBe(3);
  });

  it("toggles horizontal and vertical flips independently", () => {
    const horizontal = flipImagePreview(EMPTY_IMAGE_EDIT_TRANSFORM, "horizontal");
    const both = flipImagePreview(horizontal, "vertical");
    expect(both).toEqual({ quarterTurns: 0, flipHorizontal: true, flipVertical: true });
    expect(flipImagePreview(both, "horizontal").flipHorizontal).toBe(false);
  });

  it("scales a sideways preview so the rotated image remains inside its node", () => {
    const sideways = rotateImagePreview(EMPTY_IMAGE_EDIT_TRANSFORM, "right");
    expect(imagePreviewTransformCss(sideways, { width: 400, height: 200 }))
      .toBe("scaleX(1) scaleY(1) rotate(90deg) scale(0.5)");
    expect(imagePreviewChanged(sideways)).toBe(true);
    expect(imagePreviewChanged(EMPTY_IMAGE_EDIT_TRANSFORM)).toBe(false);
  });
});
