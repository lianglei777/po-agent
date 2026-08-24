export const CANVAS_SHORTCUT_GROUPS = [
  {
    id: "editing",
    shortcuts: [
      { id: "undo", sequences: [["Mod", "Z"]] },
      { id: "redo", sequences: [["Mod", "Shift", "Z"]] },
      { id: "copy", sequences: [["Mod", "C"]] },
      { id: "paste", sequences: [["Mod", "V"]] },
      { id: "duplicate", sequences: [["Mod", "D"]] },
      { id: "delete", sequences: [["Delete"], ["Backspace"]] },
    ],
  },
  {
    id: "tools",
    shortcuts: [
      { id: "selectTool", sequences: [["V"]] },
      { id: "panTool", sequences: [["H"]] },
      { id: "fitCanvas", sequences: [["F"]] },
      { id: "temporaryPan", sequences: [["Space", "Drag"]] },
    ],
  },
  {
    id: "selection",
    shortcuts: [
      { id: "multiSelect", sequences: [["Mod", "Click"]] },
      { id: "boxSelect", sequences: [["Drag"]] },
      { id: "clearSelection", sequences: [["Escape"]] },
    ],
  },
] as const;

export type CanvasShortcutGroupId = (typeof CANVAS_SHORTCUT_GROUPS)[number]["id"];
export type CanvasShortcutId = (typeof CANVAS_SHORTCUT_GROUPS)[number]["shortcuts"][number]["id"];

export function isPlainCanvasShortcut(
  event: Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey">,
  key: string,
) {
  return !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && event.key.toLowerCase() === key.toLowerCase();
}
