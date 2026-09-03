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
  CanvasPromptDocument,
  CanvasResourceReferenceAttrs,
  CanvasResourceRole,
  CanvasSnapshot,
  CanvasViewport,
} from "@/contracts/pipeline";
import { textDocumentFromPlainText } from "../model/text-document";
import { canvasConnectionProblem } from "../model/canvas-connection-policy";

export type CanvasInteractionMode = "select" | "pan";
export type CanvasSaveState = "idle" | "saving" | "saved" | "error";
export type CanvasComposerDraftKind = "text" | "image-create" | "image-modify" | "video";

type CanvasDocument = { nodes: CanvasNode[]; edges: CanvasEdge[] };

type CanvasStoreState = CanvasDocument & {
  projectId: string;
  revision: number;
  viewport: CanvasViewport;
  selectedNodeIds: string[];
  editingNodeId: string | null;
  activeComposerNodeId: string | null;
  composerDrafts: Record<string, CanvasPromptDocument>;
  composerReferenceDrafts: Record<string, CanvasResourceReferenceAttrs[]>;
  interactionMode: CanvasInteractionMode;
  connectionsVisible: boolean;
  minimapVisible: boolean;
  uploadingNodeIds: string[];
  workflowLockedNodeIds: string[];
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
  activateNodeComposer: (nodeId: string) => void;
  closeNodeComposer: (nodeId?: string) => void;
  setComposerDraft: (nodeId: string, kind: CanvasComposerDraftKind, document: CanvasPromptDocument) => void;
  clearComposerDraft: (nodeId: string, kind: CanvasComposerDraftKind) => void;
  setComposerReferenceDraft: (nodeId: string, kind: CanvasComposerDraftKind, references: CanvasResourceReferenceAttrs[]) => void;
  clearComposerReferenceDraft: (nodeId: string, kind: CanvasComposerDraftKind) => void;
  setInteractionMode: (mode: CanvasInteractionMode) => void;
  toggleConnections: () => void;
  toggleMinimap: () => void;
  setNodeUploading: (nodeId: string, uploading: boolean) => void;
  setWorkflowLockedNodeIds: (nodeIds: string[]) => void;
  createNode: (type: CanvasMediaType, position: { x: number; y: number }, name: string) => CanvasNode;
  insertServerNode: (node: CanvasNode) => void;
  insertServerGenerationResult: (node: CanvasNode, edges?: CanvasEdge[]) => void;
  applyServerNodeData: (nodeId: string, data: CanvasNodeData, updatedAt?: string) => void;
  updateNodeData: (nodeId: string, data: CanvasNodeData) => void;
  updateNodePositionLive: (nodeId: string, position: { x: number; y: number }) => void;
  commitNodePosition: (nodeId: string, previous: { x: number; y: number }) => void;
  commitNodePositions: (origins: Array<{ nodeId: string; x: number; y: number }>) => void;
  resizeNode: (nodeId: string, width: number, height: number) => void;
  fitNodeSize: (nodeId: string, size: { width: number; height: number }) => void;
  updateNodeSizeLive: (nodeId: string, size: { width: number; height: number }) => void;
  commitNodeSize: (nodeId: string, previous: { width: number; height: number }) => void;
  deleteNodes: (nodeIds: string[]) => void;
  duplicateNodes: (nodeIds: string[], offset?: { x: number; y: number }) => string[];
  createEdge: (
    sourceNodeId: string,
    targetNodeId: string,
    intent?: "connect" | "prompt-reference" | "restore",
    role?: CanvasResourceRole,
  ) => void;
  updateEdgeBinding: (edgeId: string, patch: { role?: CanvasResourceRole; order?: number }) => void;
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
    activeComposerNodeId: null,
    composerDrafts: loadComposerDrafts(projectId),
    composerReferenceDrafts: loadComposerReferenceDrafts(projectId),
    interactionMode: "select",
    connectionsVisible: true,
    minimapVisible: false,
    uploadingNodeIds: [],
    workflowLockedNodeIds: [],
    loaded: false,
    error: null,
    saveState: "idle",
    pendingMutations: [],
    past: [],
    future: [],

    hydrate: (snapshot) => set((state) => {
      const composerDrafts = filterComposerDrafts(
        state.composerDrafts,
        new Set(snapshot.nodes.map((node) => node.id)),
      );
      const composerReferenceDrafts = filterComposerReferenceDrafts(
        state.composerReferenceDrafts,
        new Set(snapshot.nodes.map((node) => node.id)),
      );
      if (composerDrafts !== state.composerDrafts) persistComposerDrafts(projectId, composerDrafts);
      if (composerReferenceDrafts !== state.composerReferenceDrafts) persistComposerReferenceDrafts(projectId, composerReferenceDrafts);
      return {
        revision: snapshot.revision,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        viewport: snapshot.viewport,
        selectedNodeIds: [],
        editingNodeId: null,
        activeComposerNodeId: null,
        composerDrafts,
        composerReferenceDrafts,
        loaded: true,
        error: null,
        saveState: "saved",
        pendingMutations: [],
        uploadingNodeIds: [],
        past: [],
        future: [],
      };
    }),

    reconcileSnapshot: (snapshot) => set((state) => {
      const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
      const selectedNodeIds = state.selectedNodeIds.filter((nodeId) => nodeIds.has(nodeId));
      const documentChanged = JSON.stringify(state.nodes) !== JSON.stringify(snapshot.nodes)
        || JSON.stringify(state.edges) !== JSON.stringify(snapshot.edges);
      const composerDrafts = filterComposerDrafts(state.composerDrafts, nodeIds);
      const composerReferenceDrafts = filterComposerReferenceDrafts(state.composerReferenceDrafts, nodeIds);
      if (composerDrafts !== state.composerDrafts) persistComposerDrafts(projectId, composerDrafts);
      if (composerReferenceDrafts !== state.composerReferenceDrafts) persistComposerReferenceDrafts(projectId, composerReferenceDrafts);
      return {
        revision: snapshot.revision,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        viewport: state.viewport,
        selectedNodeIds,
        editingNodeId: state.editingNodeId && nodeIds.has(state.editingNodeId) ? state.editingNodeId : null,
        activeComposerNodeId: state.activeComposerNodeId && nodeIds.has(state.activeComposerNodeId)
          ? state.activeComposerNodeId
          : null,
        composerDrafts,
        composerReferenceDrafts,
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
      const activeComposerNodeId = state.activeComposerNodeId
        && nodeIds.length === 1
        && nodeIds[0] === state.activeComposerNodeId
        ? state.activeComposerNodeId
        : null;
      if (arraysEqual(state.selectedNodeIds, nodeIds)
        && editingNodeId === state.editingNodeId
        && activeComposerNodeId === state.activeComposerNodeId) return state;
      return { selectedNodeIds: nodeIds, editingNodeId, activeComposerNodeId };
    }),

    startEditingNode: (editingNodeId) => set({ editingNodeId, selectedNodeIds: [editingNodeId], activeComposerNodeId: null }),
    stopEditingNode: (nodeId) => set((state) => (
      nodeId && state.editingNodeId !== nodeId ? state : { editingNodeId: null }
    )),
    activateNodeComposer: (activeComposerNodeId) => set({
      activeComposerNodeId,
      selectedNodeIds: [activeComposerNodeId],
      editingNodeId: null,
    }),
    closeNodeComposer: (nodeId) => set((state) => (
      nodeId && state.activeComposerNodeId !== nodeId ? state : { activeComposerNodeId: null }
    )),
    setComposerDraft: (nodeId, kind, document) => set((state) => {
      const composerDrafts = { ...state.composerDrafts, [composerDraftKey(nodeId, kind)]: document };
      persistComposerDrafts(projectId, composerDrafts);
      return { composerDrafts };
    }),
    clearComposerDraft: (nodeId, kind) => set((state) => {
      const key = composerDraftKey(nodeId, kind);
      if (!(key in state.composerDrafts)) return state;
      const composerDrafts = { ...state.composerDrafts };
      delete composerDrafts[key];
      persistComposerDrafts(projectId, composerDrafts);
      return { composerDrafts };
    }),
    setComposerReferenceDraft: (nodeId, kind, references) => set((state) => {
      const composerReferenceDrafts = {
        ...state.composerReferenceDrafts,
        [composerDraftKey(nodeId, kind)]: references,
      };
      persistComposerReferenceDrafts(projectId, composerReferenceDrafts);
      return { composerReferenceDrafts };
    }),
    clearComposerReferenceDraft: (nodeId, kind) => set((state) => {
      const key = composerDraftKey(nodeId, kind);
      if (!(key in state.composerReferenceDrafts)) return state;
      const composerReferenceDrafts = { ...state.composerReferenceDrafts };
      delete composerReferenceDrafts[key];
      persistComposerReferenceDrafts(projectId, composerReferenceDrafts);
      return { composerReferenceDrafts };
    }),

    setInteractionMode: (interactionMode) => set({ interactionMode }),
    toggleConnections: () => set((state) => ({ connectionsVisible: !state.connectionsVisible })),
    toggleMinimap: () => set((state) => ({ minimapVisible: !state.minimapVisible })),
    setNodeUploading: (nodeId, uploading) => set((state) => ({
      uploadingNodeIds: uploading
        ? state.uploadingNodeIds.includes(nodeId) ? state.uploadingNodeIds : [...state.uploadingNodeIds, nodeId]
        : state.uploadingNodeIds.filter((id) => id !== nodeId),
    })),
    setWorkflowLockedNodeIds: (workflowLockedNodeIds) => set({ workflowLockedNodeIds }),

    createNode: (type, position, name) => {
      const node = makeCanvasNode(projectId, type, position, name);
      commitDocument(set, get, [...get().nodes, node], get().edges, [{ type: "node.create", node }]);
      set({ selectedNodeIds: [node.id], activeComposerNodeId: node.id });
      return node;
    },

    insertServerNode: (node) => set((state) => ({
      nodes: [...state.nodes.filter((item) => item.id !== node.id), node],
      selectedNodeIds: [node.id],
      editingNodeId: null,
      activeComposerNodeId: state.activeComposerNodeId === node.id ? node.id : null,
    })),

    insertServerGenerationResult: (node, edges) => set((state) => ({
      nodes: [...state.nodes.filter((item) => item.id !== node.id), node],
      edges: edges?.length
        ? [...state.edges.filter((item) => !edges.some((edge) => edge.id === item.id)), ...edges]
        : state.edges,
      selectedNodeIds: [node.id],
      editingNodeId: null,
      activeComposerNodeId: node.id,
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

    updateNodeData: (nodeId, data) => set((state) => state.workflowLockedNodeIds.includes(nodeId) ? state : ({
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

    commitNodePositions: (origins) => {
      const state = get();
      const originById = new Map(origins.map((origin) => [origin.nodeId, origin]));
      const changed = state.nodes.filter((node) => {
        const origin = originById.get(node.id);
        return origin && (node.positionX !== origin.x || node.positionY !== origin.y);
      });
      if (!changed.length) return;
      const beforeNodes = state.nodes.map((node) => {
        const origin = originById.get(node.id);
        return origin ? { ...node, positionX: origin.x, positionY: origin.y } : node;
      });
      const pendingMutations = changed.reduce((mutations, node) => appendMutation(mutations, {
        type: "node.update",
        nodeId: node.id,
        patch: { positionX: node.positionX, positionY: node.positionY },
      }), state.pendingMutations);
      set({
        past: pushHistory(state.past, { nodes: beforeNodes, edges: state.edges }),
        future: [],
        pendingMutations,
        saveState: "idle",
      });
    },

    resizeNode: (nodeId, width, height) => {
      const state = get();
      const nextNodes = state.nodes.map((node) => node.id === nodeId ? { ...node, width, height } : node);
      commitDocument(set, get, nextNodes, state.edges, [{ type: "node.update", nodeId, patch: { width, height } }]);
    },

    fitNodeSize: (nodeId, size) => {
      const state = get();
      const current = state.nodes.find((node) => node.id === nodeId);
      if (!current) return;
      const currentWidth = current.width ?? 320;
      const currentHeight = current.height ?? 220;
      if (Math.abs(currentWidth - size.width) <= 1 && Math.abs(currentHeight - size.height) <= 1) return;
      // 图片比例首次确定或发生替换时保持视觉中心不变，避免节点只向右下角伸展。
      const positionX = current.positionX + (currentWidth - size.width) / 2;
      const positionY = current.positionY + (currentHeight - size.height) / 2;
      const nodes = state.nodes.map((node) => node.id === nodeId ? {
        ...node,
        positionX,
        positionY,
        width: size.width,
        height: size.height,
      } : node);
      commitDocument(set, get, nodes, state.edges, [{
        type: "node.update",
        nodeId,
        patch: { positionX, positionY, width: size.width, height: size.height },
      }]);
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
      const state = get();
      const locked = new Set(state.workflowLockedNodeIds);
      const deletableNodeIds = nodeIds.filter((nodeId) => !locked.has(nodeId));
      if (!deletableNodeIds.length) return;
      const ids = new Set(deletableNodeIds);
      const deletedEdgeIds = state.edges.filter((edge) => ids.has(edge.sourceNodeId) || ids.has(edge.targetNodeId)).map((edge) => edge.id);
      const mutations: CanvasMutation[] = [
        ...deletableNodeIds.map((nodeId): CanvasMutation => ({ type: "node.delete", nodeId })),
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
        activeComposerNodeId: current.activeComposerNodeId && ids.has(current.activeComposerNodeId)
          ? null
          : current.activeComposerNodeId,
        composerDrafts: removeNodeComposerDrafts(projectId, current.composerDrafts, ids),
        composerReferenceDrafts: removeNodeComposerReferenceDrafts(projectId, current.composerReferenceDrafts, ids),
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
          ...copiedEdges.map((edge): CanvasMutation => ({ type: "edge.create", edge, intent: "restore" })),
        ],
      );
      const createdIds = copies.map((node) => node.id);
      set({ selectedNodeIds: createdIds, activeComposerNodeId: null });
      return createdIds;
    },

    createEdge: (sourceNodeId, targetNodeId, intent = "connect", role = "reference") => {
      const state = get();
      if (state.workflowLockedNodeIds.includes(sourceNodeId) || state.workflowLockedNodeIds.includes(targetNodeId)) return;
      if (intent === "connect" && state.uploadingNodeIds.includes(targetNodeId)) return;
      const problem = canvasConnectionProblem(state.nodes, state.edges, sourceNodeId, targetNodeId);
      if (problem && !(intent === "restore" && problem === "target-has-content")) return;
      const now = new Date().toISOString();
      const edge: CanvasEdge = {
        id: crypto.randomUUID(),
        projectId,
        sourceNodeId,
        targetNodeId,
        edgeType: "references",
        role,
        order: state.edges
          .filter((candidate) => candidate.targetNodeId === targetNodeId)
          .reduce((highest, candidate) => Math.max(highest, candidate.order ?? -1), -1) + 1,
        createdAt: now,
        updatedAt: now,
      };
      commitDocument(set, get, state.nodes, [...state.edges, edge], [{ type: "edge.create", edge, intent }]);
    },

    updateEdgeBinding: (edgeId, patch) => {
      const state = get();
      const current = state.edges.find((edge) => edge.id === edgeId);
      if (!current) return;
      if (state.workflowLockedNodeIds.includes(current.sourceNodeId) || state.workflowLockedNodeIds.includes(current.targetNodeId)) return;
      commitDocument(
        set,
        get,
        state.nodes,
        state.edges.map((edge) => edge.id === edgeId
          ? { ...edge, ...patch, updatedAt: new Date().toISOString() }
          : edge),
        [{ type: "edge.update", edgeId, patch }],
      );
    },

    deleteEdges: (edgeIds) => {
      if (!edgeIds.length) return;
      const state = get();
      const deletableEdgeIds = edgeIds.filter((edgeId) => {
        const edge = state.edges.find((candidate) => candidate.id === edgeId);
        return !edge || (!state.workflowLockedNodeIds.includes(edge.sourceNodeId) && !state.workflowLockedNodeIds.includes(edge.targetNodeId));
      });
      if (!deletableEdgeIds.length) return;
      const deletableIds = new Set(deletableEdgeIds);
      commitDocument(
        set,
        get,
        state.nodes,
        state.edges.filter((edge) => !deletableIds.has(edge.id)),
        deletableEdgeIds.map((edgeId): CanvasMutation => ({ type: "edge.delete", edgeId })),
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
        activeComposerNodeId: null,
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
        activeComposerNodeId: null,
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
    audio: { width: 360, height: 180 },
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
    for (let index = mutations.length - 1; index >= 0; index -= 1) {
      const previous = mutations[index];
      const isStructuralBoundary = (previous.type === "node.create" && previous.node.id === next.nodeId)
        || (previous.type === "node.delete" && previous.nodeId === next.nodeId);
      // 删除或恢复会改变服务端实体身份，更新只能在最近的结构边界内合并。
      if (isStructuralBoundary) break;
      if (previous.type === "node.update" && previous.nodeId === next.nodeId) {
        return mutations.map((item, itemIndex) => itemIndex === index
          ? { ...previous, patch: { ...previous.patch, ...next.patch } }
          : item);
      }
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
  for (const [id, edge] of toEdges) {
    const previous = fromEdges.get(id);
    if (previous && (previous.role !== edge.role || previous.order !== edge.order)) {
      mutations.push({ type: "edge.update", edgeId: id, patch: { role: edge.role, order: edge.order } });
    }
  }
  for (const [id, edge] of toEdges) if (!fromEdges.has(id)) {
    mutations.push({ type: "edge.create", edge: { ...edge, projectId }, intent: "restore" });
  }
  return mutations;
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const COMPOSER_DRAFT_KINDS: CanvasComposerDraftKind[] = ["text", "image-create", "image-modify", "video"];

export function composerDraftKey(nodeId: string, kind: CanvasComposerDraftKind) {
  return `${nodeId}:${kind}`;
}

function composerDraftStorageKey(projectId: string) {
  return `pipeline-composer-drafts:v1:${projectId}`;
}

function composerReferenceDraftStorageKey(projectId: string) {
  return `pipeline-composer-reference-drafts:v1:${projectId}`;
}

function loadComposerDrafts(projectId: string): Record<string, CanvasPromptDocument> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(composerDraftStorageKey(projectId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.drafts)) return {};
    return Object.fromEntries(Object.entries(parsed.drafts).filter((entry): entry is [string, CanvasPromptDocument] => (
      isCanvasPromptDocument(entry[1])
    )));
  } catch {
    return {};
  }
}

function persistComposerDrafts(projectId: string, drafts: Record<string, CanvasPromptDocument>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(composerDraftStorageKey(projectId), JSON.stringify({ version: 1, drafts }));
  } catch {
    // 草稿仍保留在当前画布内存中；浏览器拒绝存储时不能中断正常输入。
  }
}

function loadComposerReferenceDrafts(projectId: string): Record<string, CanvasResourceReferenceAttrs[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(composerReferenceDraftStorageKey(projectId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.drafts)) return {};
    return Object.fromEntries(Object.entries(parsed.drafts).filter((entry): entry is [string, CanvasResourceReferenceAttrs[]] => (
      Array.isArray(entry[1]) && entry[1].every(isCanvasResourceReference)
    )));
  } catch {
    return {};
  }
}

function persistComposerReferenceDrafts(projectId: string, drafts: Record<string, CanvasResourceReferenceAttrs[]>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(composerReferenceDraftStorageKey(projectId), JSON.stringify({ version: 1, drafts }));
  } catch {
    // 引用草稿仅影响下一次生成；存储失败时仍保留当前画布内存，不能中断输入。
  }
}

function filterComposerDrafts(
  drafts: Record<string, CanvasPromptDocument>,
  nodeIds: ReadonlySet<string>,
): Record<string, CanvasPromptDocument> {
  const allowedKeys = new Set([...nodeIds].flatMap((nodeId) => (
    COMPOSER_DRAFT_KINDS.map((kind) => composerDraftKey(nodeId, kind))
  )));
  const entries = Object.entries(drafts).filter(([key]) => allowedKeys.has(key));
  return entries.length === Object.keys(drafts).length ? drafts : Object.fromEntries(entries);
}

function filterComposerReferenceDrafts(
  drafts: Record<string, CanvasResourceReferenceAttrs[]>,
  nodeIds: ReadonlySet<string>,
): Record<string, CanvasResourceReferenceAttrs[]> {
  const allowedKeys = new Set([...nodeIds].flatMap((nodeId) => (
    COMPOSER_DRAFT_KINDS.map((kind) => composerDraftKey(nodeId, kind))
  )));
  const entries = Object.entries(drafts).filter(([key]) => allowedKeys.has(key));
  return entries.length === Object.keys(drafts).length ? drafts : Object.fromEntries(entries);
}

function removeNodeComposerDrafts(
  projectId: string,
  drafts: Record<string, CanvasPromptDocument>,
  nodeIds: ReadonlySet<string>,
) {
  const deletedKeys = new Set([...nodeIds].flatMap((nodeId) => (
    COMPOSER_DRAFT_KINDS.map((kind) => composerDraftKey(nodeId, kind))
  )));
  const next = Object.fromEntries(Object.entries(drafts).filter(([key]) => !deletedKeys.has(key)));
  if (Object.keys(next).length !== Object.keys(drafts).length) persistComposerDrafts(projectId, next);
  return next;
}

function removeNodeComposerReferenceDrafts(
  projectId: string,
  drafts: Record<string, CanvasResourceReferenceAttrs[]>,
  nodeIds: ReadonlySet<string>,
) {
  const deletedKeys = new Set([...nodeIds].flatMap((nodeId) => (
    COMPOSER_DRAFT_KINDS.map((kind) => composerDraftKey(nodeId, kind))
  )));
  const next = Object.fromEntries(Object.entries(drafts).filter(([key]) => !deletedKeys.has(key)));
  if (Object.keys(next).length !== Object.keys(drafts).length) persistComposerReferenceDrafts(projectId, next);
  return next;
}

function isCanvasPromptDocument(value: unknown): value is CanvasPromptDocument {
  return isRecord(value)
    && value.schemaVersion === 1
    && value.format === "tiptap-json"
    && typeof value.plainText === "string"
    && isRecord(value.content)
    && value.content.type === "doc";
}

function isCanvasResourceReference(value: unknown): value is CanvasResourceReferenceAttrs {
  return isRecord(value)
    && typeof value.referenceId === "string"
    && (value.sourceType === "canvas-node" || value.sourceType === "asset")
    && typeof value.sourceId === "string"
    && (value.mediaType === "text" || value.mediaType === "image" || value.mediaType === "video" || value.mediaType === "audio")
    && typeof value.label === "string"
    && (value.role === "reference" || value.role === "first-frame" || value.role === "last-frame");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
