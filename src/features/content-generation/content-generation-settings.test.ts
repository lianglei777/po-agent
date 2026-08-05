import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./content-generation-settings.tsx", import.meta.url)),
  "utf8",
);

describe("content generation API settings", () => {
  it("shows bundled documentation without exposing protocol editors", () => {
    expect(source).toContain("<ContentGenerationApiDocumentation");
    expect(source).not.toContain("AdvancedApiEditor");
    expect(source).not.toContain("labels.advancedProtocol");
  });
});
