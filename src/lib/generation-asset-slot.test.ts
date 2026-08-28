import { describe, expect, it } from "vitest";
import { generationAssetSlotForReference } from "./generation-asset-slot";

describe("generationAssetSlotForReference", () => {
  it("uses semantic standard slots when a route has multiple image slots", () => {
    const slots = [
      { key: "firstFrameUrl", label: "First", mediaType: "image" as const },
      { key: "lastFrameUrl", label: "Last", mediaType: "image" as const },
    ];
    expect(generationAssetSlotForReference(slots, { mediaType: "image", role: "first-frame" })?.key).toBe("firstFrameUrl");
    expect(generationAssetSlotForReference(slots, { mediaType: "image", role: "reference" })).toBeUndefined();
  });

  it("supports vendor-specific names when the media type has one unambiguous slot", () => {
    expect(generationAssetSlotForReference(
      [{ key: "drivingAudio", label: "Audio", mediaType: "audio" }],
      { mediaType: "audio", role: "reference" },
    )?.key).toBe("drivingAudio");
  });
});
