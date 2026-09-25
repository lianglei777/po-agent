import path from "node:path";
import { describe, expect, it } from "vitest";
import { BundledPipelineSpecialistProfileSource } from "./bundled-pipeline-specialist-profile-source";

describe("BundledPipelineSpecialistProfileSource", () => {
  it("gives long structured creative outputs enough token and request budget", async () => {
    const source = new BundledPipelineSpecialistProfileSource(
      path.resolve("resources/pipeline-specialists"),
    );

    await expect(source.get("script")).resolves.toMatchObject({
      version: "1.1.0", maxOutputTokens: 8_000, requestTimeoutMs: 300_000,
    });
    await expect(source.get("storyboard")).resolves.toMatchObject({
      version: "1.2.0", maxOutputTokens: 12_000, requestTimeoutMs: 300_000,
    });
    await expect(source.get("prompt")).resolves.toMatchObject({
      version: "1.6.0", maxOutputTokens: 12_000, requestTimeoutMs: 300_000,
    });
  });
});
