import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownDocument } from "./markdown-document";

describe("MarkdownDocument", () => {
  it("renders headings, tables, code blocks, and document line breaks", () => {
    const html = renderToStaticMarkup(createElement(MarkdownDocument, {
      markdown: '# API\n\n| Name | Value |\n| --- | --- |\n| prompt | Text<br>Required |\n\n```json\n{"ok":true}\n```',
    }));

    expect(html).toContain("<h1");
    expect(html).toContain("<table");
    expect(html).toContain("Text · Required");
    expect(html).toContain("language-json");
  });
});
