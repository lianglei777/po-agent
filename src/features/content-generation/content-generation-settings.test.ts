import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./content-generation-settings.tsx", import.meta.url)),
  "utf8",
);

describe("content generation settings", () => {
  it("manages only the RunningHub credential", () => {
    expect(source).toContain("loadRunningHubGenerationCredential");
    expect(source).toContain("saveRunningHubGenerationCredential");
    expect(source).toContain("deleteRunningHubGenerationCredential");
    expect(source).not.toContain("saveContentGenerationProvider");
    expect(source).not.toContain("saveContentGenerationApi");
  });

  it("shows application-managed routes as read-only status", () => {
    expect(source).toContain("loadGenerationRoutes");
    expect(source).toContain("groupRoutesByProduct(routes)");
    expect(source).toContain("group.routes.map((route)");
    expect(source).not.toContain("bodyTemplate");
    expect(source).not.toContain("providerOperation");
  });

  it("supports masking and removal of the stored key", () => {
    expect(source).toContain("<Input.Password");
    expect(source).toContain("visibilityToggle={{");
    expect(source).toContain("Eye");
    expect(source).toContain("EyeOff");
    expect(source).toContain("showApiKey");
    expect(source).toContain("removeCredentialConfirm");
    expect(source).not.toContain('className="absolute right-1');
    expect(source).not.toContain("<Alert className=\"mt-3\" message=");
  });

  it("returns to loading state whenever the persisted settings view mounts", () => {
    expect(source).toContain("beginSettingsLoad();");
    expect(source).toContain("loading || !settingsReady");
    expect(source).toContain("disabled={displayLoading || saving}");
  });
});
