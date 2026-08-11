import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );
}

const modelSource = readSource("./model-detail.tsx");
const providerSource = readSource("./provider-detail.tsx");
const apiKeySource = readSource("./api-key-detail.tsx");
const oauthSource = readSource("./oauth-detail.tsx");
const compatSource = readSource("./compat-editor.tsx");

describe("model provider detail layout", () => {
  it("keeps compatibility as the last information item", () => {
    expect(providerSource.indexOf("<CompatEditor")).toBeGreaterThan(
      providerSource.indexOf("<ModelDiscoveryPanel"),
    );
    expect(modelSource.lastIndexOf("<CompatEditor")).toBeGreaterThan(
      modelSource.indexOf("thinkingOnDefault"),
    );
  });

  it("does not render supported or unsupported status copy in capabilities", () => {
    expect(modelSource).not.toContain("t.models.supported");
    expect(modelSource).not.toContain("t.models.unsupported");
  });

  it("uses Ant Design controls directly across provider settings", () => {
    for (const source of [
      modelSource,
      providerSource,
      apiKeySource,
      oauthSource,
      compatSource,
    ]) {
      expect(source).toContain('from "antd"');
      expect(source).not.toMatch(/@\/components\/ui\/(button|input|textarea|switch|checkbox)/);
    }
    expect(providerSource).toContain(
      "Alert, Button, Checkbox, Empty, Input, Select",
    );
    expect(providerSource).toContain("<Input.Password");
    expect(providerSource).toContain("visibilityToggle={{");
    expect(providerSource).not.toContain("absolute top-1/2 right-[5px]");
    expect(providerSource).not.toContain("function EyeIcon");
    expect(apiKeySource).toContain("<Input.Password");
    expect(apiKeySource).toContain("visibilityToggle={{");
    expect(apiKeySource).not.toContain("absolute top-1/2 right-[5px]");
    expect(apiKeySource).not.toContain("function EyeIcon");
    expect(modelSource).toContain("Alert, Button, Input, Select, Switch, Tag, Tooltip");
    expect(compatSource).toContain("<Input.TextArea");
    expect(compatSource).toContain("<Typography.Text");
    expect(oauthSource).toContain("<Alert");
    expect(oauthSource).toContain("<Spin");
    expect(modelSource).not.toContain("<Alert message=");
    expect(providerSource).not.toContain("<Alert message=");
    expect(apiKeySource).not.toContain("<Alert message=");
    expect(oauthSource).not.toContain("<Alert message=");
  });
});
