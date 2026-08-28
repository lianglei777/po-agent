import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
}

const settingsSource = source("./content-generation-settings.tsx");
const navigatorSource = source("./content-generation-navigator.tsx");
const providerSource = source("./content-generation-provider-detail.tsx");
const routeSource = source("./content-generation-route-detail.tsx");

describe("content generation settings", () => {
  it("uses a resource navigator and a focused detail surface", () => {
    expect(settingsSource).toContain("<ContentGenerationNavigator");
    expect(settingsSource).toContain("<ContentGenerationProviderDetail");
    expect(settingsSource).toContain("<ContentGenerationRouteDetail");
    expect(settingsSource).toContain("<ResizeHandle");
    expect(settingsSource).toContain("NAVIGATOR_WIDTH_STORAGE_KEY");
    expect(settingsSource).toContain('<main className="min-w-0 flex-1 overflow-y-auto">');
    expect(settingsSource).not.toContain("providers.map((provider) => {");
    expect(settingsSource).not.toContain("<Collapse");
  });

  it("groups provider, product and route nodes without adding search", () => {
    expect(navigatorSource).toContain("groupGenerationRoutesByProduct");
    expect(navigatorSource).toContain("SettingsResourceTree");
    expect(navigatorSource).toContain("product:${provider.providerId}:${group.product}");
    expect(navigatorSource).toContain("route:${route.id}");
    expect(navigatorSource).toContain("route.navigationLabel ?? route.capability");
    expect(navigatorSource).toContain("initialCollapsedKeys={nodes.flatMap");
    expect(navigatorSource).not.toContain("Search");
  });

  it("preserves trusted provider credentials and explicit destructive confirmation", () => {
    expect(settingsSource).toContain("loadGenerationProviders");
    expect(settingsSource).toContain("saveGenerationProviderCredential");
    expect(settingsSource).toContain("deleteGenerationProviderCredential");
    expect(settingsSource).toContain("modal.confirm");
    expect(providerSource).toContain("<Input.Password");
    expect(providerSource).toContain('<SettingsRow\n            compact\n            description=');
    expect(providerSource).toContain("visibilityToggle={{");
    expect(providerSource).toContain("provider.credential.location");
    expect(providerSource).toContain("onCopyCredentialLocation");
    expect(providerSource).toContain("flex-1 truncate font-ui-mono");
    expect(providerSource).not.toContain("break-all font-ui-mono");
    expect(providerSource).toContain("removeCredential");
    expect(settingsSource).not.toContain("saveContentGenerationProvider");
  });

  it("keeps route protocol details read-only while exposing supported inputs", () => {
    expect(routeSource).toContain("route.inputSchema.prompt");
    expect(routeSource).toContain("route.inputSchema.assets");
    expect(routeSource).toContain("route.inputSchema.parameters");
    expect(routeSource).toContain("catalogRevision");
    expect(routeSource).not.toContain("bodyTemplate");
    expect(routeSource).not.toContain("providerOperation");
  });

  it("keeps provider, route, and capability-default mutations explicit", () => {
    expect(settingsSource).toContain("updateGenerationProviderSettings");
    expect(settingsSource).toContain("updateGenerationRoute(routeId, { enabled })");
    expect(settingsSource).toContain("updateGenerationRoute(routeId, { isDefault: true })");
    expect(routeSource).toContain("makeDefaultForCapability");
    expect(routeSource).toContain("enableProviderFirst");
  });

  it("preserves credential drafts while navigating between resources", () => {
    expect(settingsSource).toContain("credentialDraftProviderIds");
    expect(settingsSource).toContain("new Set(Object.entries(apiKeys)");
    expect(navigatorSource).toContain("unsavedCredential");
    expect(settingsSource).toContain("onDirtyChange?.(Object.values(apiKeys)");
  });
});
