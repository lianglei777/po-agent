import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./chat-center.tsx", import.meta.url)),
  "utf8",
);

describe("chat center session lifecycle", () => {
  it("does not remount the active controller while a draft session is persisted", () => {
    expect(source).toContain("<ChatCenterContent {...props} />");
    expect(source).not.toContain("key={props.session?.id");
  });
});
