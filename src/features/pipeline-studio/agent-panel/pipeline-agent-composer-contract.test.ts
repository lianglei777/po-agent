import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./pipeline-agent-panel.tsx", import.meta.url)), "utf8");
const editorSource = readFileSync(fileURLToPath(new URL("../prompt-editor/resource-prompt-editor.tsx", import.meta.url)), "utf8");

describe("pipeline agent composer contract", () => {
  it("uses the shared rich resource editor without a concentrated preview strip", () => {
    expect(source).toContain("<ResourcePromptEditor");
    expect(source).toContain("showReferencePreviewStrip={false}");
    expect(source).toContain('canvasReferenceMode="all-nodes"');
    expect(source).toContain("pendingReferences=");
    expect(source).not.toContain("<Mentions");
    expect(source).not.toContain('className="flex w-full flex-wrap');
    expect(editorSource).toContain('pending: { default: false, rendered: false }');
    expect(editorSource).toContain("queueMicrotask(() => {");
  });

  it("submits and restores the structured inline document", () => {
    expect(source).toContain("document: submittedDocument");
    expect(source).toContain("parsed.document.content");
  });

  it("uses the directional send action and a floating collapsed Agent entry", () => {
    expect(source).toContain("SendHorizontal");
    expect(source).toContain('className="-rotate-90"');
    expect(source).not.toContain('shape="circle"');
    expect(source).toContain('className="absolute right-4 top-4 z-40"');
    expect(source).not.toContain('<Bot className="size-4 text-[var(--pl-text-secondary)]"');
  });
});
