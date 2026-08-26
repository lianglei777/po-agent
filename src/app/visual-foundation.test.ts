import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");
const css = read("src/app/globals.css");

describe("Ant Design visual foundation", () => {
  test("uses one restrained dark palette across both workspaces", () => {
    expect(css).toContain("--workspace-bg: #0d0f12");
    expect(css).toContain("--bg: #111317");
    expect(css).toContain("--bg-panel: #15181c");
    expect(css).toContain("--bg-elevated: #1b1f24");
    expect(css).toContain("--text: #f2f4f7");
    expect(css).toContain("--text-muted: #a8b0ba");
    expect(css).toContain("--border-subtle: #252a31");
    expect(css).toContain("--border-strong: #343c46");
    expect(css).toContain("--accent: #1668dc");
    expect(css).toContain("--destructive: #ff7875");
    expect(css).toContain("--success: #49c98f");
    expect(css).toContain("--pl-surface: var(--bg)");
    expect(css).toContain("--pl-danger: var(--destructive-text)");
    expect(css).toContain("color-scheme: dark");
  });

  test("installs the Ant Design SSR and runtime providers", () => {
    expect(read("src/app/layout.tsx")).toContain("AntdRegistry");
    expect(read("src/app/page.tsx")).toContain("AntDesignProvider");
    const provider = read("src/components/providers/ant-design-provider.tsx");
    expect(provider).toContain("ConfigProvider");
    expect(provider).toContain("antdTheme.darkAlgorithm");
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

  test("aligns font tokens with the Ant Design v6 typography scale", () => {
    expect(css).toContain("--fs-caption: 12px");
    expect(css).toContain("--fs-meta: 13px");
    expect(css).toContain("--fs-xs: 13px");
    expect(css).toContain("--fs-sm: 14px");
    expect(css).toContain("--fs-body-sm: 14px");
    expect(css).toContain("--fs-prose: 16px");
    expect(css).toContain("--fs-base: 16px");
    expect(css).toContain("--fs-lg: 20px");
    // @theme inline 全部引用变量，不使用硬编码值
    expect(css).toContain("--text-xs: var(--fs-xs)");
    expect(css).toContain("--text-sm: var(--fs-sm)");
    expect(css).toContain("--text-base: var(--fs-base)");
    expect(css).toContain("--text-lg: var(--fs-lg)");
    // body 字号引用变量
    expect(css).toContain("font-size: var(--fs-sm)");
    // Ant Design ConfigProvider 设置了字体 token
    const provider = read("src/components/providers/ant-design-provider.tsx");
    expect(provider).toContain("fontSize: 14");
    expect(provider).toContain("fontSizeSM: 12");
    expect(provider).toContain("fontSizeLG: 16");
    expect(provider).toContain("fontWeightStrong: 600");
  });

  test("keeps Ant component internal icons visible", () => {
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
