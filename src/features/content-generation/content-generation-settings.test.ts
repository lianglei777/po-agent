import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./content-generation-settings.tsx", import.meta.url)),
  "utf8",
).replace(/\r\n/g, "\n");

describe("content generation settings", () => {
  it("renders credentials from trusted provider descriptors", () => {
    expect(source).toContain("loadGenerationProviders");
    expect(source).toContain("saveGenerationProviderCredential");
    expect(source).toContain("deleteGenerationProviderCredential");
    expect(source).toContain("providers.map((provider) => {");
    expect(source).not.toContain("RunningHub");
    expect(source).not.toContain("saveContentGenerationProvider");
    expect(source).not.toContain("saveContentGenerationApi");
  });

  it("keeps application-managed protocol details read-only", () => {
    expect(source).toContain("loadGenerationRoutes");
    expect(source).toContain("routes.filter((route) => route.providerId === provider.providerId)");
    expect(source).toContain("group.routes.map((route, routeIndex)");
    expect(source).not.toContain("bodyTemplate");
    expect(source).not.toContain("providerOperation");
    expect(source).toContain("makeDefaultRoute");
    expect(source).toContain("isDefault: true");
  });

  it("allows each API product category to expand and collapse", () => {
    expect(source).toContain("<Collapse");
    expect(source).toContain("routeGroups.map((group) => {");
    expect(source).toContain("defaultActiveKey={[group.product]}");
    expect(source).toContain('expandIconPlacement="end"');
    expect(source).toContain("labels.routeEnabledCount");
    expect(source).toContain("capabilityLabel(route.capability, labels)");
    expect(source).toContain("routeIndex === group.routes.length - 1");
    expect(source).toContain('<Layers className="size-3.5" />');
    expect(source).toContain(
      'className="overflow-hidden rounded-lg border border-line-subtle bg-panel"',
    );
  });

  it("shows route guidance directly while keeping default selection unobtrusive", () => {
    expect(source).toContain("{route.description}");
    expect(source).not.toContain("<details");
    expect(source).toContain("limit={route.tags.length}");
    expect(source).toContain("wrapLabels");
    expect(source).toContain("group-hover/api:opacity-100");
    expect(source).toContain("icon={<CheckCircle2");
    expect(source).not.toContain(">{labels.makeDefaultRoute}</Button>");
  });

  it("uses the available settings width without stretching credential controls", () => {
    expect(source).toContain('className="mx-auto max-w-5xl space-y-6"');
    expect(source).toContain('className="max-w-3xl space-y-3 border-b border-line-subtle p-4"');
    expect(source).toContain('<p className="mt-1 text-xs text-muted">{route.description}</p>');
    expect(source).not.toContain("max-w-2xl text-body-sm leading-5");
  });

  it("supports masking and removal of the stored key", () => {
    expect(source).toContain("<Input.Password");
    expect(source).toContain("visibilityToggle={{");
    expect(source).toContain("Eye");
    expect(source).toContain("EyeOff");
    expect(source).toContain("visibleApiKeys");
    expect(source).toContain("removeCredentialConfirm");
    expect(source).not.toContain('className="absolute right-1');
    expect(source).not.toContain('<Alert className="mt-3" message=');
  });

  it("returns to loading state whenever the persisted settings view mounts", () => {
    expect(source).toContain("beginSettingsLoad();");
    expect(source).toContain("loading || !settingsReady");
    expect(source).toContain("disabled={saving}");
  });

  it("shows global feedback after automatically persisted switches", () => {
    expect(source).toContain("App.useApp()");
    expect(source).toContain("message.success(t.common.settingsSaved)");
  });
});
