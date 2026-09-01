import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./canvas-model-picker.tsx", import.meta.url)),
  "utf8",
);

describe("canvas model picker", () => {
  it("keeps every model row compact and motion-safe", () => {
    expect(source).toContain("flex h-10 w-full items-center");
    expect(source).toContain("motion-reduce:transition-none");
    expect(source).toContain("[scrollbar-gutter:stable]");
    expect(source).not.toContain("grid-template-rows");
  });

  it("can expose a route mode without replacing provider metadata", () => {
    expect(source).toContain("badge?: string");
    expect(source).toContain("item.badge");
    expect(source).toContain("item.meta");
  });

  it("uses one flat list with details behind an accessible information control", () => {
    expect(source).toContain("itemDetailsLabel: string");
    expect(source).toContain("items.map((item)");
    expect(source).toContain('trigger={["hover", "focus", "click"]}');
    expect(source).toContain("<Info className=\"size-3.5\" />");
    expect(source).toContain("aria-label={`${itemDetailsLabel}: ${item.name}`}");
    expect(source).not.toContain("item.group");
  });
});
