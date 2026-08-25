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
      { id: "zoomIn", sequences: [["Mod", "+"]] },
      { id: "zoomOut", sequences: [["Mod", "-"]] },
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
export type CanvasZoomShortcut = "in" | "out";
export type CanvasDeleteSelection =
  | { kind: "nodes"; nodeIds: string[] }
  | { kind: "edge"; edgeId: string }
  | null;

export function resolveCanvasDeleteSelection(
  selectedNodeIds: string[],
  selectedEdgeId: string | null,
): CanvasDeleteSelection {
  // 节点选择代表更高层级的批量操作；删除节点时其关联边会由画布仓储一并清理。
  if (selectedNodeIds.length) return { kind: "nodes", nodeIds: selectedNodeIds };
  if (selectedEdgeId) return { kind: "edge", edgeId: selectedEdgeId };
  return null;
}

export function getCanvasZoomShortcut(
  event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "key" | "metaKey" | "shiftKey">,
): CanvasZoomShortcut | null {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) return null;

  // 同时识别字符和物理键位，兼容 Shift+=、Cmd/Ctrl+= 与数字键盘。
  if (event.key === "+" || event.key === "=" || event.code === "Equal" || event.code === "NumpadAdd") {
    return "in";
  }
  if (!event.shiftKey && (event.key === "-" || event.code === "Minus" || event.code === "NumpadSubtract")) {
    return "out";
  }
  return null;
}

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
