import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./conversation-navigator.tsx", import.meta.url)),
  "utf8",
);

describe("conversation navigator interaction shell", () => {
  it("renders a quiet right-edge mark rail without becoming a panel", () => {
    expect(source).toContain('aria-current={active ? "location" : undefined}');
    expect(source).toContain("onClick={() => navigateTo(entry.id)}");
    expect(source).toContain("pointer-events-none absolute top-0 right-3");
    expect(source).toContain("waveLineWidth");
    expect(source).not.toContain("w-56");
    expect(source).not.toContain("NAVIGATOR_STORAGE_KEY");
  });

  it("supports keyboard traversal and accessible turn labels", () => {
    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "ArrowUp"');
    expect(source).toContain('event.key === "Home"');
    expect(source).toContain('event.key === "End"');
    expect(source).toContain("t.workspace.jumpToConversation.replace");
  });

  it("shows the user title and assistant summary in a hover preview", () => {
    expect(source).toContain("data-conversation-preview");
    expect(source).toContain("{hoveredEntry.title}");
    expect(source).toContain("{hoveredEntry.summary}");
    expect(source).toContain("onPointerEnter");
    expect(source).toContain("onPointerLeave");
  });
});
