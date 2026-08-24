import { describe, expect, it } from "vitest";
import { resolveCanvasMediaSource, shouldDeferCanvasMediaLoad } from "./canvas-media-source";

describe("resolveCanvasMediaSource", () => {
  it("uses the workspace file identity as the local media version", () => {
    expect(resolveCanvasMediaSource("node-1", {
      type: "image",
      name: "Reference",
      action: "image_generate",
      workspaceFile: {
        relativePath: "assets/imports/asset-a.png",
        contentType: "image/png",
        name: "asset-a.png",
      },
    })).toEqual({
      assetKey: "workspace:assets/imports/asset-a.png",
      kind: "local",
      url: "/api/pipeline/canvas-nodes/node-1/media?v=workspace%3Aassets%2Fimports%2Fasset-a.png",
    });
  });

  it("changes the media version only when the backing asset changes", () => {
    const first = resolveCanvasMediaSource("node-1", {
      type: "image",
      name: "Reference",
      action: "image_generate",
      artifactIds: ["artifact-a"],
    });
    const replacement = resolveCanvasMediaSource("node-1", {
      type: "image",
      name: "Reference",
      action: "image_generate",
      artifactIds: ["artifact-b"],
    });

    expect(first?.url).toContain("artifact%3Aartifact-a");
    expect(replacement?.url).toContain("artifact%3Aartifact-b");
    expect(first).not.toEqual(replacement);
  });

  it("does not request an unfinished generation run as readable media", () => {
    expect(resolveCanvasMediaSource("node-1", {
      type: "image",
      name: "Generating",
      action: "image_generate",
      taskInfo: { runId: "run-1", status: "processing" },
    })).toBeNull();
  });

  it("keeps external URLs unchanged", () => {
    expect(resolveCanvasMediaSource("node-1", {
      type: "image",
      name: "Remote",
      action: "image_generate",
      url: ["https://example.com/image.png"],
    })).toEqual({
      assetKey: "url:https://example.com/image.png",
      kind: "external",
      url: "https://example.com/image.png",
    });
  });

  it("defers only node-addressed local media while an optimistic copy is being created", () => {
    const local = resolveCanvasMediaSource("copy-1", {
      type: "image",
      name: "Copy",
      action: "image_generate",
      artifactIds: ["artifact-a"],
    });
    const external = resolveCanvasMediaSource("copy-2", {
      type: "image",
      name: "Remote copy",
      action: "image_generate",
      url: ["https://example.com/image.png"],
    });

    expect(shouldDeferCanvasMediaLoad(local, true)).toBe(true);
    expect(shouldDeferCanvasMediaLoad(local, false)).toBe(false);
    expect(shouldDeferCanvasMediaLoad(external, true)).toBe(false);
  });
});
