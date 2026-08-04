import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createContentGenerationApiDraft, createRunningHubDraft } from "./defaults";

const source = readFileSync(
  fileURLToPath(new URL("./content-generation-center.tsx", import.meta.url)),
  "utf8",
);

describe("content generation conversation", () => {
  it("uses a five-second polling floor and five-second configuration defaults", () => {
    expect(createContentGenerationApiDraft().completion).toMatchObject({
      intervalMs: 5000,
    });
    expect(createRunningHubDraft().completion).toMatchObject({
      intervalMs: 5000,
    });
    expect(source).toContain("MIN_POLL_INTERVAL_MS = 5000");
    expect(source).toContain("Math.max(api.completion.intervalMs, MIN_POLL_INTERVAL_MS)");
  });

  it("renders jobs as user and provider turns with local media and response details", () => {
    expect(source).toContain("<GenerationTurn");
    expect(source).toContain("<GenerationResult");
    expect(source).toContain("<MediaPreview");
    expect(source).toContain("job.submitRequest");
    expect(source).toContain("job.submitResponse");
    expect(source).toContain("job.latestQueryResponse");
    expect(source).toContain("job.outputs.filter(isDisplayOutput)");
    expect(source).not.toContain("providerTextOutput");
    expect(source).not.toContain("submitting || activeJob ?");
  });
});
