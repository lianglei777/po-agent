import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const css = read("src/app/globals.css");

describe("Ant Design visual foundation", () => {
  test("uses the Ant Design v6 default light palette", () => {
    expect(css).toContain("--workspace-bg: #f5f5f5");
    expect(css).toContain("--bg-subtle: #fafafa");
    expect(css).toContain("--bg-selected: #e6f4ff");
    expect(css).toContain("--text: #1f1f1f");
    expect(css).toContain("--text-muted: #595959");
    expect(css).toContain("--border-subtle: #f0f0f0");
    expect(css).toContain("--border-strong: #d9d9d9");
    expect(css).toContain("--accent: #1677ff");
    expect(css).toContain("--accent-deep: #0958d9");
    expect(css).toContain("--destructive: #ff4d4f");
    expect(css).toContain("--success: #52c41a");
    expect(css).toContain("color-scheme: light");
  });

  test("installs the Ant Design SSR and runtime providers", () => {
    expect(read("src/app/layout.tsx")).toContain("AntdRegistry");
    expect(read("src/app/page.tsx")).toContain("AntDesignProvider");
    const provider = read("src/components/providers/ant-design-provider.tsx");
    expect(provider).toContain("ConfigProvider");
    expect(provider).toContain('componentSize="middle"');
    expect(provider).toContain("zhCN");
    expect(provider).toContain("enUS");
    expect(provider).toContain("<App>");
  });

  test("uses system typography and supports reduced motion", () => {
    expect(read("src/app/layout.tsx")).toContain("Noto_Sans_Mono");
    expect(css).toContain("-apple-system, BlinkMacSystemFont");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms");
  });

  test("keeps unsized Ant icons visible", () => {
    const iconRule = css.slice(
      css.indexOf(".anticon > svg"),
      css.indexOf("html {", css.indexOf(".anticon > svg")),
    );
    expect(iconRule).toContain("width: 1em");
    expect(iconRule).toContain("height: 1em");
    expect(iconRule).not.toContain("width: 100%");
  });

  test("keeps the desktop workspace and chat composition invariants", () => {
    expect(css).toContain("min-width: 1024px");
    expect(css).toContain("overflow-x: auto");
    expect(read("src/features/chat/chat-input.tsx")).toContain("rounded-composer");
    expect(read("src/layouts/agent-workspace/workspace-top-bar.tsx")).not.toContain("backdrop-blur");
  });
});
