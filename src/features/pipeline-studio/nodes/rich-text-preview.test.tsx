import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichTextPreview } from "./rich-text-preview";

describe("RichTextPreview", () => {
  it("renders supported structure and marks without interpreting text as HTML", () => {
    const markup = renderToStaticMarkup(
      <RichTextPreview
        emptyHint="empty"
        document={{
          schemaVersion: 1,
          format: "tiptap-json",
          plainText: "Title\n<script>alert(1)</script>",
          content: {
            type: "doc",
            content: [
              {
                type: "heading",
                attrs: { level: 2 },
                content: [{ type: "text", text: "Title", marks: [{ type: "bold" }] }],
              },
              {
                type: "bulletList",
                content: [{
                  type: "listItem",
                  content: [{
                    type: "paragraph",
                    content: [{ type: "text", text: "<script>alert(1)</script>" }],
                  }],
                }],
              },
            ],
          },
        }}
      />,
    );

    expect(markup).toContain("<h2><strong>Title</strong></h2>");
    expect(markup).toContain("<ul><li><p>&lt;script&gt;alert(1)&lt;/script&gt;</p></li></ul>");
    expect(markup).not.toContain("<script>");
  });

  it("renders the empty hint when the document has no visible text", () => {
    const markup = renderToStaticMarkup(
      <RichTextPreview
        emptyHint="Double-click to edit"
        document={{
          schemaVersion: 1,
          format: "tiptap-json",
          plainText: "",
          content: { type: "doc", content: [{ type: "paragraph" }] },
        }}
      />,
    );

    expect(markup).toContain("Double-click to edit");
  });
});
