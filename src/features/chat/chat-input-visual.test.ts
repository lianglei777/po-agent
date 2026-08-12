import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./chat-input.tsx", import.meta.url)),
  "utf8",
);

describe("chat input visual contract", () => {
  it("keeps the composer structural and gives focus a semantic accent", () => {
    expect(source).toContain("has-[textarea:focus-visible]:border-ring");
    expect(source).toContain(
      "has-[textarea:focus-visible]:shadow-[var(--shadow-composer-focus)]",
    );
    expect(source).not.toContain("has-[textarea:focus-visible]:ring-2");
    expect(source).not.toContain("has-[textarea:focus-visible]:ring-ring");
    expect(source).not.toContain("focus-within:ring-2");
    expect(source).toContain(
      "rounded-composer border border-line-strong bg-elevated shadow-[var(--shadow-composer)]",
    );
    expect(source).not.toContain("rounded-lg border bg-elevated");
    expect(source).not.toContain("backdrop-blur");
  });

  it("keeps composer controls in one compact toolbar", () => {
    expect(source).toContain("flex h-12 items-center");
    expect(source).toContain("gap-1.5 px-3 py-1.5");
    expect(source).not.toContain("border-t border-line-subtle bg-subtle");
    expect(source).not.toContain("id=\"composer-shortcut\"");
    expect(source).not.toContain("t.chat.input.shortcutIdle");
    expect(source).not.toContain("t.chat.input.shortcutRunning");
    expect(source).toContain("t.chat.input.thinking");
    expect(source).toContain("t.chat.input.generationControl");
    expect(source).toContain("t.chat.input.generationAutomatic");
    expect(source).toContain("t.chat.input.generationReview");
    expect(source).not.toContain("t.chat.input.tools");
    expect(source).not.toContain("changeTools");
    expect(source).toContain("t.chat.input.queue");
    expect(source).toContain("t.chat.input.steer");
    expect(source).toContain("t.chat.input.stopAgent");
  });

  it("keeps generation review as an explicit composer choice", () => {
    expect(source).toContain('value={generationReview ? "review" : "automatic"}');
    expect(source).toContain('setGenerationReview(value === "review")');
    expect(source).toContain("disabled={running}");
  });

  it("does not expose manual context compaction controls", () => {
    expect(source).not.toContain("{t.chat.input.compact}");
    expect(source).not.toContain("compactTooltip");
    expect(source).not.toContain("Minimize2");
  });

  it("uses a compact round idle send button", () => {
    expect(source).toContain('className="size-9 rounded-full"');
    expect(source).toContain('shape="circle"');
    expect(source).toContain('icon={<Send />}');
    expect(source).toContain('type="primary"');
    expect(source).toContain("aria-label={t.chat.input.sendMessage}");
  });

  it("uses Ant controls while preserving the native textarea bridge", () => {
    expect(source).toContain('import { Button, Select, Tooltip } from "antd"');
    expect(source).toContain('import { Textarea } from "@/components/ui/textarea"');
    expect(source).toContain('ref={textareaRef}');
    expect(source).toContain('autoSize={{ minRows: 2, maxRows: 8 }}');
    expect(source).toContain('variant="borderless"');
    expect(source).toContain("focus-visible:outline-none!");
  });
});
