import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./chat-input.tsx", import.meta.url)),
  "utf8",
);

describe("chat input visual contract", () => {
  it("keeps the composer structural and gives focus a semantic accent", () => {
    expect(source).toContain("focus-within:border-ring");
    expect(source).toContain("has-[textarea:focus-visible]:ring-2");
    expect(source).toContain("has-[textarea:focus-visible]:ring-ring");
    expect(source).not.toContain("focus-within:ring-2");
    expect(source).toContain(
      "rounded-composer border border-line-strong bg-elevated shadow-[var(--shadow-composer)]",
    );
    expect(source).not.toContain("rounded-lg border bg-elevated");
    expect(source).not.toContain("backdrop-blur");
  });

  it("keeps composer controls in one compact toolbar", () => {
    expect(source).toContain("flex min-h-12 items-center");
    expect(source).not.toContain("border-t border-line-subtle bg-subtle");
    expect(source).not.toContain("id=\"composer-shortcut\"");
    expect(source).not.toContain("t.chat.input.shortcutIdle");
    expect(source).not.toContain("t.chat.input.shortcutRunning");
    expect(source).toContain("t.chat.input.thinking");
    expect(source).not.toContain("t.chat.input.tools");
    expect(source).not.toContain("changeTools");
    expect(source).toContain("t.chat.input.queue");
    expect(source).toContain("t.chat.input.steer");
    expect(source).toContain("t.chat.input.stopAgent");
    expect(source).toContain("t.chat.input.compact");
  });

  it("does not present tokensBefore as the amount saved", () => {
    expect(source).not.toContain("compactResult.tokensBefore.toLocaleString()");
  });

  it("keeps the compact label stable when the action is unavailable", () => {
    expect(source).not.toContain("t.chat.input.compacted");
  });

  it("explains why the disabled compact action is unavailable", () => {
    expect(source).toContain("<Tooltip");
    expect(source).toContain("title={compactTooltip}");
    expect(source).toContain('className="inline-flex"');
    expect(source).toContain("t.chat.input.alreadyCompacted");
    expect(source).toContain("t.chat.input.compactUnavailableWhileRunning");
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
    expect(source).toContain('autoSize={{ minRows: 3, maxRows: 8 }}');
  });
});
