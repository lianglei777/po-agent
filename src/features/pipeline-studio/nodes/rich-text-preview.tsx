import { Fragment, createElement, type ReactNode } from "react";
import type { CanvasRichTextMark, CanvasRichTextNode, CanvasTextDocument } from "@/contracts/pipeline";

export function RichTextPreview({
  document,
  emptyHint,
}: {
  document: CanvasTextDocument;
  emptyHint: string;
}) {
  if (!document.plainText.trim()) {
    return <div className="pipeline-rich-text-empty">{emptyHint}</div>;
  }

  return <div className="pipeline-rich-text-content">{renderNode(document.content, "root")}</div>;
}

function renderNode(node: CanvasRichTextNode, key: string): ReactNode {
  const children = node.content?.map((child, index) => renderNode(child, `${key}-${index}`));

  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{children}</Fragment>;
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading": {
      const level = node.attrs?.level;
      const tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      return createElement(tag, { key }, children);
    }
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={typeof node.attrs?.start === "number" ? node.attrs.start : undefined}>
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "hardBreak":
      return <br key={key} />;
    case "text":
      return <Fragment key={key}>{applyMarks(node.text ?? "", node.marks)}</Fragment>;
  }
}

function applyMarks(text: ReactNode, marks: CanvasRichTextMark[] | undefined): ReactNode {
  return marks?.reduce<ReactNode>((content, mark) => {
    if (mark.type === "bold") return <strong>{content}</strong>;
    if (mark.type === "italic") return <em>{content}</em>;
    if (mark.type === "underline") return <u>{content}</u>;
    return content;
  }, text) ?? text;
}
