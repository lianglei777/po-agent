import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const branchHistorySource = readFileSync(
  fileURLToPath(new URL("./branch-history.tsx", import.meta.url)),
  "utf8",
);

describe("branch history dropdown", () => {
  test("preserves the shared viewport width constraint", () => {
    expect(branchHistorySource).toContain("<Dropdown");
    expect(branchHistorySource).toContain('placement="bottomRight"');
    expect(branchHistorySource).not.toContain('className="max-w-80"');
  });
});
