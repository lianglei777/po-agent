"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type {
  CanvasEdge,
  CanvasMediaType,
  CanvasMutation,
  CanvasNode,
  CanvasNodeData,
  CanvasSnapshot,
  CanvasViewport,
} from "@/contracts/pipeline";
import { textDocumentFromPlainText } from "../model/text-document";

export type CanvasInteractionMode = "select" | "pan";
export type CanvasSaveState = "idle" | "saving" | "saved" | "error";

type CanvasDocument = { nodes: CanvasNode[]; edges: CanvasEdge[] };

type CanvasStoreState = CanvasDocument & {
  projectId: string;
  revision: number;
  viewport: CanvasViewport;
  selectedNodeIds: string[];
  editingNodeId: string | null;
  interactionMode: CanvasInteractionMode;
  connectionsVisible: boolean;
  minimapVisible: boolean;
  loaded: boolean;
  error: string | null;
  saveState: CanvasSaveState;
  pendingMutations: CanvasMutation[];
  past: CanvasDocument[];
  future: CanvasDocument[];
  hydrate: (snapshot: CanvasSnapshot) => void;
  reconcileSnapshot: (snapshot: CanvasSnapshot) => void;
  setError: (message: string | null) => void;
  setSelection: (nodeIds: string[]) => void;
  startEditingNode: (nodeId: string) => void;
  stopEditingNode: (nodeId?: string) => void;
  setInteractionMode: (mode: CanvasInteractionMode) => void;
  toggleConnections: () => void;
  toggleMinimap: () => void;
  createNode: (type: CanvasMediaType, position: { x: number; y: number }, name: string) => CanvasNode;
  insertServerNode: (node: CanvasNode) => void;
  applyServerNodeData: (nodeId: string, data: CanvasNodeData, updatedAt?: string) => void;
  updateNodeData: (nodeId: string, data: CanvasNodeData) => void;
  updateNodePositionLive: (nodeId: string, position: { x: number; y: number }) => void;
  commitNodePosition: (nodeId: string, previous: { x: number; y: number }) => void;
  resizeNode: (nodeId: string, width: number, height: number) => void;
  updateNodeSizeLive: (nodeId: string, size: { width: number; height: number }) => void;
  commitNodeSize: (nodeId: string, previous: { width: number; height: number }) => void;
  deleteNodes: (nodeIds: string[]) => void;
  duplicateNodes: (nodeIds: string[], offset?: { x: number; y: number }) => string[];
  createEdge: (sourceNodeId: string, targetNodeId: string) => void;
  deleteEdges: (edgeIds: string[]) => void;
  setViewport: (viewport: CanvasViewport, persist?: boolean) => void;
  undo: () => void;
  redo: () => void;
  beginSaving: () => void;
  finishSaving: (rawMutationCount: number, snapshot: CanvasSnapshot) => void;
  failSaving: (message: string) => void;
};

const CanvasStoreContext = createContext<StoreApi<CanvasStoreState> | null>(null);

export function CanvasStoreProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const [store] = useState(() => createCanvasStore(projectId));
  return <CanvasStoreContext.Provider value={store}>{children}</CanvasStoreContext.Provider>;
}

export function useCanvasStore<T>(selector: (state: CanvasStoreState) => T): T {
  const store = useContext(CanvasStoreContext);
  if (!store) throw new Error("CanvasStoreProvider is missing");
  return useStore(store, selector);
}

export function useCanvasStoreApi(): StoreApi<CanvasStoreState> {
  const store = useContext(CanvasStoreContext);
  if (!store) throw new Error("CanvasStoreProvider is missing");
  return store;
}

export function createCanvasStore(projectId: string) {
  return createStore<CanvasStoreState>((set, get) => ({
    projectId,
    revision: 0,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeIds: [],
    editingNodeId: null,
    interactionMode: "select",
    connectionsVisible: true,
    minimapVisible: false,
    loaded: false,
    error: null,
    saveState: "idle",
    pendingMutations: [],
    past: [],
    future: [],

    hydrate: (snapshot) => set({
      revision: snapshot.revision,
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      viewport: snapshot.viewport,
      selectedNodeIds: [],
      editingNodeId: null,
      loaded: true,
      error: null,
      saveState: "idle",
      pendingMutations: [],
      past: [],
      future: [],
    }),

    reconcileSnapshot: (snapshot) => set((state) => {
      const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
      const selectedNodeIds = state.selectedNodeIds.filter((nodeId) => nodeIds.has(nodeId));
      const documentChanged = JSON.stringify(state.nodes) !== JSON.stringify(snapshot.nodes)
        || JSON.stringify(state.edges) !== JSON.stringify(snapshot.edges);
      return {
        revision: snapshot.revision,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        viewport: state.viewport,
        selectedNodeIds,
        editingNodeId: state.editingNodeId && nodeIds.has(state.editingNodeId) ? state.editingNodeId : null,
        loaded: true,
        error: null,
        saveState: "saved",
        past: documentChanged ? pushHistory(state.past, { nodes: state.nodes, edges: state.edges }) : state.past,
        future: documentChanged ? [] : state.future,
      };
    }),

    setError: (error) => set({ error }),

    setSelection: (nodeIds) => set((state) => {
      const editingNodeId = state.editingNodeId && nodeIds.includes(state.editingNodeId)
        ? state.editingNodeId
        : null;
      if (arraysEqual(state.selectedNodeIds, nodeIds) && editingNodeId === state.editingNodeId) return state;
      return { selectedNodeIds: nodeIds, editingNodeId };
    }),

    startEditingNode: (editingNodeId) => set({ editingNodeId, selectedNodeIds: [editingNodeId] }),
    stopEditingNode: (nodeId) => set((state) => (
      nodeId && state.editingNodeId !== nodeId ? state : { editingNodeId: null }
    )),

    setInteractionMode: (interactionMode) => set({ interactionMode }),
    toggleConnections: () => set((state) => ({ connectionsVisible: !state.connectionsVisible })),
    toggleMinimap: () => set((state) => ({ minimapVisible: !state.minimapVisible })),

    createNode: (type, position, name) => {
      const node = makeCanvasNode(projectId, type, position, name);
      commitDocument(set, get, [...get().nodes, node], get().edges, [{ type: "node.create", node }]);
      set({ selectedNodeIds: [node.id] });
      return node;
    },

    insertServerNode: (node) => set((state) => ({
      nodes: [...state.nodes.filter((item) => item.id !== node.id), node],
      selectedNodeIds: [node.id],
    })),

    applyServerNodeData: (nodeId, data, updatedAt) => set((state) => {
      const current = state.nodes.find((node) => node.id === nodeId);
      if (!current) return state;
      if (JSON.stringify(current.data) === JSON.stringify(data)) return state;
      const pendingMutations = state.pendingMutations.flatMap((mutation): CanvasMutation[] => {
        if (mutation.type !== "node.update" || mutation.nodeId !== nodeId || mutation.patch.data === undefined) {
          return [mutation];
        }
        const patch = { ...mutation.patch };
        delete patch.data;
        return Object.values(patch).some((value) => value !== undefined) ? [{ ...mutation, patch }] : [];
      });
      return {
        nodes: state.nodes.map((node) => node.id === nodeId
          ? { ...node, data, updatedAt: updatedAt ?? new Date().toISOString() }
          : node),
        past: pushHistory(state.past, { nodes: state.nodes, edges: state.edges }),
        future: [],
        pendingMutations,
        saveState: pendingMutations.length ? "idle" : "saved",
        error: null,
      };
    }),

    updateNodeData: (nodeId, data) => set((state) => ({
      nodes: state.nodes.map((node) => node.id === nodeId ? { ...node, data, updatedAt: new Date().toISOString() } : node),
      pendingMutations: appendMutation(state.pendingMutations, { type: "node.update", nodeId, patch: { data } }),
      saveState: "idle",
    })),

    updateNodePositionLive: (nodeId, position) => set((state) => ({
      nodes: state.nodes.map((node) => node.id === nodeId ? { ...node, positionX: position.x, positionY: position.y } : node),
    })),

    commitNodePosition: (nodeId, previous) => {
      const state = get();
      const node = state.nodes.find((item) => item.id === nodeId);
      if (!node || (node.positionX === previous.x && node.positionY === previous.y)) return;
      const beforeNodes = state.nodes.map((item) => item.id === nodeId ? { ...item, positionX: previous.x, positionY: previous.y } : item);
      set({
        past: pushHistory(state.past, { nodes: beforeNodes, edges: state.edges }),
        future: [],
        pendingMutations: appendMutation(state.pendingMutations, {
          type: "node.update",
          nodeId,
          patch: { positionX: node.positionX, positionY: node.positionY },
        }),
        saveState: "idle",
      });
    },

    resizeNode: (nodeId, width, height) => {
      const state = get();
      const nextNodes = state.nodes.map((node) => node.id === nodeId ? { ...node, width, height } : node);
      commitDocument(set, get, nextNodes, state.edges, [{ type: "node.update", nodeId, patch: { width, height } }]);
    },

    updateNodeSizeLive: (nodeId, size) => set((state) => ({
      nodes: state.nodes.map((node) => node.id === nodeId
        ? { ...node, width: size.width, height: size.height }
        : node),
    })),

    commitNodeSize: (nodeId, previous) => {
      const state = get();
      const node = state.nodes.find((item) => item.id === nodeId);
      if (!node || (node.width === previous.width && node.height === previous.height)) return;
      // 缩放过程只更新画布内存；结束时一次性补入历史和持久化队列，避免拖拽期间反复深拷贝。
      const beforeNodes = state.nodes.map((item) => item.id === nodeId
        ? { ...item, width: previous.width, height: previous.height }
        : item);
      set({
        past: pushHistory(state.past, { nodes: beforeNodes, edges: state.edges }),
        future: [],
        pendingMutations: appendMutation(state.pendingMutations, {
          type: "node.update",
          nodeId,
          patch: { width: node.width, height: node.height },
        }),
        saveState: "idle",
      });
    },

    deleteNodes: (nodeIds) => {
      if (!nodeIds.length) return;
      const ids = new Set(nodeIds);
      const state = get();
      const deletedEdgeIds = state.edges.filter((edge) => ids.has(edge.sourceNodeId) || ids.has(edge.targetNodeId)).map((edge) => edge.id);
      const mutations: CanvasMutation[] = [
        ...nodeIds.map((nodeId): CanvasMutation => ({ type: "node.delete", nodeId })),
        ...deletedEdgeIds.map((edgeId): CanvasMutation => ({ type: "edge.delete", edgeId })),
      ];
      commitDocument(
        set,
        get,
        state.nodes.filter((node) => !ids.has(node.id)),
        state.edges.filter((edge) => !ids.has(edge.sourceNodeId) && !ids.has(edge.targetNodeId)),
        mutations,
      );
      set((current) => ({
        selectedNodeIds: [],
        editingNodeId: current.editingNodeId && ids.has(current.editingNodeId) ? null : current.editingNodeId,
      }));
    },

    duplicateNodes: (nodeIds, offset = { x: 48, y: 48 }) => {
      const state = get();
      const selected = state.nodes.filter((node) => nodeIds.includes(node.id));
      if (!selected.length) return [];
      const idMap = new Map<string, string>();
      const copies = selected.map((node) => {
        const id = crypto.randomUUID();
        idMap.set(node.id, id);
        return {
          ...structuredClone(node),
          id,
          entityId: crypto.randomUUID(),
          positionX: node.positionX + offset.x,
          positionY: node.positionY + offset.y,
          data: node.data ? { ...structuredClone(node.data), taskInfo: { status: "idle" } } : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies CanvasNode;
      });
      const copiedEdges = state.edges.flatMap((edge) => {
        const sourceNodeId = idMap.get(edge.sourceNodeId);
        const targetNodeId = idMap.get(edge.targetNodeId);
        if (!sourceNodeId || !targetNodeId) return [];
        return [{
          ...edge,
          id: crypto.randomUUID(),
          sourceNodeId,
          targetNodeId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } satisfies CanvasEdge];
      });
      commitDocument(
        set,
        get,
        [...state.nodes, ...copies],
        [...state.edges, ...copiedEdges],
        [
          ...copies.map((node): CanvasMutation => ({ type: "node.create", node })),
          ...copiedEdges.map((edge): CanvasMutation => ({ type: "edge.create", edge })),
        ],
      );
      const createdIds = copies.map((node) => node.id);
      set({ selectedNodeIds: createdIds });
      return createdIds;
    },

    createEdge: (sourceNodeId, targetNodeId) => {
      if (sourceNodeId === targetNodeId) return;
      const state = get();
      if (state.edges.some((edge) => edge.sourceNodeId === sourceNodeId && edge.targetNodeId === targetNodeId)) return;
      const now = new Date().toISOString();
      const edge: CanvasEdge = {
        id: crypto.randomUUID(),
        projectId,
        sourceNodeId,
        targetNodeId,
        edgeType: "references",
        createdAt: now,
        updatedAt: now,
      };
      commitDocument(set, get, state.nodes, [...state.edges, edge], [{ type: "edge.create", edge }]);
    },

    deleteEdges: (edgeIds) => {
      if (!edgeIds.length) return;
      const ids = new Set(edgeIds);
      const state = get();
      commitDocument(
        set,
        get,
        state.nodes,
        state.edges.filter((edge) => !ids.has(edge.id)),
        edgeIds.map((edgeId): CanvasMutation => ({ type: "edge.delete", edgeId })),
      );
    },

    setViewport: (viewport, persist = false) => set((state) => ({
      viewport,
      pendingMutations: persist
        ? appendMutation(state.pendingMutations, { type: "viewport.update", viewport })
        : state.pendingMutations,
      saveState: persist ? "idle" : state.saveState,
    })),

    undo: () => {
      const state = get();
      const previous = state.past.at(-1);
      if (!previous) return;
      const current = { nodes: state.nodes, edges: state.edges };
      set({
        nodes: structuredClone(previous.nodes),
        edges: structuredClone(previous.edges),
        selectedNodeIds: [],
        editingNodeId: null,
        past: state.past.slice(0, -1),
        future: [current, ...state.future].slice(0, 50),
        pendingMutations: [...state.pendingMutations, ...diffDocuments(current, previous, projectId)],
        saveState: "idle",
      });
    },

    redo: () => {
      const state = get();
      const next = state.future[0];
      if (!next) return;
      const current = { nodes: state.nodes, edges: state.edges };
      set({
        nodes: structuredClone(next.nodes),
        edges: structuredClone(next.edges),
        selectedNodeIds: [],
        editingNodeId: null,
        past: pushHistory(state.past, current),
        future: state.future.slice(1),
        pendingMutations: [...state.pendingMutations, ...diffDocuments(current, next, projectId)],
        saveState: "idle",
      });
    },

    beginSaving: () => set({ saveState: "saving" }),

    finishSaving: (rawMutationCount, snapshot) => set((state) => {
      const remaining = state.pendingMutations.slice(rawMutationCount);
      if (!remaining.length) {
        return {
          revision: snapshot.revision,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          viewport: snapshot.viewport,
          pendingMutations: [],
          saveState: "saved",
          error: null,
        };
      }
      return { revision: snapshot.revision, pendingMutations: remaining, saveState: "idle", error: null };
    }),

    failSaving: (error) => set({ saveState: "error", error }),
  }));
}

function commitDocument(
  set: StoreApi<CanvasStoreState>["setState"],
  get: StoreApi<CanvasStoreState>["getState"],
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  mutations: CanvasMutation[],
) {
  const state = get();
  set({
    nodes,
    edges,
    past: pushHistory(state.past, { nodes: state.nodes, edges: state.edges }),
    future: [],
    pendingMutations: [...state.pendingMutations, ...mutations],
    saveState: "idle",
  });
}

function makeCanvasNode(projectId: string, type: CanvasMediaType, position: { x: number; y: number }, name: string): CanvasNode {
  const now = new Date().toISOString();
  const defaults: Record<CanvasMediaType, { width: number; height: number }> = {
    text: { width: 320, height: 220 },
    image: { width: 360, height: 300 },
    video: { width: 380, height: 320 },
    audio: { width: 360, height: 160 },
  };
  const config = defaults[type];
  return {
    id: crypto.randomUUID(),
    projectId,
    type,
    entityId: crypto.randomUUID(),
    positionX: position.x,
    positionY: position.y,
    width: config.width,
    height: config.height,
    data: {
      type,
      name,
      action: `${type}_generate`,
      generatorType: "default",
      content: type === "text" ? [""] : undefined,
      textDocument: type === "text" ? textDocumentFromPlainText("") : undefined,
      url: type === "text" ? undefined : [],
      params: { prompt: "", count: 1, textList: [], imageList: [], videoList: [], audioList: [], mixedListOrder: [] },
      taskInfo: { status: "idle" },
    },
    createdAt: now,
    updatedAt: now,
  };
}

function appendMutation(mutations: CanvasMutation[], next: CanvasMutation): CanvasMutation[] {
  if (next.type === "viewport.update") return [...mutations.filter((item) => item.type !== "viewport.update"), next];
  if (next.type === "node.update") {
    const previous = mutations.findLast((item) => item.type === "node.update" && item.nodeId === next.nodeId);
    if (previous?.type === "node.update") {
      return mutations.map((item) => item === previous ? { ...previous, patch: { ...previous.patch, ...next.patch } } : item);
    }
  }
  return [...mutations, next];
}

function pushHistory(history: CanvasDocument[], document: CanvasDocument) {
  return [...history, structuredClone(document)].slice(-50);
}

function diffDocuments(from: CanvasDocument, to: CanvasDocument, projectId: string): CanvasMutation[] {
  const fromNodes = new Map(from.nodes.map((node) => [node.id, node]));
  const toNodes = new Map(to.nodes.map((node) => [node.id, node]));
  const fromEdges = new Map(from.edges.map((edge) => [edge.id, edge]));
  const toEdges = new Map(to.edges.map((edge) => [edge.id, edge]));
  const mutations: CanvasMutation[] = [];

  for (const [id, node] of fromNodes) {
    if (!toNodes.has(id)) mutations.push({ type: "node.delete", nodeId: id });
    else if (JSON.stringify(node) !== JSON.stringify(toNodes.get(id))) {
      const target = toNodes.get(id)!;
      mutations.push({
        type: "node.update",
        nodeId: id,
        patch: {
          positionX: target.positionX,
          positionY: target.positionY,
          width: target.width,
          height: target.height,
          data: target.data,
        },
      });
    }
  }
  for (const [id, node] of toNodes) if (!fromNodes.has(id)) mutations.push({ type: "node.create", node: { ...node, projectId } });
  for (const id of fromEdges.keys()) if (!toEdges.has(id)) mutations.push({ type: "edge.delete", edgeId: id });
  for (const [id, edge] of toEdges) if (!fromEdges.has(id)) mutations.push({ type: "edge.create", edge: { ...edge, projectId } });
  return mutations;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
