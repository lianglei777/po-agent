import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const videoNodeSource = readFileSync(fileURLToPath(new URL("./video-canvas-node.tsx", import.meta.url)), "utf8");
const textNodeSource = readFileSync(fileURLToPath(new URL("./text-canvas-node.tsx", import.meta.url)), "utf8");
const textEditorSource = readFileSync(fileURLToPath(new URL("./text-node-editor.tsx", import.meta.url)), "utf8");

describe("canvas preview interactions", () => {
  it("keeps native video double click inside the canvas and focuses the node", () => {
    expect(videoNodeSource).toContain("calculateImageFocusViewport");
    expect(videoNodeSource).toContain("const handlePreviewDoubleClick");
    expect(videoNodeSource).toContain("event.preventDefault();");
    expect(videoNodeSource).toContain("event.stopPropagation();");
    expect(videoNodeSource).toMatch(/<video[\s\S]*?onDoubleClick=\{handlePreviewDoubleClick\}/);
  });

  it("offers full-screen text editing without creating a competing inline editor", () => {
    expect(textNodeSource).toContain("editing && textDocument && !fullscreenOpen");
    expect(textNodeSource).toContain("<Modal");
    expect(textNodeSource).toContain("fullscreen");
    expect(textNodeSource).toContain("exitOnEscape={false}");
    expect(textNodeSource).toContain("exitOnBlur={false}");
    expect(textNodeSource).toContain("keyboard={false}");
    expect(textNodeSource).toContain("mask={{ closable: false }}");
    expect(textEditorSource).toContain("Maximize2");
    expect(textEditorSource).toContain("Minimize2");
    expect(textEditorSource).toContain("onToggleFullscreen");
  });
});
