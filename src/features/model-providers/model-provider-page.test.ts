import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(
    new URL("./model-provider-page.tsx", import.meta.url),
  ),
  "utf8",
);
const sidebarSource = readFileSync(
  fileURLToPath(
    new URL("./sidebar/model-provider-sidebar.tsx", import.meta.url),
  ),
  "utf8",
);
const controllerSource = readFileSync(
  fileURLToPath(new URL("./use-model-providers.ts", import.meta.url)),
  "utf8",
);
const enSource = readFileSync(
  fileURLToPath(new URL("../../i18n/dictionaries/en.ts", import.meta.url)),
  "utf8",
);
const zhSource = readFileSync(
  fileURLToPath(new URL("../../i18n/dictionaries/zh.ts", import.meta.url)),
  "utf8",
);

describe("Model Provider page", () => {
  it("reuses model configuration behavior without a top-level modal", () => {
    expect(source).toContain("useModelProviders");
    expect(source).toContain("ModelProviderSidebar");
    expect(source).toContain("onDirtyChange");
    expect(source).not.toContain("ModalOverlay");
    expect(source).not.toContain("<Dialog open");
  });

  it("auto-saves changes and keeps accessible feedback", () => {
    expect(source).not.toContain("onClick={modelConfig.save}");
    expect(source).not.toContain("<footer");
    expect(source).not.toContain('data-testid="model-provider-save-status"');
    expect(source).not.toContain("sticky top-0");
    expect(source).toContain("onSaveStatusChange");
    expect(source).toContain('phase: "pending"');
    expect(source).toContain('phase: "error"');
    expect(source).toContain("modelConfig.saving");
    expect(source).toContain("modelConfig.savedOk");
    expect(source).toContain("modelConfig.saveRetryAvailable");
    expect(controllerSource).toContain("createDebouncedSaveQueue");
    expect(controllerSource).toContain("AUTO_SAVE_DELAY_MS");
    expect(controllerSource).toContain("failedToSaveRef.current");
    expect(controllerSource).not.toContain("}, [t.models.failedToSave]);");
  });

  it("ignores stale model discovery responses", () => {
    expect(controllerSource).toContain("discoveryRevisionRef");
    expect(controllerSource).toContain(
      "revision !== discoveryRevisionRef.current",
    );
  });

  it("keeps nested detail components", () => {
    expect(source).toContain("ProviderDetail");
    expect(source).toContain("ModelDetail");
    expect(source).toContain("OAuthDetail");
    expect(source).toContain("ApiKeyDetail");
  });

  it("warns that confirmed deletion cannot be undone", () => {
    expect(enSource).toContain("This action cannot be undone");
    expect(zhSource).toContain("此操作无法撤销");
  });

  it("does not expose manual model creation", () => {
    expect(source).not.toContain("onAddModel");
    expect(sidebarSource).not.toContain("onAddModel");
    expect(controllerSource).not.toMatch(/\baddModel\b/);
  });

  it("uses a Codex-style settings rail and centered content column", () => {
    expect(source).toContain('className="min-w-0 flex-1 overflow-y-auto px-6 py-6"');
    expect(sidebarSource).toContain('w-[224px]');
    expect(sidebarSource).toContain('border-line-subtle');
    expect(sidebarSource).not.toContain('bg-panel');
  });
});
