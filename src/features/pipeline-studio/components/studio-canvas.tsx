"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Drawer, Dropdown, Input, Modal, Tooltip, message } from "antd";
import type { CanvasMediaType, CanvasNode } from "@/contracts/pipeline";
import {
  ArrowLeft,
  ChevronDown,
  Clock3,
  FileMusic,
  FileText,
  Images,
  Minimize2,
  PanelLeft,
  Paperclip,
  Plus,
  Project,
  Settings2,
  FileVideo,
} from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { useCanvasStore, useCanvasStoreApi } from "../state/canvas-store";
import { reconcileStudioFlowNodes, type StudioFlowNode } from "../model/studio-flow-nodes";
import { studioNodeTypes } from "../nodes/studio-canvas-node";

const CLIPBOARD_KEY = "po:pipeline-studio-clipboard-v2";

type CreateMenuState = { screenX: number; screenY: number; flowX: number; flowY: number } | null;
type PlaceholderPanel = "assets" | "shortcuts" | null;

type ClipboardBundle = {
  version: 2;
  nodes: Array<{
    type: CanvasMediaType;
    data: CanvasNode["data"];
    offsetX: number;
    offsetY: number;
  }>;
  edges: Array<{ sourceIndex: number; targetIndex: number }>;
};

export function StudioCanvas({
  projectId,
  projectTitle,
  onBack,
  onRenameProject,
}: {
  projectId: string;
  projectTitle: string;
  onBack: () => void;
  onRenameProject: (title: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const store = useCanvasStoreApi();
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);
  const viewport = useCanvasStore((state) => state.viewport);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const editingNodeId = useCanvasStore((state) => state.editingNodeId);
  const interactionMode = useCanvasStore((state) => state.interactionMode);
  const connectionsVisible = useCanvasStore((state) => state.connectionsVisible);
  const minimapVisible = useCanvasStore((state) => state.minimapVisible);
  const loaded = useCanvasStore((state) => state.loaded);
  const saveState = useCanvasStore((state) => state.saveState);
  const error = useCanvasStore((state) => state.error);
  const createNode = useCanvasStore((state) => state.createNode);
  const insertServerNode = useCanvasStore((state) => state.insertServerNode);
  const deleteNodes = useCanvasStore((state) => state.deleteNodes);
  const duplicateNodes = useCanvasStore((state) => state.duplicateNodes);
  const createEdge = useCanvasStore((state) => state.createEdge);
  const deleteEdges = useCanvasStore((state) => state.deleteEdges);
  const setSelection = useCanvasStore((state) => state.setSelection);
  const setViewport = useCanvasStore((state) => state.setViewport);
  const setInteractionMode = useCanvasStore((state) => state.setInteractionMode);
  const toggleConnections = useCanvasStore((state) => state.toggleConnections);
  const toggleMinimap = useCanvasStore((state) => state.toggleMinimap);
  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);

  const instanceRef = useRef<ReactFlowInstance<StudioFlowNode, Edge> | null>(null);
  const dragOriginsRef = useRef(new Map<string, { x: number; y: number }>());
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [createMenu, setCreateMenu] = useState<CreateMenuState>(null);
  const [placeholderPanel, setPlaceholderPanel] = useState<PlaceholderPanel>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(projectTitle);
  const [reactFlowNodes, setReactFlowNodes] = useState<StudioFlowNode[]>([]);
  const defaultNodeNames = useMemo<Record<CanvasMediaType, string>>(() => ({
    text: t.pipeline.nodeText,
    image: t.pipeline.nodeImage,
    video: t.pipeline.nodeVideo,
    audio: t.pipeline.nodeAudio,
  }), [t.pipeline.nodeAudio, t.pipeline.nodeImage, t.pipeline.nodeText, t.pipeline.nodeVideo]);

  const flowNodes = useMemo(() => reconcileStudioFlowNodes(reactFlowNodes, nodes, {
    selectedNodeIds,
    editingNodeId,
    interactionMode,
  }), [editingNodeId, interactionMode, nodes, reactFlowNodes, selectedNodeIds]);

  const flowEdges = useMemo<Edge[]>(() => connectionsVisible ? edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    style: { stroke: "#168cff", strokeWidth: 1.6, opacity: 0.72 },
  })) : [], [connectionsVisible, edges]);

  const createAt = useCallback((type: CanvasMediaType, position?: { x: number; y: number }, name?: string) => {
    const instance = instanceRef.current;
    const target = position ?? (instance
      ? instance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 200, y: 160 });
    createNode(type, target, name ?? defaultNodeNames[type]);
    setCreateMenu(null);
  }, [createNode, defaultNodeNames]);

  const uploadFiles = useCallback(async (
    files: File[],
    position?: { x: number; y: number },
    targetNodeId?: string,
  ) => {
    if (!files.length) return;
    const instance = instanceRef.current;
    const origin = position ?? (instance
      ? instance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 180, y: 140 });
    try {
      for (let index = 0; index < files.length; index += 1) {
        const result = await pipelineStudioApi.uploadFile(
          projectId,
          files[index],
          origin.x + index * 36,
          origin.y + index * 36,
          index === 0 ? targetNodeId : undefined,
        );
        insertServerNode(result.node);
      }
    } catch (uploadError) {
      message.error(uploadError instanceof Error ? uploadError.message : String(uploadError));
    }
  }, [insertServerNode, projectId]);

  const copySelection = useCallback(() => {
    const selected = nodes.filter((node) => selectedNodeIds.includes(node.id));
    if (!selected.length) return;
    const minX = Math.min(...selected.map((node) => node.positionX));
    const minY = Math.min(...selected.map((node) => node.positionY));
    const indexById = new Map(selected.map((node, index) => [node.id, index]));
    const bundle: ClipboardBundle = {
      version: 2,
      nodes: selected.flatMap((node) => node.data && ["text", "image", "video", "audio"].includes(node.data.type) ? [{
        type: node.data.type,
        data: structuredClone(node.data),
        offsetX: node.positionX - minX,
        offsetY: node.positionY - minY,
      }] : []),
      edges: edges.flatMap((edge) => {
        const sourceIndex = indexById.get(edge.sourceNodeId);
        const targetIndex = indexById.get(edge.targetNodeId);
        return sourceIndex === undefined || targetIndex === undefined ? [] : [{ sourceIndex, targetIndex }];
      }),
    };
    window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(bundle));
  }, [edges, nodes, selectedNodeIds]);

  const pasteSelection = useCallback(() => {
    const raw = window.localStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return;
    try {
      const bundle = JSON.parse(raw) as ClipboardBundle;
      if (bundle.version !== 2 || !bundle.nodes.length) return;
      const instance = instanceRef.current;
      const origin = instance
        ? instance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
        : { x: 220, y: 180 };
      const createdIds = bundle.nodes.map((template) => {
        const node = createNode(template.type, { x: origin.x + template.offsetX, y: origin.y + template.offsetY }, template.data?.name ?? defaultNodeNames[template.type]);
        if (template.data) store.getState().updateNodeData(node.id, { ...structuredClone(template.data), taskInfo: { status: "idle" } });
        return node.id;
      });
      for (const edge of bundle.edges) {
        const source = createdIds[edge.sourceIndex];
        const target = createdIds[edge.targetIndex];
        if (source && target) createEdge(source, target);
      }
      setSelection(createdIds);
    } catch {
      message.error(t.pipeline.canvasClipboardInvalid);
    }
  }, [createEdge, createNode, defaultNodeNames, setSelection, store, t.pipeline.canvasClipboardInvalid]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditingTarget(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
      } else if (modifier && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSelection();
      } else if (modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateNodes(selectedNodeIds);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteNodes(selectedNodeIds);
      } else if (event.key.toLowerCase() === "f") {
        instanceRef.current?.fitView({ padding: 0.2, duration: 220 });
      } else if (event.key.toLowerCase() === "v") {
        setInteractionMode("select");
      } else if (event.key.toLowerCase() === "h") {
        setInteractionMode("pan");
      } else if (event.key === "Escape") {
        setCreateMenu(null);
        setSelection([]);
      }
    };
    const handlePaste = (event: ClipboardEvent) => {
      if (isEditingTarget(event.target)) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) return;
      const selectedImage = selectedNodeIds.length === 1
        ? nodes.find((node) => node.id === selectedNodeIds[0] && node.data?.type === "image")
        : undefined;
      const targetNodeId = files.length === 1 && files[0].type.startsWith("image/")
        ? selectedImage?.id
        : undefined;
      void uploadFiles(files, undefined, targetNodeId);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
    };
  }, [copySelection, deleteNodes, duplicateNodes, nodes, pasteSelection, redo, selectedNodeIds, setInteractionMode, setSelection, undo, uploadFiles]);

  const handleNodesChange = useCallback((changes: NodeChange<StudioFlowNode>[]) => {
    setReactFlowNodes((currentNodes) => {
      const state = store.getState();
      const syncedNodes = reconcileStudioFlowNodes(currentNodes, state.nodes, {
        selectedNodeIds: state.selectedNodeIds,
        editingNodeId: state.editingNodeId,
        interactionMode: state.interactionMode,
      });
      return applyNodeChanges(changes, syncedNodes);
    });
    let nextSelection: Set<string> | null = null;
    for (const change of changes) {
      if (change.type === "select") {
        nextSelection ??= new Set(store.getState().selectedNodeIds);
        if (change.selected) nextSelection.add(change.id);
        else nextSelection.delete(change.id);
      }
      if (change.type === "position" && change.position) {
        store.getState().updateNodePositionLive(change.id, change.position);
      }
      if (change.type === "remove") deleteNodes([change.id]);
    }
    if (nextSelection) setSelection([...nextSelection]);
  }, [deleteNodes, setSelection, store]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const removed = changes.filter((change) => change.type === "remove").map((change) => change.id);
    if (removed.length) deleteEdges(removed);
  }, [deleteEdges]);

  const openCreateMenu = useCallback((event: MouseEvent | globalThis.MouseEvent) => {
    event.preventDefault();
    const instance = instanceRef.current;
    if (!instance) return;
    const flow = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setCreateMenu({ screenX: event.clientX, screenY: event.clientY, flowX: flow.x, flowY: flow.y });
  }, []);

  if (!loaded) {
    return <div className="flex h-full flex-1 items-center justify-center bg-[var(--pl-surface)] text-sm text-[var(--pl-text-muted)]">{t.pipeline.canvasLoading}</div>;
  }

  return (
    <div className="relative h-full min-w-0 flex-1 overflow-hidden bg-[var(--pl-surface)]" onClick={() => setCreateMenu(null)}>
      <TopCanvasBar
        projectTitle={projectTitle}
        saveState={saveState}
        onBack={onBack}
        onRename={() => { setRenameValue(projectTitle); setRenameOpen(true); }}
        onFit={() => instanceRef.current?.fitView({ padding: 0.2, duration: 220 })}
      />

      <div
        className="h-full w-full"
        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault();
          const instance = instanceRef.current;
          if (!instance || !event.dataTransfer.files.length) return;
          void uploadFiles(Array.from(event.dataTransfer.files), instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        }}
      >
        <ReactFlow<StudioFlowNode, Edge>
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={studioNodeTypes}
          viewport={viewport}
          onViewportChange={(nextViewport) => setViewport(nextViewport)}
          onMoveEnd={(_, nextViewport) => setViewport(nextViewport, true)}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodeClick={(event, node) => {
            if (event.metaKey || event.ctrlKey) {
              setSelection(selectedNodeIds.includes(node.id)
                ? selectedNodeIds.filter((nodeId) => nodeId !== node.id)
                : [...selectedNodeIds, node.id]);
              return;
            }
            setSelection([node.id]);
          }}
          onPaneClick={() => {
            setCreateMenu(null);
            setSelection([]);
          }}
          onNodeDragStart={(_, node) => {
            dragOriginsRef.current.set(node.id, { x: node.position.x, y: node.position.y });
            if (!selectedNodeIds.includes(node.id)) setSelection([node.id]);
          }}
          onNodeDragStop={(_, node) => {
            const previous = dragOriginsRef.current.get(node.id);
            if (previous) store.getState().commitNodePosition(node.id, previous);
            dragOriginsRef.current.delete(node.id);
          }}
          onConnect={(connection: Connection) => {
            if (connection.source && connection.target) createEdge(connection.source, connection.target);
          }}
          onPaneContextMenu={openCreateMenu}
          onInit={(instance) => { instanceRef.current = instance; }}
          selectionOnDrag={interactionMode === "select"}
          panOnDrag={interactionMode === "pan" ? [0, 1, 2] : [1, 2]}
          nodesDraggable={interactionMode === "select"}
          multiSelectionKeyCode={["Meta", "Control"]}
          deleteKeyCode={null}
          minZoom={0.05}
          maxZoom={4}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#29313a" />
          {minimapVisible ? (
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              className="!bottom-20 !left-5 !rounded-xl !border !border-[var(--pl-border)] !bg-[var(--pl-surface-elevated)]"
              maskColor="rgb(16 18 20 / 68%)"
              nodeColor="#168cff"
            />
          ) : null}
        </ReactFlow>
      </div>

      {!nodes.length ? <EmptyCanvasActions onCreate={createAt} /> : null}

      <BottomLeftControls
        zoom={viewport.zoom}
        minimapVisible={minimapVisible}
        connectionsVisible={connectionsVisible}
        onOpenAssets={() => setPlaceholderPanel("assets")}
        onToggleMinimap={toggleMinimap}
        onToggleConnections={toggleConnections}
        onZoomOut={() => instanceRef.current?.zoomOut({ duration: 160 })}
        onZoomIn={() => instanceRef.current?.zoomIn({ duration: 160 })}
      />

      <BottomCenterToolbar
        onCreate={() => {
          const instance = instanceRef.current;
          const center = instance
            ? instance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
            : { x: 200, y: 160 };
          setCreateMenu({ screenX: window.innerWidth / 2 - 90, screenY: window.innerHeight - 150, flowX: center.x, flowY: center.y });
        }}
        onOpenShortcuts={() => setPlaceholderPanel("shortcuts")}
      />

      <input
        ref={uploadInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*,video/*,audio/*,.txt,.md,text/plain,text/markdown"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length) void uploadFiles(files);
        }}
      />

      {createMenu ? (
        <CreateMenu
          screenX={createMenu.screenX}
          screenY={createMenu.screenY}
          onCreate={(type) => createAt(type, { x: createMenu.flowX, y: createMenu.flowY })}
          onUpload={() => { setCreateMenu(null); uploadInputRef.current?.click(); }}
        />
      ) : null}

      <Drawer
        open={Boolean(placeholderPanel)}
        onClose={() => setPlaceholderPanel(null)}
        title={placeholderTitle(placeholderPanel, t.pipeline)}
        size={360}
        mask={{ closable: false }}
      >
        <p className="text-sm leading-6 text-[var(--pl-text-secondary)]">
          {t.pipeline.canvasPlaceholderBody}
        </p>
      </Drawer>

      <Modal
        title={t.pipeline.canvasRenameTitle}
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={async () => {
          await onRenameProject(renameValue);
          setRenameOpen(false);
        }}
        mask={{ closable: false }}
        keyboard={false}
      >
        <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
      </Modal>

      {error ? <div className="absolute right-5 top-20 z-30 max-w-sm rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}
    </div>
  );
}

function TopCanvasBar({
  projectTitle,
  saveState,
  onBack,
  onRename,
  onFit,
}: {
  projectTitle: string;
  saveState: string;
  onBack: () => void;
  onRename: () => void;
  onFit: () => void;
}) {
  const { t } = useI18n();
  const menuItems = [
    { key: "back", label: t.pipeline.canvasBackProjects },
    { key: "rename", label: t.pipeline.canvasRenameProject },
  ];
  return (
    <header className="pointer-events-none absolute left-4 top-4 z-30 flex h-12 items-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]/95 p-1.5 shadow-[var(--pl-shadow-card)] backdrop-blur">
        <Tooltip title={t.pipeline.canvasBackProjects}>
          <button type="button" onClick={onBack} className="flex size-9 items-center justify-center rounded-xl text-[var(--pl-text)] hover:bg-[var(--pl-surface-hover)]">
            <ArrowLeft className="size-4" />
          </button>
        </Tooltip>
        <Dropdown menu={{ items: menuItems, onClick: ({ key }) => key === "back" ? onBack() : onRename() }}>
          <button type="button" className="flex h-9 max-w-72 items-center gap-2 rounded-xl border border-[var(--pl-border)] bg-[var(--pl-surface)] px-3 text-sm font-medium text-[var(--pl-text)] hover:bg-[var(--pl-surface-hover)]">
            <Project className="size-4 text-[var(--pl-accent)]" />
            <span className="truncate">{projectTitle}</span>
            <ChevronDown className="size-3 text-[var(--pl-text-muted)]" />
          </button>
        </Dropdown>
        <Tooltip title={t.pipeline.canvasFit}>
          <button type="button" onClick={onFit} className="flex size-9 items-center justify-center rounded-xl text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]">
            <Minimize2 className="size-4" />
          </button>
        </Tooltip>
        <span className="px-2 text-[10px] text-[var(--pl-text-muted)]">{saveLabel(saveState, t.pipeline)}</span>
      </div>
    </header>
  );
}
function EmptyCanvasActions({ onCreate }: { onCreate: (type: CanvasMediaType, position?: { x: number; y: number }, name?: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="pointer-events-auto mt-10 w-[min(380px,calc(100%-64px))]">
        <div className="mb-8 text-center text-sm text-[var(--pl-text-muted)]">
          <strong className="font-semibold text-[var(--pl-text-secondary)]">{t.pipeline.canvasEmptyCreateHint}</strong>
        </div>
        <button
          type="button"
          onClick={() => onCreate("text", undefined, t.pipeline.canvasStoryScript)}
          className="flex h-20 w-full items-center gap-4 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] px-4 text-left text-sm font-semibold text-[var(--pl-text)] hover:border-[var(--pl-border-strong)] hover:bg-[var(--pl-surface-hover)]"
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]">
            <FileText className="size-5" />
          </span>
          <span>{t.pipeline.canvasStoryScript}</span>
        </button>
      </div>
    </div>
  );
}
function BottomLeftControls({ zoom, minimapVisible, connectionsVisible, onOpenAssets, onToggleMinimap, onToggleConnections, onZoomOut, onZoomIn }: {
  zoom: number;
  minimapVisible: boolean;
  connectionsVisible: boolean;
  onOpenAssets: () => void;
  onToggleMinimap: () => void;
  onToggleConnections: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="absolute bottom-5 left-5 z-30 flex h-12 items-center rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]/96 px-2 shadow-[var(--pl-shadow-card)] backdrop-blur">
      <ToolButton title={t.pipeline.canvasAssetManagement} icon={<PanelLeft className="size-4" />} label={t.pipeline.canvasAssetManagement} onClick={onOpenAssets} />
      <ToolButton title={minimapVisible ? t.pipeline.canvasHideMinimap : t.pipeline.canvasShowMinimap} icon={<Project className="size-4" />} active={minimapVisible} onClick={onToggleMinimap} />
      <ToolButton title={connectionsVisible ? t.pipeline.canvasHideConnections : t.pipeline.canvasShowConnections} icon={<Settings2 className="size-4" />} active={connectionsVisible} onClick={onToggleConnections} />
      <ToolButton title={t.pipeline.canvasZoomOut} icon={<span className="text-lg leading-none">−</span>} onClick={onZoomOut} />
      <button type="button" onClick={onZoomIn} className="h-8 min-w-12 rounded-lg px-2 text-xs font-semibold tabular-nums text-[var(--pl-text)] hover:bg-[var(--pl-surface-hover)]">{Math.round(zoom * 100)}%</button>
    </div>
  );
}
function BottomCenterToolbar({ onCreate, onOpenShortcuts }: {
  onCreate: () => void;
  onOpenShortcuts: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="absolute bottom-5 left-1/2 z-30 flex h-14 -translate-x-1/2 items-center gap-1 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)]/96 p-1.5 shadow-[var(--pl-shadow-hover)] backdrop-blur" onClick={(event) => event.stopPropagation()}>
      <ToolButton title={t.pipeline.canvasAddNode} icon={<Plus className="size-5" />} primary onClick={onCreate} />
      <ToolButton title={t.pipeline.canvasShortcuts} icon={<Clock3 className="size-4" />} onClick={onOpenShortcuts} />
    </div>
  );
}
function ToolButton({ title, icon, label, active, primary, onClick }: { title: string; icon: ReactNode; label?: string; active?: boolean; primary?: boolean; onClick: () => void }) {
  return <Tooltip title={title}><button type="button" onClick={onClick} className={"flex h-10 items-center justify-center gap-2 rounded-xl px-3 transition-colors " + (primary ? "bg-white text-black hover:bg-slate-200" : active ? "bg-[var(--pl-accent-soft)] text-[var(--pl-accent)]" : "text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]")}>{icon}{label ? <span className="text-sm">{label}</span> : null}</button></Tooltip>;
}

function CreateMenu({ screenX, screenY, onCreate, onUpload }: { screenX: number; screenY: number; onCreate: (type: CanvasMediaType) => void; onUpload: () => void }) {
  const { t } = useI18n();
  return (
    <div className="fixed z-50 w-52 rounded-2xl border border-[var(--pl-border)] bg-[var(--pl-surface-elevated)] p-2 shadow-[var(--pl-shadow-hover)]" style={{ left: Math.min(screenX, window.innerWidth - 224), top: Math.min(screenY, window.innerHeight - 280) }} onClick={(event) => event.stopPropagation()}>
      <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.16em] text-[var(--pl-text-muted)]">{t.pipeline.canvasAddMenu}</div>
      <CreateMenuButton label={t.pipeline.canvasTextNode} icon={<FileText />} onClick={() => onCreate("text")} />
      <CreateMenuButton label={t.pipeline.canvasImageNode} icon={<Images />} onClick={() => onCreate("image")} />
      <CreateMenuButton label={t.pipeline.canvasVideoNode} icon={<FileVideo />} onClick={() => onCreate("video")} />
      <CreateMenuButton label={t.pipeline.canvasAudioNode} icon={<FileMusic />} onClick={() => onCreate("audio")} />
      <div className="my-1 h-px bg-[var(--pl-border)]" />
      <CreateMenuButton label={t.pipeline.canvasUploadMedia} icon={<Paperclip />} onClick={onUpload} />
    </div>
  );
}

function CreateMenuButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-[var(--pl-text-secondary)] hover:bg-[var(--pl-surface-hover)] hover:text-[var(--pl-text)]"><span className="text-[var(--pl-accent)]">{icon}</span>{label}</button>;
}

function placeholderTitle(panel: PlaceholderPanel, copy: ReturnType<typeof useI18n>["t"]["pipeline"]) {
  return ({ assets: copy.canvasAssetManagement, shortcuts: copy.canvasShortcuts } as const)[panel ?? "shortcuts"];
}

function saveLabel(state: string, copy: ReturnType<typeof useI18n>["t"]["pipeline"]) {
  return ({ idle: copy.canvasSaveIdle, saving: copy.canvasSaveSaving, saved: copy.canvasSaveSaved, error: copy.canvasSaveError } as Record<string, string>)[state] ?? state;
}

function isEditingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return element?.tagName === "INPUT" || element?.tagName === "TEXTAREA" || element?.isContentEditable;
}
