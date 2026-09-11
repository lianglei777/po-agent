import { describe, expect, it } from "vitest";
import { resolveModelBrand } from "./model-brand";

// 目录中的完整产品线快照：两个 provider catalog（qianwen / runninghub）的
// product 与 providerId 全量断言，防止 catalog 演进时品牌解析静默退化。
describe("resolveModelBrand", () => {
  it("resolves every qianwen catalog product to its brand", () => {
    expect(resolveModelBrand("Wan 3.0", undefined, "qianwen")).toBe("qwen");
    expect(resolveModelBrand("Wan 2.7", undefined, "qianwen")).toBe("qwen");
    expect(resolveModelBrand("Z-Image Turbo", undefined, "qianwen")).toBe("qwen");
    expect(resolveModelBrand("HappyHorse 1.1", undefined, "qianwen")).toBe("happyhorse");
    expect(resolveModelBrand("MiniMax-H3", undefined, "qianwen")).toBe("minimax");
  });

  it("resolves every runninghub catalog product to its brand", () => {
    expect(resolveModelBrand("Seedance 2.0", undefined, "runninghub")).toBe("jimeng");
    expect(resolveModelBrand("Seedance 2.0 Mini", undefined, "runninghub")).toBe("jimeng");
    expect(resolveModelBrand("Seedance 2.5", undefined, "runninghub")).toBe("jimeng");
    expect(resolveModelBrand("Seedream v5 Pro", undefined, "runninghub")).toBe("jimeng");
    expect(resolveModelBrand("MiniMax Hailuo H3", undefined, "runninghub")).toBe("minimax");
    expect(resolveModelBrand("MiniMax H3 OSS", undefined, "runninghub")).toBe("minimax");
    expect(resolveModelBrand("PixVerse V6", undefined, "runninghub")).toBe("pixverse");
    expect(resolveModelBrand("Wan 2.7", undefined, "runninghub")).toBe("qwen");
    expect(resolveModelBrand("Wan 3.0", undefined, "runninghub")).toBe("qwen");
    expect(resolveModelBrand("可灵对口型", undefined, "runninghub")).toBe("kling");
  });

  it("falls back to the initial-letter tile for platform-native tools", () => {
    expect(resolveModelBrand("RunningHub 音频分离", undefined, "runninghub")).toBeUndefined();
  });

  it("prioritizes product over name and provider signals", () => {
    expect(resolveModelBrand("Seedance 2.0", "Wan 2.7", "qianwen")).toBe("jimeng");
    expect(resolveModelBrand(undefined, "可灵对口型", "runninghub")).toBe("kling");
  });

  it("resolves text-model providers and model ids", () => {
    expect(resolveModelBrand("Claude Sonnet 4.5", "claude-sonnet-4-5", "anthropic")).toBe("claude");
    expect(resolveModelBrand(undefined, "gpt-5.2", "openai")).toBe("openai");
    expect(resolveModelBrand(undefined, "gemini-3-pro", "google")).toBe("gemini");
    expect(resolveModelBrand(undefined, "deepseek-v3.2", "deepseek")).toBe("deepseek");
    expect(resolveModelBrand(undefined, "kimi-k2", "moonshot")).toBe("kimi");
    expect(resolveModelBrand(undefined, "glm-5", "zai")).toBe("zhipu");
    expect(resolveModelBrand(undefined, undefined, "minimax")).toBe("minimax");
    expect(resolveModelBrand(undefined, undefined, "xai")).toBe("xai");
    expect(resolveModelBrand(undefined, undefined, "grok-4")).toBe("grok");
  });

  it("normalizes case, spacing, and CJK aliases", () => {
    expect(resolveModelBrand("  SEEDANCE   2.5 ")).toBe("jimeng");
    expect(resolveModelBrand("通义万相")).toBe("qwen");
    expect(resolveModelBrand("即梦")).toBe("jimeng");
  });

  it("keeps unknown identifiers unmatched instead of guessing", () => {
    expect(resolveModelBrand(undefined, undefined, "some-unknown-provider")).toBeUndefined();
    expect(resolveModelBrand("")).toBeUndefined();
    expect(resolveModelBrand(undefined, undefined, undefined)).toBeUndefined();
  });

  it("prefers longer aliases to avoid short-alias false positives", () => {
    // "o1" 是 openai 的短别名，不得命中 moonshot 系列命名。
    expect(resolveModelBrand(undefined, "moonshot-v1-8k", "moonshot")).toBe("moonshot");
  });
});
