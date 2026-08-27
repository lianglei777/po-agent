import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./message-view.tsx", import.meta.url)),
  "utf8",
);

describe("chat execution process visual contract", () => {
  const stylesPath = fileURLToPath(
    new URL("./message-view.module.css", import.meta.url),
  );
  const styles = existsSync(stylesPath) ? readFileSync(stylesPath, "utf8") : "";

  it("renders derived assistant turns instead of one article per assistant message", () => {
    expect(source).toContain("buildMessagePresentation");
    expect(source).toContain("<AssistantTurnView");
    expect(source).not.toContain("const visible = messages");
  });

  it("uses one execution process disclosure with linear internal steps", () => {
    expect(source).toContain("function ExecutionProcess");
    expect(source).toContain("t.chat.message.executionProcess");
    expect(source).toContain('key: "execution-process"');
    expect(source).toContain("<Collapse");
    expect(source).toContain("styles.stepList");
    expect(source).toContain("wasActive");
    expect(source).not.toContain("const automaticValue = streaming");
  });

  it("promotes generation review to the assistant message surface", () => {
    expect(source).toContain("const generationReviews = useMemo");
    expect(source).toContain("generationReviews.map((details)");
    expect(source).toContain("generationDetailsWithView");
    expect(source).toContain("generationRunIdsKey(sourceGenerationDetails)");
    expect(source).toContain("results={currentResults}");
    expect(source).not.toContain("if (details.review)");
  });

  it("polls active generation runs every ten seconds without unstable dependencies", () => {
    expect(source).toContain("const GENERATION_POLL_INTERVAL_MS = 10_000");
    expect(source).toContain("window.setTimeout(poll, GENERATION_POLL_INTERVAL_MS)");
    expect(source).toContain("}, [activeRunIdsKey])");
    expect(source).not.toContain("[generationPollingKey, sourceGenerationDetails]");
    expect(source).toContain("<GenerationArtifactGallery artifacts={generatedArtifacts} cwd={cwd} />");
  });

  it("keeps tool status and disclosure controls in stable columns", () => {
    expect(source).toContain("styles.stepSummary");
    expect(source).toContain("styles.stepStatus");
    expect(styles).toContain(
      "grid-template-columns: 14px minmax(0, 1fr) 56px 14px;",
    );
    expect(styles).toContain("width: 56px;");
    expect(source).not.toContain('className="ml-auto"');
  });

  it("does not promote a recovered tool failure to the process header", () => {
    expect(source).not.toContain('status.state === "error"');
    expect(source).not.toContain("t.chat.message.executionError");
    expect(source).not.toContain("border-destructive/40");
  });

  it("resets inherited accordion typography and gives steps visible disclosure state", () => {
    expect(source).toContain("font-sans whitespace-normal");
    expect(source).toContain("ChevronRight");
    expect(source).toContain("styles.stepChevron");
    expect(styles).toContain(".stepDetails[open] > .stepSummary .stepChevron");
    expect(styles).toContain("transform: rotate(90deg);");
  });

  it("draws separators between adjacent execution steps", () => {
    expect(source).toContain("styles.stepList");
    expect(styles).toContain(".stepList > * + *");
    expect(styles).toContain("border-top: 1px solid var(--border-subtle);");
  });

  it("uses Codex-like neutral message and tool surfaces", () => {
    expect(source).toContain("max-w-[78%] rounded-floating bg-[var(--user-bg)]");
    expect(source).toContain(
      "rounded-floating border border-line-subtle bg-[var(--tool-bg)]",
    );
    expect(source).toContain("[&_code]:rounded");
    expect(source).not.toContain("border border-line-subtle bg-[var(--user-bg)]");
  });

  it("does not render internal compaction summaries", () => {
    expect(source).not.toContain("function CompactionSummaryView");
    expect(source).not.toContain("<CompactionSummaryView");
  });

  it("keeps raw token usage and estimated generation speed out of messages", () => {
    expect(source).not.toContain("aggregateUsage");
    expect(source).not.toContain("StreamingSpeed");
    expect(source).not.toContain("t.chat.message.usageIn");
    expect(source).not.toContain("t.chat.message.tokensPerSecond");
  });

  it("collapses long user messages with a line-clamp and expand toggle", () => {
    expect(source).toContain("function CollapsibleUserText");
    expect(source).toContain("line-clamp-[8]");
    expect(source).toContain("scrollHeight > el.clientHeight");
    expect(source).toContain("ResizeObserver");
    expect(source).toContain("t.chat.message.expand");
    expect(source).toContain("t.chat.message.collapse");
    expect(source).toContain("<CollapsibleUserText blocks={textBlocks} />");
  });
});
