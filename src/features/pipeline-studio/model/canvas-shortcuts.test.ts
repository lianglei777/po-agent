import { describe, expect, it } from "vitest";
import {
  CANVAS_SHORTCUT_GROUPS,
  getCanvasZoomShortcut,
  isPlainCanvasShortcut,
  resolveCanvasDeleteSelection,
} from "./canvas-shortcuts";

describe("pipeline studio canvas shortcuts", () => {
  it("keeps the shortcut panel limited to implemented actions", () => {
    expect(CANVAS_SHORTCUT_GROUPS.map((group) => group.shortcuts.map((shortcut) => shortcut.id))).toEqual([
      ["undo", "redo", "copy", "paste", "duplicate", "delete"],
      ["selectTool", "panTool", "fitCanvas", "zoomIn", "zoomOut", "temporaryPan"],
      ["multiSelect", "boxSelect", "clearSelection"],
    ]);
  });

  it("recognizes canvas zoom shortcuts across main and numeric keyboards", () => {
    const base = { altKey: false, ctrlKey: false, key: "+", metaKey: true, shiftKey: true };
    expect(getCanvasZoomShortcut({ ...base, code: "Equal" })).toBe("in");
    expect(getCanvasZoomShortcut({ ...base, code: "Equal", key: "=" , shiftKey: false })).toBe("in");
    expect(getCanvasZoomShortcut({ ...base, code: "NumpadAdd", ctrlKey: true, metaKey: false, shiftKey: false })).toBe("in");
    expect(getCanvasZoomShortcut({ ...base, code: "Minus", key: "-", shiftKey: false })).toBe("out");
    expect(getCanvasZoomShortcut({ ...base, code: "NumpadSubtract", ctrlKey: true, key: "-", metaKey: false, shiftKey: false })).toBe("out");
  });

  it("leaves unrelated or Alt-modified shortcuts to the host application", () => {
    const base = { altKey: false, code: "Equal", ctrlKey: false, key: "+", metaKey: false, shiftKey: true };
    expect(getCanvasZoomShortcut(base)).toBeNull();
    expect(getCanvasZoomShortcut({ ...base, ctrlKey: true, altKey: true })).toBeNull();
    expect(getCanvasZoomShortcut({ ...base, ctrlKey: true, code: "Minus", key: "_" })).toBeNull();
  });

  it("does not treat modified key presses as single-key canvas shortcuts", () => {
    const event = { altKey: false, ctrlKey: false, key: "F", metaKey: false, shiftKey: false };
    expect(isPlainCanvasShortcut(event, "f")).toBe(true);
    expect(isPlainCanvasShortcut({ ...event, ctrlKey: true }, "f")).toBe(false);
    expect(isPlainCanvasShortcut({ ...event, metaKey: true }, "f")).toBe(false);
    expect(isPlainCanvasShortcut({ ...event, altKey: true }, "f")).toBe(false);
    expect(isPlainCanvasShortcut({ ...event, shiftKey: true }, "f")).toBe(false);
  });

  it("deletes selected nodes before any stale edge selection", () => {
    expect(resolveCanvasDeleteSelection(["node-1", "node-2"], "edge-1")).toEqual({
      kind: "nodes",
      nodeIds: ["node-1", "node-2"],
    });
    expect(resolveCanvasDeleteSelection([], "edge-1")).toEqual({ kind: "edge", edgeId: "edge-1" });
    expect(resolveCanvasDeleteSelection([], null)).toBeNull();
  });
});
