import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Check } from "./icons";

describe("shared icons", () => {
  test("applies the product icon defaults", () => {
    const markup = renderToStaticMarkup(
      createElement(Check, { "aria-label": "complete" }),
    );

    expect(markup).toContain('width="1em"');
    expect(markup).toContain('height="1em"');
    expect(markup).toContain('stroke-width="1.75"');
    expect(markup).toContain('aria-label="complete"');
  });

  test("allows feature-specific size and stroke overrides", () => {
    const markup = renderToStaticMarkup(
      createElement(Check, { size: 20, strokeWidth: 2 }),
    );

    expect(markup).toContain('width="20"');
    expect(markup).toContain('height="20"');
    expect(markup).toContain('stroke-width="2"');
  });
});
