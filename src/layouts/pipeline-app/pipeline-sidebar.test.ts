import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./pipeline-sidebar.tsx", import.meta.url)),
  "utf8",
);

describe("Pipeline sidebar", () => {
  it("keeps the back-to-Agent action icon-only", () => {
    expect(source).toContain('className="flex size-9 items-center justify-center');
    expect(source).toContain('<Bot className="size-[17px] shrink-0" />');
    expect(source).not.toContain("<span className=\"truncate text-sm font-medium\">");
  });
});
