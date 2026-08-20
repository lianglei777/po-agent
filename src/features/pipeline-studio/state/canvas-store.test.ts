import { describe, expect, it, vi } from "vitest";
import { createCanvasStore } from "./canvas-store";

describe("pipeline studio canvas store", () => {
  it("creates nodes and supports undo and redo", () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValueOnce("node-1").mockReturnValueOnce("entity-1") });
    const store = createCanvasStore("project-1");
    store.getState().hydrate({ revision: 0, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().createNode("text", { x: 10, y: 20 }, "Text");
    expect(store.getState().nodes).toHaveLength(1);
    expect(store.getState().pendingMutations[0]?.type).toBe("node.create");

    store.getState().undo();
    expect(store.getState().nodes).toEqual([]);

    store.getState().redo();
    expect(store.getState().nodes.map((node) => node.id)).toEqual(["node-1"]);
    vi.unstubAllGlobals();
  });

  it("keeps only the latest viewport mutation", () => {
    const store = createCanvasStore("project-1");
    store.getState().hydrate({ revision: 0, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    store.getState().setViewport({ x: 1, y: 2, zoom: 0.8 }, true);
    store.getState().setViewport({ x: 4, y: 5, zoom: 1.2 }, true);

    expect(store.getState().pendingMutations).toEqual([
      { type: "viewport.update", viewport: { x: 4, y: 5, zoom: 1.2 } },
    ]);
  });

  it("keeps text editing state local to the selected node", () => {
    const store = createCanvasStore("project-1");
    store.getState().hydrate({ revision: 0, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().startEditingNode("node-1");
    expect(store.getState().editingNodeId).toBe("node-1");
    expect(store.getState().selectedNodeIds).toEqual(["node-1"]);

    store.getState().setSelection(["node-1"]);
    expect(store.getState().editingNodeId).toBe("node-1");

    store.getState().setSelection(["node-2"]);
    expect(store.getState().editingNodeId).toBeNull();

    store.getState().startEditingNode("node-2");
    store.getState().setSelection([]);
    expect(store.getState().selectedNodeIds).toEqual([]);
    expect(store.getState().editingNodeId).toBeNull();
  });

  it("updates node size live and records one mutation only after resize ends", () => {
    const store = createCanvasStore("project-1");
    const node = {
      id: "node-1",
      projectId: "project-1",
      type: "text" as const,
      entityId: "entity-1",
      positionX: 10,
      positionY: 20,
      width: 320,
      height: 220,
      data: { type: "text" as const, name: "Text", action: "text_generate", content: [""] },
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };
    store.getState().hydrate({ revision: 1, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().updateNodeSizeLive("node-1", { width: 420, height: 300 });
    expect(store.getState().nodes[0]).toMatchObject({ width: 420, height: 300 });
    expect(store.getState().pendingMutations).toEqual([]);
    expect(store.getState().past).toEqual([]);

    store.getState().commitNodeSize("node-1", { width: 320, height: 220 });
    expect(store.getState().pendingMutations).toEqual([
      { type: "node.update", nodeId: "node-1", patch: { width: 420, height: 300 } },
    ]);
    expect(store.getState().past).toHaveLength(1);
    expect(store.getState().past[0]?.nodes[0]).toMatchObject({ width: 320, height: 220 });

    store.getState().undo();
    expect(store.getState().nodes[0]).toMatchObject({ width: 320, height: 220 });
  });

  it("does not record a resize when the node returns to its original size", () => {
    const store = createCanvasStore("project-1");
    const node = {
      id: "node-1",
      projectId: "project-1",
      type: "text" as const,
      entityId: "entity-1",
      positionX: 0,
      positionY: 0,
      width: 320,
      height: 220,
      data: { type: "text" as const, name: "Text", action: "text_generate", content: [""] },
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };
    store.getState().hydrate({ revision: 1, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().updateNodeSizeLive("node-1", { width: 400, height: 280 });
    store.getState().updateNodeSizeLive("node-1", { width: 320, height: 220 });
    store.getState().commitNodeSize("node-1", { width: 320, height: 220 });

    expect(store.getState().pendingMutations).toEqual([]);
    expect(store.getState().past).toEqual([]);
  });

  it("applies AI text returned by the server without letting an older data mutation overwrite it", () => {
    const store = createCanvasStore("project-1");
    const node = {
      id: "node-1",
      projectId: "project-1",
      type: "text" as const,
      entityId: "entity-1",
      positionX: 10,
      positionY: 20,
      width: 320,
      height: 220,
      data: { type: "text" as const, name: "Text", action: "text_generate", content: ["Old"], params: { prompt: "" } },
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };
    store.getState().hydrate({ revision: 1, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    store.getState().updateNodeData("node-1", { ...node.data, content: ["Unsaved"] });

    store.getState().applyServerNodeData("node-1", { ...node.data, content: ["AI result"] });

    expect(store.getState().nodes[0]?.data?.content).toEqual(["AI result"]);
    expect(store.getState().pendingMutations).toEqual([]);
    store.getState().undo();
    expect(store.getState().nodes[0]?.data?.content).toEqual(["Unsaved"]);
  });

  it("keeps the active node selected when an SSE snapshot refreshes its generation state", () => {
    const store = createCanvasStore("project-1");
    const node = {
      id: "node-1",
      projectId: "project-1",
      type: "text" as const,
      entityId: "entity-1",
      positionX: 0,
      positionY: 0,
      width: 320,
      height: 220,
      data: { type: "text" as const, name: "Text", action: "text_generate", content: [""] },
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };
    store.getState().hydrate({ revision: 1, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    store.getState().setSelection([node.id]);

    store.getState().reconcileSnapshot({
      revision: 1,
      nodes: [{ ...node, data: { ...node.data, taskInfo: { status: "processing" } } }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(store.getState().selectedNodeIds).toEqual([node.id]);
    expect(store.getState().nodes[0]?.data?.taskInfo?.status).toBe("processing");
  });
});
