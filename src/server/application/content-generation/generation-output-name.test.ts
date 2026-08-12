import { describe, expect, it } from "vitest";
import { generationOutputName } from "./generation-output-name";

describe("generationOutputName", () => {
  it("keeps concise names aligned with Chinese and English prompts", () => {
    expect(generationOutputName("生成一张 雨夜上海街头的电影感照片", "image"))
      .toBe("雨夜上海街头的电影感照片");
    expect(generationOutputName("A watercolor fox reading beside a window", "image"))
      .toBe("A-watercolor-fox-reading-beside-a-window");
  });

  it("removes unsafe punctuation and falls back for empty prompts", () => {
    expect(generationOutputName("portrait: <night> / close-up?", "image"))
      .toBe("portrait-night-close-up");
    expect(generationOutputName("  ***  ", "video"))
      .toBe("generated-video");
  });
});
