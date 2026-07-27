import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./conversation-navigator.tsx", import.meta.url)),
  "utf8",
);

describe("conversation navigator interaction shell", () => {
  it("uses semantic full-row controls instead of hover-only minimap nodes", () => {
    expect(source).toContain('aria-current={active ? "location" : undefined}');
    expect(source).toContain("onClick={() => navigateTo(entry.id)}");
    expect(source).toContain("line-clamp-2");
    expect(source).not.toContain("onPointerMove");
  });

  it("supports keyboard traversal and a direct latest-message action", () => {
    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "ArrowUp"');
    expect(source).toContain('event.key === "Home"');
    expect(source).toContain('event.key === "End"');
    expect(source).toContain("t.workspace.jumpToLatest");
  });

  it("keeps compact mode as an overlay rather than consuming chat width", () => {
    expect(source).toContain("compact && overlayOpen");
    expect(source).toContain("absolute top-0 right-9 bottom-0");
    expect(source).toContain("NAVIGATOR_STORAGE_KEY");
  });
});
