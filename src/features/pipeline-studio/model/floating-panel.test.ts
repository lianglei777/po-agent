import { describe, expect, it } from "vitest";
import { resourcePickerPosition } from "./floating-panel";

describe("resourcePickerPosition", () => {
  it("opens above the caret when enough viewport space is available", () => {
    expect(resourcePickerPosition({
      cursor: { left: 520, top: 500, bottom: 520 },
      viewportWidth: 1200,
      viewportHeight: 800,
      panelWidth: 288,
      panelHeight: 240,
    })).toEqual({ left: 520, top: 252, placement: "top" });
  });

  it("falls back below and keeps the panel inside the viewport", () => {
    expect(resourcePickerPosition({
      cursor: { left: 980, top: 80, bottom: 100 },
      viewportWidth: 1024,
      viewportHeight: 500,
      panelWidth: 288,
      panelHeight: 240,
    })).toEqual({ left: 726, top: 108, placement: "bottom" });
  });
});
