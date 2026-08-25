import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CanvasNodeTitle } from "./canvas-node-title";

describe("CanvasNodeTitle", () => {
  it("keeps the resting title inside the node drag handle", () => {
    const markup = renderToStaticMarkup(createElement(CanvasNodeTitle, {
      icon: createElement("span", null, "icon"),
      name: "Video 1",
      ariaLabel: "Rename video node",
      onRename: () => undefined,
    }));

    expect(markup).toContain("pipeline-node-drag-handle");
    expect(markup).toContain("cursor-grab");
    expect(markup).not.toContain("nodrag");
  });
});
