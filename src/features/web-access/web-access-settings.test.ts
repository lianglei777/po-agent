import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./web-access-settings.tsx", import.meta.url)),
  "utf8",
);

describe("Web Access settings", () => {
  it("auto-saves edits and reports success through Ant Design message", () => {
    expect(source).toContain("AUTO_SAVE_DELAY_MS");
    expect(source).toContain("saveWebAccessSettings(snapshot");
    expect(source).toContain("message.success(t.common.settingsSaved)");
    expect(source).not.toContain("onClick={() => void save()}");
    expect(source).not.toContain("{t.common.save}");
  });

  it("keeps API keys directly editable in password inputs", () => {
    expect(source).toContain("<Input.Password");
    expect(source).toContain("value={provider.apiKey}");
    expect(source).toContain("iconRender={(visible)");
  });
});
