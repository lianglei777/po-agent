import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./use-session-navigation.ts", import.meta.url)),
  "utf8",
);

describe("session navigation request ownership", () => {
  it("only commits the latest refresh result", () => {
    expect(source).toContain("const refreshRevision = useRef(0)");
    expect(source).toContain("const revision = ++refreshRevision.current");
    expect(source).toContain("revision !== refreshRevision.current");
    expect(source).toContain("const finishLoading = loadingRefreshPending.current");
  });
});
