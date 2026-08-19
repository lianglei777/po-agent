"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyEdgeChanges, applyNodeChanges, type Node, type Edge, type Connection, type NodeChange, type EdgeChange } from "@xyflow/react";
import { Button, Dropdown, message } from "antd";
import { Plus } from "@/components/icons";
import { pipelineApi } from "./pipeline-api";
import type { CanvasEdge, CanvasNode, PipelineAsset, PipelineStageStatus, StoryboardFrame } from "@/contracts/pipeline";
import { PipelineCanvas } from "./pipeline-canvas";
import { PipelineInspector } from "./pipeline-inspector";
import { ProjectDetailSidebar, type StageInfo } from "./project-detail-sidebar";
import { PipelineAiPanel, type AiMessage } from "./pipeline-ai-panel";

export type PipelineStageId = "script" | "assets" | "storyboard" | "video" | "assembly";

const STAGE_NODE_TYPES: Record<string, string[]> = {
  script: [],
  assets: ["character", "scene", "prop"],
  storyboard: ["storyboard"],
  video: ["video"],
  assembly: [],
};

export type ProjectDetailViewProps = {
  projectId: string;
  projectTitle: string;
  onBack: () => void;
};

export function ProjectDetailView({
  projectId,
  projectTitle,
  onBack,
}: ProjectDetailViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<PipelineStageId | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [aiInputValue, setAiInputValue] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [assets, setAssets] = useState<PipelineAsset[]>([]);
  const [frames, setFrames] = useState<StoryboardFrame[]>([]);
  const [agentSessionId, setAgentSessionId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string; entityId: string; nodeType: string } | null>(null);
  const currentAssistantTextRef = useRef<string>("");
  const rfInstance = useRef<{ fitView?: () => void } | null>(null);

  const refreshCanvas = useCallback(() => {
    Promise.all([
      pipelineApi.getStageStatuses(projectId),
      pipelineApi.getCanvasState(projectId),
      pipelineApi.listAssets(projectId),
      pipelineApi.listFrames(projectId),
    ]).then(([stageData, canvasData, assetData, frameData]) => {
      setStages(stageData.stages.map((s: PipelineStageStatus) => ({
        id: s.stage, status: s.status, statusLabel: s.statusLabel,
      })) as StageInfo[]);
      const assetList = assetData.assets as PipelineAsset[];
      const frameList = frameData.frames as StoryboardFrame[];
      setAssets(assetList);
      setFrames(frameList);
      const assetMap = new Map(assetList.map((a) => [a.id, a]));
      const frameMap = new Map(frameList.map((f) => [f.id, f]));
      setNodes(canvasData.nodes.map((n: CanvasNode) => {
        const data: Record<string, unknown> = { entityId: n.entityId, projectId: n.projectId, __type: n.type };
        if (n.type === "character" || n.type === "scene" || n.type === "prop") {
          const asset = assetMap.get(n.entityId);
          if (asset) { data.label = asset.name; data.description = asset.description; data.status = asset.status; data.locked = asset.locked; }
        } else if (n.type === "storyboard") {
          const frame = frameMap.get(n.entityId);
          if (frame) { data.label = "Frame " + (frame.index + 1); data.description = frame.visualDescription ?? ""; data.status = frame.status; data.locked = frame.locked; }
        } else if (n.type === "video") {
          data.label = "Video"; data.status = "processing";
        }
        return { id: n.id, type: n.type, position: { x: n.positionX, y: n.positionY }, data };
      }) as Node[]);
      const edgeStyles: Record<string, { stroke: string; strokeWidth: number; strokeDasharray?: string }> = {
        references: { stroke: "var(--pl-text-muted)", strokeWidth: 1.5 },
        source_of: { stroke: "var(--pl-accent)", strokeWidth: 2 },
        generates: { stroke: "var(--pl-text-muted)", strokeWidth: 1.5, strokeDasharray: "5 3" },
        derives_from: { stroke: "var(--pl-text-muted)", strokeWidth: 1, strokeDasharray: "1 3" },
      };
      setEdges(canvasData.edges.map((e: CanvasEdge) => ({
        id: e.id, source: e.sourceNodeId, target: e.targetNodeId,
        type: "default", data: { edgeType: e.edgeType, projectId: e.projectId },
        style: edgeStyles[e.edgeType] ?? edgeStyles.references,
      })) as Edge[]);
    }).catch((err) => {
      message.error(err instanceof Error ? err.message : String(err));
    });
  }, [projectId]);

  const handleAgentEvent = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;
    if (type === "agent_start") {
      setAiBusy(true);
      currentAssistantTextRef.current = "";
      setAiMessages((prev) => [...prev, { id: crypto.randomUUID(), type: "assistant", text: "" }]);
    } else if (type === "message_update" || type === "message_end") {
      const msg = data.message as { content?: Array<{ type: string; text?: string }> };
      const text = msg?.content?.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") ?? "";
      if (text && text !== currentAssistantTextRef.current) {
        currentAssistantTextRef.current = text;
        setAiMessages((prev) => {
         const last = prev[prev.length - 1];
          if (last && last.type === "assistant") return [...prev.slice(0, -1), { ...last, text }];
          return prev;
        });
      }
    } else if (type === "tool_execution_start") {
      setAiMessages((prev) => [...prev, { id: crypto.randomUUID(), type: "tool_call", toolName: data.toolName as string, text: "" }]);
    } else if (type === "agent_end") {
      setAiBusy(false);
    } else if (type === "agent_error") {
      setAiBusy(false);
      const error = data.error as { message?: string } | undefined;
      setAiMessages((prev) => [...prev, { id: crypto.randomUUID(), type: "error", text: error?.message ?? "Agent 错误" }]);
    }
  }, []);

  useEffect(() => {
    pipelineApi.createPipelineAgentSession(projectId).then((res) => {
      setAgentSessionId(res.sessionId);
    }).catch(() => {});
    refreshCanvas();
    const pipelineSse = new EventSource(`/api/pipeline/projects/${projectId}/sse`);
    pipelineSse.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { type: string; payload: unknown };
        if (data.type === "generation_progress" || data.type === "generation_failed") {
          const p = data.payload as { assetId?: string; frameId?: string };
          const targetId = p?.assetId ?? p?.frameId;
          const newStatus = data.type === "generation_progress" ? "processing" : "failed";
          setNodes((prev) => prev.map((n) => {
            const d = n.data as { entityId?: string };
            return d?.entityId === targetId ? { ...n, data: { ...n.data, status: newStatus } } : n;
          }));
        } else {
          refreshCanvas();
        }
      } catch {
        refreshCanvas();
      }
    };
    pipelineSse.onerror = () => {};
    return () => { pipelineSse.close(); setAgentSessionId(null); };
  }, [projectId, refreshCanvas]);

  useEffect(() => {
    if (!agentSessionId) return;
    const agentSse = new EventSource(`/api/agent/${agentSessionId}/events`);
    agentSse.onmessage = (event) => {
      try { handleAgentEvent(JSON.parse(event.data)); } catch {}
    };
    agentSse.onerror = () => {};
    return () => { agentSse.close(); };
  }, [agentSessionId, handleAgentEvent]);

  const historyRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const redoRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);

  const pushHistory = useCallback(() => {
    historyRef.current.push({ nodes: [...nodes], edges: [...edges] });
    redoRef.current = [];
  }, [nodes, edges]);

  const handleUndo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    redoRef.current.push({ nodes: [...nodes], edges: [...edges] });
    setNodes(prev.nodes);
    setEdges(prev.edges);
  }, [nodes, edges]);

  const handleRedo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    historyRef.current.push({ nodes: [...nodes], edges: [...edges] });
    setNodes(next.nodes);
    setEdges(next.edges);
  }, [nodes, edges]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);
  const handleNodeDragStop = useCallback((_: unknown, node: Node) => {
    pipelineApi.updateNodePosition(projectId, node.id, node.position.x, node.position.y).catch(() => {});
  }, [projectId]);

  const handleConnect = useCallback((connection: Connection) => {
    pushHistory();
    if (!connection.source || !connection.target) return;
    pipelineApi.createCanvasEdge(projectId, connection.source, connection.target, "references").then(() => refreshCanvas()).catch(() => {});
  }, [projectId, refreshCanvas, pushHistory]);

  const handleNodeDelete = useCallback((nodeId: string) => {
    pushHistory();
    pipelineApi.deleteCanvasNode(projectId, nodeId).then(() => refreshCanvas()).catch(() => {});
  }, [projectId, refreshCanvas, pushHistory]);

  const handleCreateNode = useCallback((type: "character" | "scene" | "prop" | "frame") => {
    pushHistory();
    const count = nodes.length;
    const x = 200 + (count % 5) * 250;
    const y = 200 + Math.floor(count / 5) * 200;
    if (type === "frame") {
      pipelineApi.createFrame(projectId, { visualDescription: "New frame", positionX: x, positionY: y }).then(() => refreshCanvas()).catch(() => {});
    } else {
      pipelineApi.createAsset(projectId, { type, name: "Untitled", description: "", positionX: x, positionY: y }).then(() => refreshCanvas()).catch(() => {});
    }
  }, [projectId, refreshCanvas, nodes.length, pushHistory]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }, []);

  const onNodeDragStart = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    const d = node.data as { __type?: string; entityId?: string } | undefined;
    setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id, entityId: d?.entityId ?? "", nodeType: d?.__type ?? "" });
  }, []);

  const handleCopyNode = useCallback(() => {
    const sn = nodes.find((n) => n.id === selectedNodeId);
    if (!sn) return;
    const d = sn.data as { __type?: string; label?: string; description?: string; entityId?: string } | undefined;
    if (!d?.entityId) return;
    pushHistory();
    if (d.__type === "character" || d.__type === "scene" || d.__type === "prop") {
      pipelineApi.createAsset(projectId, { type: d.__type, name: (d.label ?? "Untitled") + " Copy", description: d.description ?? "", positionX: (sn.position.x ?? 0) + 40, positionY: (sn.position.y ?? 0) + 40 }).then(() => refreshCanvas()).catch(() => {});
    } else if (d.__type === "storyboard") {
      pipelineApi.createFrame(projectId, { visualDescription: d.description ?? "New frame", positionX: (sn.position.x ?? 0) + 40, positionY: (sn.position.y ?? 0) + 40 }).then(() => refreshCanvas()).catch(() => {});
    }
  }, [nodes, selectedNodeId, projectId, pushHistory, refreshCanvas]);

  const handleContextMenuClick = useCallback(({ key }: { key: string }) => {
    if (!contextMenu) return;
    const { entityId, nodeId } = contextMenu;
    if (key === "generate-image" && entityId) pipelineApi.generateAssetImage(entityId, projectId).then(() => refreshCanvas()).catch(() => {});
    else if (key === "generate-frame-image" && entityId) pipelineApi.generateFrameImage(entityId, projectId).then(() => refreshCanvas()).catch(() => {});
    else if (key === "i2v" && entityId) pipelineApi.generateVideo(entityId, projectId, "i2v").then(() => refreshCanvas()).catch(() => {});
    else if (key === "r2v" && entityId) pipelineApi.generateVideo(entityId, projectId, "r2v").then(() => refreshCanvas()).catch(() => {});
    else if (key === "copy") handleCopyNode();
    else if (key === "delete") handleNodeDelete(nodeId);
    setContextMenu(null);
  }, [contextMenu, projectId, refreshCanvas, handleCopyNode, handleNodeDelete]);

  const contextMenuItems = useMemo(() => {
    if (!contextMenu) return [];
    const items: Array<{ key: string; label: string; danger?: boolean }> = [];
    if (contextMenu.nodeType === "character" || contextMenu.nodeType === "scene" || contextMenu.nodeType === "prop") {
      items.push({ key: "generate-image", label: "Generate Image" });
      items.push({ key: "copy", label: "Copy" });
    } else if (contextMenu.nodeType === "storyboard") {
      items.push({ key: "generate-frame-image", label: "Generate Frame Image" });
      items.push({ key: "i2v", label: "Generate I2V" });
      items.push({ key: "r2v", label: "Generate R2V" });
    }
    items.push({ key: "delete", label: "Delete", danger: true });
    return items;
  }, [contextMenu]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelectedNodeId(null); setContextMenu(null); }
      if ((e.ctrlKey || e.metaKey) && e.key === "d") { e.preventDefault(); handleCopyNode(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "a") { e.preventDefault(); setNodes((prev) => prev.map((n) => ({ ...n, selected: true }))); }
      if ((e.ctrlKey || e.metaKey) && e.key === "1") { e.preventDefault(); setActiveStage("script"); }
      if ((e.ctrlKey || e.metaKey) && e.key === "2") { e.preventDefault(); setActiveStage("assets"); }
      if ((e.ctrlKey || e.metaKey) && e.key === "3") { e.preventDefault(); setActiveStage("storyboard"); }
      if ((e.ctrlKey || e.metaKey) && e.key === "4") { e.preventDefault(); setActiveStage("video"); }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") { e.preventDefault(); setActiveStage(null); }
      if (e.key === "f" && !e.ctrlKey && !e.metaKey) { rfInstance.current?.fitView?.(); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "I" || e.key === "i")) { e.preventDefault(); setInspectorOpen((prev) => !prev); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCopyNode]);

  const handleAiSend = useCallback(() => {
    if (!aiInputValue.trim() || aiBusy) return;
    const userMsg: AiMessage = { id: crypto.randomUUID(), type: "user", text: aiInputValue.trim() };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiInputValue("");
    setAiBusy(true);
    if (!agentSessionId) {
      setAiMessages((prev) => [...prev, { id: crypto.randomUUID(), type: "error", text: "Agent 会话未就绪" }]);
      setAiBusy(false);
      return;
    }
    const turnId = `pipeline:${crypto.randomUUID()}`;
    pipelineApi.sendAgentTurn(agentSessionId, turnId, userMsg.text).catch((err) => {
      setAiMessages((prev) => [...prev, { id: crypto.randomUUID(), type: "error", text: `发送失败: ${err instanceof Error ? err.message : String(err)}` }]);
      setAiBusy(false);
    });
  }, [aiInputValue, aiBusy, agentSessionId]);

  const displayNodes = useMemo(() => {
    if (!activeStage) return nodes;
    const types = STAGE_NODE_TYPES[activeStage] ?? [];
    return nodes.map((n) => ({ ...n, style: n.type != null && types.includes(n.type) ? undefined : { opacity: 0.15 } }));
  }, [nodes, activeStage]);

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    if (id) setInspectorOpen(true);
  }, []);


  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ProjectDetailSidebar
        projectTitle={projectTitle}
        stages={stages}
        activeStage={activeStage}
        onStageClick={(id) => setActiveStage((c) => (c === id ? null : id))}
        onBack={onBack}
      />
      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-w-0 flex-1">
          <div className="absolute right-4 top-4 z-10">
            <Dropdown
              menu={{
                items: [
                  { key: "character", label: "New Character" },
                  { key: "scene", label: "New Scene" },
                  { key: "prop", label: "New Prop" },
                  { key: "frame", label: "New Frame" },
                ],
                onClick: ({ key }) => handleCreateNode(key as "character" | "scene" | "prop" | "frame"),
              }}
            >
              <Button type="primary" icon={<Plus className="size-4" />}>Add Node</Button>
            </Dropdown>
          </div>
          <PipelineCanvas
            nodes={displayNodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onNodeDelete={handleNodeDelete}
            onNodeContextMenu={handleNodeContextMenu}
            onInit={(inst) => { rfInstance.current = inst as { fitView?: () => void }; }}
         />
          </div>
          <PipelineAiPanel
            messages={aiMessages}
            inputValue={aiInputValue}
            onInputChange={setAiInputValue}
            onSend={handleAiSend}
            busy={aiBusy}
          />
        </div>
        {inspectorOpen ? (
          <PipelineInspector
            selectedNode={selectedNode}
            projectId={projectId}
            onRefresh={refreshCanvas}
            onClose={() => { setInspectorOpen(false); setSelectedNodeId(null); }}
          />
        ) : null}
      </div>
      {contextMenu && (
        <div className="fixed z-50" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <Dropdown
            menu={{ items: contextMenuItems, onClick: handleContextMenuClick }}
            open={true}
            onOpenChange={(open) => { if (!open) setContextMenu(null); }}
          >
            <div className="h-1 w-1" />
          </Dropdown>
        </div>
      )}
    </div>
  );
}
