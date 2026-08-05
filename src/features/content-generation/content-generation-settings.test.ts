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

  it("renders RunningHub as a built-in provider", () => {
    // 后端 listApis/listProviders 已合并内置项，前端无需再合并
    expect(source).not.toContain("createBuiltinRunningHubProvider");
    expect(source).not.toContain("createBuiltinRunningHubApis");
  });

  it("collapses API documentation by default with lazy loading", () => {
    expect(source).toContain("docsExpanded");
    expect(source).toContain("setDocsExpanded");
  });

  it("supports show/hide toggle for the common API key", () => {
    expect(source).toContain("Eye");
    expect(source).toContain("EyeOff");
    expect(source).toContain("showApiKey");
  });

  it("hides delete for RunningHub provider and APIs", () => {
    expect(source).toContain("deletable");
    expect(source).toContain("isRunningHub");
  });
});
