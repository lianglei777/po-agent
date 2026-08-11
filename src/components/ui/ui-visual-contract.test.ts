import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const readUi = (name: string) =>
  readFileSync(`${root}/src/components/ui/${name}.tsx`, "utf8");
const readSource = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("Ant Design shared UI contract", () => {
  test("keeps only compatibility components with product invariants", () => {
    expect(readUi("dialog")).toContain('from "antd"');
    expect(readUi("textarea")).toContain("Input.TextArea");
    expect(readUi("scroll-area")).toContain('from "@radix-ui/react-scroll-area"');
    expect(readUi("resize-handle")).toContain('role="separator"');
  });

  test("preserves the deliberate dialog dismissal policy", () => {
    const dialog = readUi("dialog");

    expect(dialog).toContain("keyboard={false}");
    expect(dialog).toContain("mask={{ closable: false }}");
    expect(dialog).toContain('"aria-label": closeLabel');
    expect(dialog).toContain("onCancel={() => setOpen(false)}");
  });

  test("preserves native input refs needed by focus and selection workflows", () => {
    const textarea = readUi("textarea");

    expect(textarea).toContain("HTMLTextAreaElement");
    expect(textarea).toContain("resizableTextArea?.textArea");
  });

  test("keeps domain-only resize behavior custom and keyboard accessible", () => {
    const resizeHandle = readUi("resize-handle");

    expect(resizeHandle).toContain('role="separator"');
    expect(resizeHandle).toContain("ArrowLeft");
    expect(resizeHandle).toContain("ArrowRight");
    expect(resizeHandle).toContain("focus-visible:ring-2");
  });

  test("uses Ant icons and retains only the justified Radix scroll primitive", () => {
    const icons = readSource("src/components/icons.ts");
    const packageJson = readSource("package.json");

    expect(icons).toContain('from "@ant-design/icons"');
    expect(packageJson).toContain('"@radix-ui/react-scroll-area"');
    expect(packageJson).not.toContain('"lucide-react"');
    expect(packageJson).not.toContain('"radix-ui"');
    expect(packageJson).not.toContain('"shadcn"');
  });
});
