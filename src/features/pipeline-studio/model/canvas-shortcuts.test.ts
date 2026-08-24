import { describe, expect, it } from "vitest";
import { CANVAS_SHORTCUT_GROUPS, isPlainCanvasShortcut } from "./canvas-shortcuts";

describe("pipeline studio canvas shortcuts", () => {
  it("keeps the shortcut panel limited to implemented actions", () => {
    expect(CANVAS_SHORTCUT_GROUPS.map((group) => group.shortcuts.map((shortcut) => shortcut.id))).toEqual([
      ["undo", "redo", "copy", "paste", "duplicate", "delete"],
      ["selectTool", "panTool", "fitCanvas", "temporaryPan"],
      ["multiSelect", "boxSelect", "clearSelection"],
    ]);
  });

  it("does not treat modified key presses as single-key canvas shortcuts", () => {
    const event = { altKey: false, ctrlKey: false, key: "F", metaKey: false, shiftKey: false };
    expect(isPlainCanvasShortcut(event, "f")).toBe(true);
    expect(isPlainCanvasShortcut({ ...event, ctrlKey: true }, "f")).toBe(false);
    expect(isPlainCanvasShortcut({ ...event, metaKey: true }, "f")).toBe(false);
    expect(isPlainCanvasShortcut({ ...event, altKey: true }, "f")).toBe(false);
    expect(isPlainCanvasShortcut({ ...event, shiftKey: true }, "f")).toBe(false);
  });
});
