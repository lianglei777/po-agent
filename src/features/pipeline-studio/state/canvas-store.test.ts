import { describe, expect, it, vi } from "vitest";
import { createCanvasStore } from "./canvas-store";

describe("pipeline studio canvas store", () => {
  it("treats the hydrated server snapshot as already saved", () => {
    const store = createCanvasStore("project-1");

    store.getState().hydrate({ revision: 0, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

    expect(store.getState()).toMatchObject({ saveState: "saved", pendingMutations: [] });
  });

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

  it("deletes a connection and restores it through undo", () => {
    const store = createCanvasStore("project-1");
    const edge = {
      id: "edge-1",
      projectId: "project-1",
      sourceNodeId: "node-1",
      targetNodeId: "node-2",
      edgeType: "references" as const,
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
    };
    store.getState().hydrate({ revision: 1, nodes: [], edges: [edge], viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().deleteEdges([edge.id]);
    expect(store.getState().edges).toEqual([]);
    expect(store.getState().pendingMutations).toEqual([{ type: "edge.delete", edgeId: edge.id }]);

    store.getState().undo();
    expect(store.getState().edges).toEqual([edge]);
    expect(store.getState().pendingMutations).toEqual([
      { type: "edge.delete", edgeId: edge.id },
      { type: "edge.create", edge, intent: "restore" },
    ]);
  });

  it("persists and undoes connected resource roles", () => {
    const store = createCanvasStore("project-1");
    const edge = {
      id: "edge-1",
      projectId: "project-1",
      sourceNodeId: "image-1",
      targetNodeId: "video-1",
      edgeType: "references" as const,
      role: "reference" as const,
      order: 0,
    };
    store.getState().hydrate({ revision: 1, nodes: [], edges: [edge], viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().updateEdgeBinding(edge.id, { role: "first-frame" });
    expect(store.getState().edges[0]?.role).toBe("first-frame");
    expect(store.getState().pendingMutations).toEqual([
      { type: "edge.update", edgeId: edge.id, patch: { role: "first-frame" } },
    ]);

    store.getState().undo();
    expect(store.getState().edges[0]?.role).toBe("reference");
    expect(store.getState().pendingMutations.at(-1)).toEqual({
      type: "edge.update",
      edgeId: edge.id,
      patch: { role: "reference", order: 0 },
    });
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

  it("keeps canvas selection separate from explicit composer activation", () => {
    const store = createCanvasStore("project-1");
    store.getState().hydrate({ revision: 0, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().setSelection(["image-1"]);
    expect(store.getState().activeComposerNodeId).toBeNull();

    store.getState().activateNodeComposer("image-1");
    expect(store.getState().activeComposerNodeId).toBe("image-1");
    expect(store.getState().selectedNodeIds).toEqual(["image-1"]);

    store.getState().setSelection(["image-1"]);
    expect(store.getState().activeComposerNodeId).toBe("image-1");

    store.getState().setSelection(["image-1", "image-2"]);
    expect(store.getState().activeComposerNodeId).toBeNull();

    store.getState().activateNodeComposer("image-2");
    store.getState().setSelection([]);
    expect(store.getState().activeComposerNodeId).toBeNull();
  });

  it("keeps composer drafts across closing and store recreation until the node is deleted", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const node = {
      id: "node-1",
      projectId: "project-1",
      type: "image" as const,
      entityId: "entity-1",
      positionX: 0,
      positionY: 0,
      width: 360,
      height: 300,
      data: { type: "image" as const, name: "Image", action: "image_generate", url: [] },
      createdAt: "2026-08-25T00:00:00.000Z",
      updatedAt: "2026-08-25T00:00:00.000Z",
    };
    const document = {
      schemaVersion: 1 as const,
      format: "tiptap-json" as const,
      plainText: "保留这个提示词",
      content: { type: "doc" as const, content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "保留这个提示词" }] }] },
    };
    const store = createCanvasStore("project-1");
    store.getState().hydrate({ revision: 1, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    store.getState().setComposerDraft(node.id, "image-create", document);
    store.getState().setSelection([]);

    const restored = createCanvasStore("project-1");
    expect(restored.getState().composerDrafts[`${node.id}:image-create`]).toEqual(document);

    store.getState().deleteNodes([node.id]);
    expect(createCanvasStore("project-1").getState().composerDrafts).toEqual({});
    vi.unstubAllGlobals();
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

  it("keeps workflow-owned nodes and connections immutable while the run is active", () => {
    const store = createCanvasStore("project-1");
    const source = store.getState().createNode("image", { x: 0, y: 0 }, "Source");
    const target = store.getState().createNode("video", { x: 400, y: 0 }, "Target");
    const mutationCount = store.getState().pendingMutations.length;
    store.getState().setWorkflowLockedNodeIds([source.id]);

    store.getState().deleteNodes([source.id]);
    store.getState().createEdge(source.id, target.id);

    expect(store.getState().nodes.some((node) => node.id === source.id)).toBe(true);
    expect(store.getState().edges).toEqual([]);
    expect(store.getState().pendingMutations).toHaveLength(mutationCount);
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

  it("fits an image node around its center and ignores fractional repeat adjustments", () => {
    const store = createCanvasStore("project-1");
    const node = {
      id: "node-1",
      projectId: "project-1",
      type: "image" as const,
      entityId: "entity-1",
      positionX: 100,
      positionY: 100,
      width: 360,
      height: 300,
      data: { type: "image" as const, name: "Image", action: "image_generate", url: [] },
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    };
    store.getState().hydrate({ revision: 1, nodes: [node], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });

    store.getState().fitNodeSize("node-1", { width: 360, height: 202.5 });

    expect(store.getState().nodes[0]).toMatchObject({
      positionX: 100,
      positionY: 148.75,
      width: 360,
      height: 202.5,
    });
    expect(store.getState().pendingMutations).toEqual([{
      type: "node.update",
      nodeId: "node-1",
      patch: { positionX: 100, positionY: 148.75, width: 360, height: 202.5 },
    }]);
    expect(store.getState().past).toHaveLength(1);

    store.getState().fitNodeSize("node-1", { width: 360, height: 203 });
    expect(store.getState().pendingMutations).toHaveLength(1);
    expect(store.getState().past).toHaveLength(1);
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

  it("inserts a server-created AI image node and its provenance edge without queuing local mutations", () => {
    const store = createCanvasStore("project-1");
    store.getState().hydrate({ revision: 2, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    const node = {
      id: "derived-1",
      projectId: "project-1",
      type: "image" as const,
      entityId: "entity-derived-1",
      positionX: 500,
      positionY: 100,
      width: 350,
      height: 350,
      data: { type: "image" as const, name: "Image · AI", action: "image_generate", taskInfo: { status: "processing" as const } },
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    };
    const edge = {
      id: "edge-1",
      projectId: "project-1",
      sourceNodeId: "source-1",
      targetNodeId: node.id,
      edgeType: "references" as const,
    };

    store.getState().insertServerGenerationResult(node, edge);

    expect(store.getState().nodes).toEqual([node]);
    expect(store.getState().edges).toEqual([edge]);
    expect(store.getState().selectedNodeIds).toEqual([node.id]);
    expect(store.getState().pendingMutations).toEqual([]);
  });

  it("leaves image editing mode when a server-created image becomes selected", () => {
    const store = createCanvasStore("project-1");
    store.getState().hydrate({ revision: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } });
    store.getState().startEditingNode("source-1");
    const result = {
      id: "result-1",
      projectId: "project-1",
      type: "image" as const,
      entityId: "entity-result-1",
      positionX: 500,
      positionY: 100,
      width: 350,
      height: 350,
      data: { type: "image" as const, name: "Edited", action: "image_resource" },
      createdAt: "2026-08-24T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
    };

    store.getState().insertServerNode(result);

    expect(store.getState().editingNodeId).toBeNull();
    expect(store.getState().selectedNodeIds).toEqual([result.id]);
  });
});
