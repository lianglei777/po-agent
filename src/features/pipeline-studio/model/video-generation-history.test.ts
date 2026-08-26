import { describe, expect, it } from "vitest";
import { videoGenerationHistoryAction } from "./video-generation-history";

describe("video generation history", () => {
  it("keeps retry available when a failed run left a partial video artifact", () => {
    expect(videoGenerationHistoryAction("failed", true)).toBe("retry");
    expect(videoGenerationHistoryAction("cancelled", true)).toBe("retry");
  });

  it("allows only completed video artifacts to become the current Take", () => {
    expect(videoGenerationHistoryAction("succeeded", true)).toBe("select");
    expect(videoGenerationHistoryAction("running", true)).toBeNull();
    expect(videoGenerationHistoryAction("succeeded", false)).toBeNull();
  });
});
