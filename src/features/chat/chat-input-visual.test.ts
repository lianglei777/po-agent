import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./chat-input.tsx", import.meta.url)),
  "utf8",
);
const generationControlSource = readFileSync(
  fileURLToPath(new URL("./chat-generation-control.tsx", import.meta.url)),
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

  it("keeps composer controls in one compact responsive toolbar", () => {
    expect(source).toContain("flex min-h-12 flex-wrap items-center");
    expect(source).toContain("gap-1.5 px-3 py-1.5");
    expect(source).not.toContain("border-t border-line-subtle bg-subtle");
    expect(source).not.toContain("id=\"composer-shortcut\"");
    expect(source).not.toContain("t.chat.input.shortcutIdle");
    expect(source).not.toContain("t.chat.input.shortcutRunning");
    expect(source).toContain("t.chat.input.thinking");
    expect(source).toContain("<ChatGenerationControl");
    expect(source).not.toContain("t.chat.input.tools");
    expect(source).not.toContain("changeTools");
    expect(source).toContain("t.chat.input.queue");
    expect(source).toContain("t.chat.input.steer");
    expect(source).toContain("t.chat.input.stopAgent");
  });

  it("keeps all generation configuration behind one composer button", () => {
    expect(generationControlSource).toContain("<Popover");
    expect(generationControlSource).toContain("<Radio.Group");
    expect(generationControlSource).toContain("t.chat.input.generationAutoRoute");
    expect(generationControlSource).toContain("t.chat.input.generationReview");
    expect(generationControlSource).toContain("onReviewChange");
    expect(generationControlSource.match(/<HelpHint/g)).toHaveLength(3);
    expect(generationControlSource).toContain(
      'checked={mode.type === "generation-auto"}',
    );
    expect(generationControlSource).toContain(
      'mode.type === "generation-route" ? (',
    );
    expect(generationControlSource).toContain("t.chat.input.generationApi");
    expect(generationControlSource).not.toContain("generationManageApis");
    expect(generationControlSource).not.toContain("onOpenSettings");
    expect(
      generationControlSource.indexOf("t.chat.input.generationReview"),
    ).toBeLessThan(
      generationControlSource.indexOf("t.chat.input.generationApi"),
    );
    expect(source.match(/<ChatGenerationControl/g)).toHaveLength(1);
    expect(source).not.toContain("generationModeOptions");
    expect(source).not.toContain("generationExecution");
  });

  it("keeps each attached image removable from its top-right corner", () => {
    expect(source).toContain(
      'className="absolute top-1 right-1 z-10 inline-flex"',
    );
    expect(source).toContain(
      "aria-label={`${t.chat.input.removeImage} ${image.name}`}",
    );
    expect(source).toContain("onClick={() => removeImage(image.id)}");
    expect(source).toContain(
      'className="size-5 border border-[var(--text)] bg-[var(--text)] p-0 text-[var(--bg-panel)]',
    );
    expect(source).toContain('shape="circle"');
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
    expect(source).toContain('import { Button, Image, Select, Tooltip } from "antd"');
    expect(source).toContain('import { Textarea } from "@/components/ui/textarea"');
    expect(source).toContain('ref={textareaRef}');
    expect(source).toContain('autoSize={{ minRows: 2, maxRows: 8 }}');
    expect(source).toContain('variant="borderless"');
    expect(source).toContain("focus-visible:outline-none!");
  });
});
