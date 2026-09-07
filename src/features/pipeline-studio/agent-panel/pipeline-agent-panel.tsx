"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Select, Tooltip } from "antd";
import type { AgentEvent, AgentMessage, AssistantMessage } from "@/contracts/agent";
import type { ModelInfo } from "@/contracts/models";
import type { PipelineAgentConversationResponse } from "@/contracts/pipeline-agent";
import type { CanvasNode, CanvasPromptDocument, CanvasResourceReferenceAttrs, CanvasRichTextNode, CanvasWorkflowRun } from "@/contracts/pipeline";
import { Bot, Cpu, LoaderCircle, PanelRight, PanelRightClose, Send, Sparkles, Square } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import {
  formatCanvasAgentMessage,
  parseCanvasAgentMessage,
  type CanvasAgentMessageReference,
  type ParsedCanvasAgentMessage,
} from "@/lib/canvas-agent-message";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { ResourcePreviewPopover, ResourcePreviewThumbnail } from "../components/resource-preview-thumbnail";
import { resolveCanvasMediaSource } from "../model/canvas-media-source";
import { canvasNodeReferenceAttrs } from "../model/canvas-node-reference";
import { promptDocumentFromPlainText, promptDocumentResourceAttrs } from "../model/prompt-document";
import { ResourcePromptEditor, type ResourcePromptEditorHandle } from "../prompt-editor/resource-prompt-editor";
import { useCanvasStore } from "../state/canvas-store";
import {
  EMPTY_PIPELINE_AGENT_REFERENCES,
  clearPipelineAgentReferences,
  commitPipelineAgentSelection,
  dismissPipelineAgentSelection,
  observePipelineAgentSelection,
} from "./pipeline-agent-references";
import { pipelineAgentCanvasContextReady, pipelineAgentIsRunning } from "./pipeline-agent-state";
import { PipelineAgentSkills } from "./pipeline-agent-skills";

const COLLAPSED_KEY_PREFIX = "pipeline-agent-panel-collapsed:";
const WIDTH_KEY_PREFIX = "pipeline-agent-panel-width:";
const DEFAULT_WIDTH = 360;
const MIN_WIDTH = 320;
const MAX_WIDTH = 560;

export function PipelineAgentPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const copy = {
    title: t.pipeline.canvasAgentPanelTitle,
    collapse: t.pipeline.canvasAgentPanelCollapse,
    expand: t.pipeline.canvasAgentPanelExpand,
    model: t.pipeline.canvasAgentPanelModel,
    vision: t.pipeline.canvasAgentPanelVision,
    noModel: t.pipeline.canvasAgentPanelNoModel,
    placeholder: t.pipeline.canvasAgentPanelPlaceholder,
    send: t.pipeline.canvasAgentPanelSend,
    stop: t.pipeline.canvasAgentPanelStop,
    empty: t.pipeline.canvasAgentPanelEmpty,
    running: t.pipeline.canvasAgentPanelRunning,
    loadError: t.pipeline.canvasAgentPanelLoadError,
    saveError: t.pipeline.canvasAgentPanelSaveError,
    sendError: t.pipeline.canvasAgentPanelSendError,
    resize: t.pipeline.canvasAgentPanelResize,
    loading: t.pipeline.canvasAgentPanelLoading,
    waitingCanvasSave: t.pipeline.canvasAgentPanelWaitingCanvasSave,
    undoAction: t.pipeline.canvasAgentPanelUndoAction,
    undoingAction: t.pipeline.canvasAgentPanelUndoingAction,
    actionUndone: t.pipeline.canvasAgentPanelActionUndone,
  };
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [conversation, setConversation] = useState<PipelineAgentConversationResponse | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<CanvasWorkflowRun[]>([]);
  const [partial, setPartial] = useState<Partial<AssistantMessage> | null>(null);
  const [inputDocument, setInputDocument] = useState<CanvasPromptDocument>(() => promptDocumentFromPlainText(""));
  const [referenceState, setReferenceState] = useState(EMPTY_PIPELINE_AGENT_REFERENCES);
  const [undoingActionId, setUndoingActionId] = useState<string | null>(null);
  const [undoneActionIds, setUndoneActionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const editorHandleRef = useRef<ResourcePromptEditorHandle | null>(null);
  const resizeCleanupRef = useRef<() => void>(() => undefined);
  const activeSessionIdRef = useRef<string | null>(null);
  const canvasRevision = useCanvasStore((state) => state.revision);
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const canvasSaveState = useCanvasStore((state) => state.saveState);
  const pendingCanvasMutationCount = useCanvasStore((state) => state.pendingMutations.length);
  const referencedNodeIds = useMemo(() => promptDocumentResourceAttrs(inputDocument)
    .filter((reference) => reference.sourceType === "canvas-node")
    .map((reference) => reference.sourceId), [inputDocument]);
  const observedReferenceState = useMemo(
    () => observePipelineAgentSelection(
      { ...referenceState, referencedNodeIds },
      selectedNodeIds,
    ),
    [referenceState, referencedNodeIds, selectedNodeIds],
  );

  const reloadHistory = useCallback(async (sessionId: string) => {
    const session = await pipelineStudioApi.getAgentSession(sessionId);
    // 项目切换后丢弃旧 Session 的迟到响应，避免历史和运行状态串到新项目。
    if (activeSessionIdRef.current !== sessionId) return;
    setMessages(session.context.messages.filter(isVisibleMessage));
    // agentState.running 表示 Runtime 已加载；只有 Runtime state 才能判断当前是否正在执行。
    setRunning(pipelineAgentIsRunning(session.agentState));
  }, []);

  const reloadRunningState = useCallback(async (sessionId: string) => {
    const session = await pipelineStudioApi.getAgentSession(sessionId);
    if (activeSessionIdRef.current !== sessionId) return;
    setRunning(pipelineAgentIsRunning(session.agentState));
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      activeSessionIdRef.current = null;
      setConversation(null);
      setMessages([]);
      setWorkflowRuns([]);
      setPartial(null);
      setRunning(false);
      setCollapsed(window.localStorage.getItem(`${COLLAPSED_KEY_PREFIX}${projectId}`) === "true");
      setWidth(readPanelWidth(projectId));
      setLoading(true);
      setError(null);
      Promise.all([
        pipelineStudioApi.getAgentConversation(projectId),
        pipelineStudioApi.getTextModels(),
        pipelineStudioApi.getCanvasWorkflowRuns(projectId),
      ]).then(async ([nextConversation, modelResponse, workflowResponse]) => {
        if (!active) return;
        activeSessionIdRef.current = nextConversation.sessionId;
        setConversation(nextConversation);
        setModels(modelResponse.models);
        setWorkflowRuns(workflowResponse.workflowRuns);
        await reloadHistory(nextConversation.sessionId);
      }).catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : copy.loadError);
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 0);
    return () => {
      active = false;
      activeSessionIdRef.current = null;
      window.clearTimeout(timer);
    };
  }, [copy.loadError, projectId, reloadHistory]);

  useEffect(() => {
    if (!workflowRuns.some((run) => run.status === "pending" || run.status === "running" || run.status === "cancelling")) return;
    const timer = window.setInterval(() => {
      void pipelineStudioApi.getCanvasWorkflowRuns(projectId)
        .then((response) => setWorkflowRuns(response.workflowRuns))
        .catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [projectId, workflowRuns]);

  useEffect(() => () => resizeCleanupRef.current(), []);

  useEffect(() => {
    if (!observedReferenceState.pendingNodeIds.length) return;
    const decide = (event: Event) => {
      const target = event.target;
      const entersComposer = target instanceof globalThis.Node && editorHandleRef.current?.contains(target);
      if (entersComposer) editorHandleRef.current?.commitPendingReferences();
      else editorHandleRef.current?.dismissPendingReferences();
      setReferenceState((current) => {
        const observed = observePipelineAgentSelection(
          { ...current, referencedNodeIds },
          selectedNodeIds,
        );
        return entersComposer
          ? commitPipelineAgentSelection(observed)
          : dismissPipelineAgentSelection(observed);
      });
    };
    // 节点本身未必可聚焦；同时观察指针和键盘焦点，才能可靠表达“下一焦点进入输入框”。
    document.addEventListener("pointerdown", decide, true);
    document.addEventListener("focusin", decide, true);
    return () => {
      document.removeEventListener("pointerdown", decide, true);
      document.removeEventListener("focusin", decide, true);
    };
  }, [observedReferenceState.pendingNodeIds.length, referencedNodeIds, selectedNodeIds]);

  useEffect(() => {
    if (!conversation) return;
    const source = new EventSource(`/api/agent/${encodeURIComponent(conversation.sessionId)}/events`);
    source.addEventListener("agent", (raw) => {
      if (activeSessionIdRef.current !== conversation.sessionId) return;
      try {
        const event = JSON.parse((raw as MessageEvent).data) as AgentEvent;
        if (event.type === "agent_start") setRunning(true);
        if (event.type === "message_start" || event.type === "message_update") setPartial(event.message);
        if (event.type === "message_end") {
          setPartial(null);
          if (isVisibleMessage(event.message)) setMessages((current) => appendWithoutDuplicate(current, event.message));
        }
        if (event.type === "agent_error") {
          setRunning(false);
          setPartial(null);
          setError(event.error.message);
        }
        if (event.type === "agent_end") {
          setRunning(false);
          setPartial(null);
          void reloadHistory(conversation.sessionId).catch((cause) => {
            setError(cause instanceof Error ? cause.message : copy.loadError);
          });
          void pipelineStudioApi.getCanvasWorkflowRuns(projectId)
            .then((response) => setWorkflowRuns(response.workflowRuns))
            .catch(() => undefined);
        }
      } catch {
        // 单个损坏事件不应中断后续对话流。
      }
    });
    return () => source.close();
  }, [conversation, copy.loadError, projectId, reloadHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, partial, running, submitting]);

  const selectedModel = useMemo(() => conversation?.provider && conversation.modelId
    ? modelKey(conversation.provider, conversation.modelId)
    : undefined, [conversation]);
  const modelOptions = useMemo(() => models.map((model) => ({
    value: modelKey(model.provider, model.id),
    label: `${model.name} · ${model.provider}${model.input?.includes("image") ? ` · ${copy.vision}` : ""}`,
    model,
  })), [copy.vision, models]);
  const nodeById = useMemo(() => new Map(canvasNodes.map((node) => [node.id, node])), [canvasNodes]);
  const referencedNodes = useMemo(() => referencedNodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is CanvasNode => node !== undefined), [nodeById, referencedNodeIds]);
  const pendingNodes = useMemo(() => observedReferenceState.pendingNodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is CanvasNode => node !== undefined), [nodeById, observedReferenceState.pendingNodeIds]);
  const canvasContextReady = pipelineAgentCanvasContextReady(canvasSaveState, pendingCanvasMutationCount);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(`${COLLAPSED_KEY_PREFIX}${projectId}`, String(next));
  };

  const resizeFrom = (startX: number) => {
    resizeCleanupRef.current();
    const startWidth = width;
    const onMove = (event: PointerEvent) => setWidth(clampWidth(startWidth + startX - event.clientX));
    const onEnd = (event: PointerEvent) => {
      const next = clampWidth(startWidth + startX - event.clientX);
      setWidth(next);
      window.localStorage.setItem(`${WIDTH_KEY_PREFIX}${projectId}`, String(next));
      resizeCleanupRef.current();
    };
    resizeCleanupRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      resizeCleanupRef.current = () => undefined;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const resizeByKeyboard = (delta: number) => {
    const next = clampWidth(width + delta);
    setWidth(next);
    window.localStorage.setItem(`${WIDTH_KEY_PREFIX}${projectId}`, String(next));
  };

  const updateSettings = async (patch: Parameters<typeof pipelineStudioApi.updateAgentConversation>[1]) => {
    if (!conversation || saving) return;
    setSaving(true);
    setError(null);
    try {
      setConversation(await pipelineStudioApi.updateAgentConversation(projectId, patch));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.saveError);
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    const message = inputDocument.plainText.trim();
    if (!conversation || (!message && !referencedNodes.length) || running || submitting || !canvasContextReady) return;
    const submittedDocument = inputDocument;
    const submittedReferences = referencedNodes;
    const submittedReferenceIds = submittedReferences.map((node) => node.id);
    const submittedAt = Date.now();
    setInputDocument(promptDocumentFromPlainText(""));
    setReferenceState((current) => clearPipelineAgentReferences(
      observePipelineAgentSelection({ ...current, referencedNodeIds }, selectedNodeIds),
    ));
    setError(null);
    setSubmitting(true);
    setMessages((current) => [...current, {
      role: "user",
      content: formatCanvasAgentMessage(message, submittedReferences.map((node) => ({
        nodeId: node.id,
        name: node.data?.name ?? node.entityId,
        type: node.type,
      }))),
      timestamp: submittedAt,
    }]);
    try {
      await pipelineStudioApi.submitAgentTurn(projectId, {
        turnId: crypto.randomUUID(),
        message,
        document: submittedDocument,
        canvasRevision,
        referencedNodeIds: submittedReferenceIds,
      });
      // POST 与 SSE 的到达顺序不固定；提交后重新读取 Runtime，避免极快回合已经结束却被客户端重新标记为运行中。
      await reloadRunningState(conversation.sessionId).catch((cause) => {
        setError(cause instanceof Error ? cause.message : copy.loadError);
      });
    } catch (cause) {
      setRunning(false);
      setInputDocument(submittedDocument);
      setReferenceState((current) => ({
        ...current,
        referencedNodeIds: [...new Set([...submittedReferenceIds, ...current.referencedNodeIds])],
      }));
      setMessages((current) => current.filter((candidate) =>
        candidate.role !== "user" || candidate.timestamp !== submittedAt
      ));
      setError(cause instanceof Error ? cause.message : copy.sendError);
    } finally {
      setSubmitting(false);
    }
  };

  const undoAgentAction = async (actionId: string) => {
    if (running || submitting || undoingActionId) return;
    setUndoingActionId(actionId);
    setError(null);
    try {
      await pipelineStudioApi.undoAgentAction(projectId, actionId);
      setUndoneActionIds((current) => [...new Set([...current, actionId])]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.sendError);
    } finally {
      setUndoingActionId(null);
    }
  };

  if (collapsed) {
    return (
      <aside className="flex h-full w-11 shrink-0 flex-col items-center border-l border-[var(--pl-border)] bg-[var(--pl-surface-glass)] py-2">
        <Tooltip title={copy.expand} placement="left">
          <Button type="text" icon={<PanelRight />} aria-label={copy.expand} onClick={toggleCollapsed} />
        </Tooltip>
        <Bot className="mt-3 size-4 text-[var(--pl-text-muted)]" />
      </aside>
    );
  }

  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-[var(--pl-border)] bg-[var(--pl-surface-glass)] text-[var(--pl-text)]" style={{ width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={copy.resize}
        tabIndex={0}
        className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize outline-none hover:bg-[var(--pl-accent-soft)] focus-visible:bg-[var(--pl-accent-soft)]"
        onPointerDown={(event) => {
          event.preventDefault();
          resizeFrom(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            resizeByKeyboard(event.key === "ArrowLeft" ? 16 : -16);
          }
        }}
      />
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--pl-border)] px-3">
        <Bot className="size-4 text-[var(--pl-text-secondary)]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{copy.title}</span>
        {(running || submitting) && <LoaderCircle className="size-3.5 animate-spin text-[var(--pl-accent-hover)]" aria-label={copy.running} />}
        <Tooltip title={copy.collapse}>
          <Button type="text" icon={<PanelRightClose />} aria-label={copy.collapse} onClick={toggleCollapsed} />
        </Tooltip>
        <Tooltip title={t.pipeline.canvasAgentPanelSkills}>
          <Button type="text" icon={<Sparkles />} aria-label={t.pipeline.canvasAgentPanelSkills} onClick={() => setSkillsOpen(true)} />
        </Tooltip>
      </header>

      {skillsOpen ? <PipelineAgentSkills projectId={projectId} onClose={() => setSkillsOpen(false)} /> : <>

      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--pl-border)] px-2.5">
        <Select
          className="min-w-0 flex-1 text-xs"
          size="small"
          aria-label={copy.model}
          placeholder={copy.noModel}
          loading={loading}
          disabled={!conversation || saving || running || submitting}
          value={selectedModel}
          variant="borderless"
          prefix={<Cpu className="size-3.5 text-[var(--pl-text-muted)]" />}
          options={modelOptions}
          onChange={(value) => {
            const model = modelOptions.find((option) => option.value === value)?.model;
            if (model) void updateSettings({ provider: model.provider, modelId: model.id });
          }}
        />
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4" aria-live="polite">
        {loading ? (
          <div className="space-y-4 pt-2" aria-label={copy.loading}>
            <div className="ml-auto h-8 w-28 animate-pulse rounded-lg bg-[var(--pl-surface-hover)]" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-[var(--pl-surface-hover)]" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-[var(--pl-surface-hover)]" />
          </div>
        ) : messages.length === 0 && !partial ? (
          <div className="mx-auto mt-10 max-w-[250px] text-center text-sm leading-6 text-[var(--pl-text-muted)]">
            <Bot className="mx-auto mb-3 size-5 text-[var(--pl-text-secondary)]" />
            {copy.empty}
          </div>
        ) : (
          messages.map((message, index) => <MessageBubble
            key={`${message.timestamp ?? "message"}-${index}`}
            message={message}
            onUndoAction={(running || submitting) ? undefined : undoAgentAction}
            undoingActionId={undoingActionId}
            undoneActionIds={undoneActionIds}
            workflowRuns={workflowRuns}
            canvasNodes={canvasNodes}
          />)
        )}
        {partial && <MessageBubble message={{ role: "assistant", provider: "", model: "", content: partial.content ?? [] }} canvasNodes={canvasNodes} streaming />}
      </div>

      <div className="shrink-0 border-t border-[var(--pl-border)] px-3 pb-3 pt-2.5">
        {error && <p className="mb-2 text-xs text-[var(--pl-danger)]" role="alert">{error}</p>}
        <div className="flex min-h-24 max-h-60 flex-col overflow-hidden rounded-[var(--radius-composer)] border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] shadow-[var(--shadow-composer)] focus-within:border-[var(--pl-accent)]">
          <ResourcePromptEditor
            value={inputDocument}
            onChange={setInputDocument}
            placeholder={copy.placeholder}
            ariaLabel={copy.placeholder}
            disabled={loading || !conversation || running || submitting}
            allowedMediaTypes={["text", "image", "video", "audio"]}
            includeAssets={false}
            canvasReferenceMode="all-nodes"
            showReferencePreviewStrip={false}
            pendingReferences={pendingNodes.map((node): CanvasResourceReferenceAttrs => (
              canvasNodeReferenceAttrs(node, `pending:${node.id}`, true)
            ))}
            editorHandleRef={editorHandleRef}
            onSubmit={() => void submit()}
          />
          <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-[var(--pl-border)] p-1.5">
          {running ? (
            <Tooltip title={copy.stop}>
              <Button
                className="size-8 shrink-0 border-[var(--pl-danger)]/30 text-[var(--pl-danger)]"
                danger
                icon={<Square />}
                aria-label={copy.stop}
                onClick={() => {
                  if (!conversation) return;
                  void pipelineStudioApi.sendAgentCommand(conversation.sessionId, { type: "abort" })
                    .catch((cause) => setError(cause instanceof Error ? cause.message : copy.sendError));
                }}
              />
            </Tooltip>
          ) : (
            <Tooltip title={canvasContextReady ? copy.send : copy.waitingCanvasSave}>
              <span className="inline-flex shrink-0">
                <Button className="size-8" shape="circle" type="primary" loading={submitting} icon={<Send className="rotate-[-90deg]" />} aria-label={copy.send} disabled={(!inputDocument.plainText.trim() && !referencedNodes.length) || !conversation || !canvasContextReady || submitting} onClick={() => void submit()} />
              </span>
            </Tooltip>
          )}
          </div>
        </div>
      </div>
      </>}
    </aside>
  );
}

function PipelineAgentUserMessage({
  parsed,
  canvasNodeById,
  previewLabel,
}: {
  parsed: ParsedCanvasAgentMessage;
  canvasNodeById: Map<string, CanvasNode>;
  previewLabel: string;
}) {
  if (parsed.document) {
    return renderCanvasAgentRichNode(parsed.document.content, parsed.references, canvasNodeById, previewLabel, "root");
  }
  return (
    <>
      {parsed.references.map((reference) => (
        <Fragment key={reference.nodeId}>
          <PipelineAgentInlineReference
            reference={reference}
            node={canvasNodeById.get(reference.nodeId)}
            previewLabel={previewLabel}
          />{" "}
        </Fragment>
      ))}
      {parsed.message}
    </>
  );
}

function renderCanvasAgentRichNode(
  richNode: CanvasRichTextNode,
  references: CanvasAgentMessageReference[],
  canvasNodeById: Map<string, CanvasNode>,
  previewLabel: string,
  key: string,
): ReactNode {
  if (richNode.type === "text") return richNode.text ?? "";
  if (richNode.type === "hardBreak") return <br key={key} />;
  if (richNode.type === "resourceReference" && richNode.attrs) {
    const attrs = richNode.attrs as Partial<CanvasResourceReferenceAttrs>;
    const reference = references.find((candidate) => candidate.nodeId === attrs.sourceId);
    return reference ? (
      <Fragment key={key}>
        <PipelineAgentInlineReference
          reference={reference}
          node={canvasNodeById.get(reference.nodeId)}
          previewLabel={previewLabel}
        />
      </Fragment>
    ) : null;
  }
  const children = richNode.content?.map((child, index) => renderCanvasAgentRichNode(
    child,
    references,
    canvasNodeById,
    previewLabel,
    `${key}:${index}`,
  ));
  if (richNode.type === "paragraph") return <span key={key} className="block min-h-[1.6em]">{children}</span>;
  return <Fragment key={key}>{children}</Fragment>;
}

function PipelineAgentInlineReference({
  reference,
  node,
  previewLabel,
}: {
  reference: CanvasAgentMessageReference;
  node?: CanvasNode;
  previewLabel: string;
}) {
  const mediaType = node?.data?.type ?? (reference.type === "image" || reference.type === "video" || reference.type === "audio"
    ? reference.type
    : "text");
  const source = resolveCanvasMediaSource(reference.nodeId, node?.data);
  const textPreview = node?.data?.type === "text"
    ? node.data.textDocument?.plainText ?? node.data.content?.join("\n")
    : undefined;
  const thumbnail = (
    <ResourcePreviewThumbnail
      mediaType={mediaType}
      label={reference.name}
      url={source?.url ?? null}
      poster={node?.data?.poster}
      size="inline"
    />
  );
  const preview = (mediaType === "image" || mediaType === "video") && source?.url ? (
    <ResourcePreviewPopover
      mediaType={mediaType}
      label={reference.name}
      url={source.url}
      poster={node?.data?.poster}
      detail={reference.type}
      ariaLabel={previewLabel.replace("{name}", reference.name)}
    >
      {thumbnail}
    </ResourcePreviewPopover>
  ) : <Tooltip title={textPreview || reference.name}>{thumbnail}</Tooltip>;
  return (
    <span className="mx-0.5 inline-flex max-w-44 items-center gap-1 rounded-md bg-[var(--pl-accent-soft)] py-0.5 pl-0.5 pr-1.5 align-middle font-medium text-[var(--pl-accent)]">
      {preview}
      <span className="truncate">@{reference.name}</span>
    </span>
  );
}

function MessageBubble({
  message,
  streaming = false,
  onUndoAction,
  undoingActionId,
  undoneActionIds = [],
  workflowRuns = [],
  canvasNodes = [],
}: {
  message: AgentMessage;
  streaming?: boolean;
  onUndoAction?: (actionId: string) => void;
  undoingActionId?: string | null;
  undoneActionIds?: string[];
  workflowRuns?: CanvasWorkflowRun[];
  canvasNodes?: CanvasNode[];
}) {
  const { t } = useI18n();
  const text = messageText(
    message,
    t.pipeline.canvasAgentPanelToolRunning,
    t.pipeline.canvasAgentPanelImage,
  );
  const user = message.role === "user";
  const parsedUserMessage = user ? parseCanvasAgentMessage(text) : null;
  const canvasNodeById = new Map(canvasNodes.map((node) => [node.id, node]));
  const tool = message.role === "toolResult";
  const actionId = canvasAgentActionId(message);
  const undone = Boolean(actionId && undoneActionIds.includes(actionId));
  const workflowRunId = canvasAgentWorkflowRunId(message);
  const workflowRun = workflowRuns.find((run) => run.id === workflowRunId);
  const failedWorkflowSteps = workflowRun?.steps.filter((step) => step.status === "failed").length ?? 0;
  const blockedWorkflowSteps = workflowRun?.steps.filter((step) => step.status === "cancelled" && Boolean(step.errorMessage)).length ?? 0;
  const reviewItems = canvasAgentReviewItems(message);
  const toolStatus = tool
    ? message.isError ? t.pipeline.canvasAgentPanelToolFailed : t.pipeline.canvasAgentPanelToolCompleted
    : null;
  return (
    <div className={`flex ${user ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] whitespace-pre-wrap break-words text-sm leading-[1.6] ${
        user
          ? "rounded-lg bg-[var(--user-bg)] px-3 py-2 text-[var(--pl-text)]"
          : tool
            ? "w-full rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface-subtle)] px-3 py-2 text-[var(--pl-text-secondary)]"
            : "text-[var(--pl-text-secondary)]"
      }`}>
        {tool ? (
          <>
            <div className="flex items-center justify-between gap-3 whitespace-normal">
              <span className="truncate font-medium text-[var(--pl-text)]">{message.toolName}</span>
              <span className={message.isError ? "shrink-0 text-xs text-[var(--pl-danger)]" : "shrink-0 text-xs text-[var(--pl-text-muted)]"}>
                {toolStatus}
              </span>
            </div>
            {text ? (
              <details className="mt-2 whitespace-pre-wrap border-t border-[var(--pl-border)] pt-2 text-xs leading-5">
                <summary className="cursor-pointer select-none text-[var(--pl-text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--pl-accent)]">
                  {t.pipeline.canvasAgentPanelToolDetails}
                </summary>
                <div className="mt-2 max-h-48 overflow-y-auto break-words font-mono text-[11px] leading-5 text-[var(--pl-text-secondary)]">
                  {text}
                </div>
              </details>
            ) : null}
            {reviewItems.length ? (
              <div className="mt-2 space-y-2 border-t border-[var(--pl-border)] pt-2">
                <div className="text-xs font-medium text-[var(--pl-text)]">{t.pipeline.canvasAgentPanelReviewTitle}</div>
                {reviewItems.map((item) => (
                  <div key={item.nodeId} className="rounded border border-[var(--pl-border)] bg-[var(--pl-surface)] px-2 py-1.5 text-xs leading-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-[var(--pl-text)]">{item.name}</span>
                      <span className="shrink-0 text-[var(--pl-text-muted)]">{t.pipeline.canvasAgentPanelReviewCurrent}</span>
                    </div>
                    {item.summary ? <p className="mt-1 text-[var(--pl-text-secondary)]">{item.summary}</p> : null}
                    <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-[var(--pl-text-muted)]">
                      <span>{t.pipeline.canvasAgentPanelReviewAnalyzedTakes.replace("{count}", String(item.analyzedTakeCount))}</span>
                      {item.affectedDownstreamCount ? (
                        <span>{t.pipeline.canvasAgentPanelReviewAffected.replace("{count}", String(item.affectedDownstreamCount))}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : user && parsedUserMessage ? (
          <PipelineAgentUserMessage
            parsed={parsedUserMessage}
            canvasNodeById={canvasNodeById}
            previewLabel={t.pipeline.canvasAgentPanelReferencePreview}
          />
        ) : text || (streaming ? "…" : message.role)}
        {workflowRun ? (
          <div className="mt-2 flex items-center justify-between border-t border-[var(--pl-border)] pt-2 text-xs">
            <span className="font-mono text-[var(--pl-text-muted)]">{workflowRun.id.slice(0, 8)}</span>
            <span className="text-[var(--pl-text-secondary)]">
              {workflowRun.status} · {workflowRun.steps.filter((step) => step.status === "completed").length}/{workflowRun.steps.length}
              {failedWorkflowSteps ? ` · ${t.pipeline.canvasAgentPanelWorkflowFailedCount.replace("{count}", String(failedWorkflowSteps))}` : ""}
              {blockedWorkflowSteps ? ` · ${t.pipeline.canvasAgentPanelWorkflowBlockedCount.replace("{count}", String(blockedWorkflowSteps))}` : ""}
            </span>
          </div>
        ) : null}
        {actionId ? (
          <div className="mt-2 border-t border-[var(--pl-border)] pt-1.5">
            <Button
              size="small"
              type="text"
              disabled={undone || !onUndoAction}
              loading={undoingActionId === actionId}
              onClick={() => onUndoAction?.(actionId)}
            >
              {undone ? t.pipeline.canvasAgentPanelActionUndone
                : undoingActionId === actionId ? t.pipeline.canvasAgentPanelUndoingAction
                  : t.pipeline.canvasAgentPanelUndoAction}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function canvasAgentActionId(message: AgentMessage): string | null {
  if (message.role !== "toolResult" || message.toolName !== "canvas_apply_plan") return null;
  const details = message.details;
  if (!details || typeof details !== "object" || !("actionId" in details)) return null;
  return typeof details.actionId === "string" ? details.actionId : null;
}

function canvasAgentWorkflowRunId(message: AgentMessage): string | null {
  if (message.role !== "toolResult" || message.toolName !== "canvas_run_generation") return null;
  const details = message.details;
  if (!details || typeof details !== "object" || !("workflowRunId" in details)) return null;
  return typeof details.workflowRunId === "string" ? details.workflowRunId : null;
}

function canvasAgentReviewItems(message: AgentMessage): Array<{
  nodeId: string;
  name: string;
  summary: string | null;
  analyzedTakeCount: number;
  affectedDownstreamCount: number;
}> {
  if (message.role !== "toolResult" || message.toolName !== "canvas_review_results") return [];
  const details = message.details;
  if (!isRecord(details) || !Array.isArray(details.items)) return [];
  return details.items.flatMap((item) => {
    if (!isRecord(item) || typeof item.nodeId !== "string" || typeof item.name !== "string") return [];
    const analysis = isRecord(item.analysis) ? item.analysis : null;
    return [{
      nodeId: item.nodeId,
      name: item.name,
      summary: analysis && typeof analysis.summary === "string" ? analysis.summary : null,
      analyzedTakeCount: typeof item.analyzedTakeCount === "number" ? item.analyzedTakeCount : 0,
      affectedDownstreamCount: Array.isArray(item.affectedDownstreamNodeIds) ? item.affectedDownstreamNodeIds.length : 0,
    }];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageText(message: AgentMessage, toolRunning = "Tool: {tool}", imageLabel = "Image"): string {
  if (message.role === "compactionSummary" || message.role === "branchSummary") return message.summary;
  if (message.role === "bashExecution") return message.output;
  const content = message.content;
  if (typeof content === "string") return content;
  return content.map((item) => item.type === "text"
    ? item.text
    : item.type === "thinking"
      ? ""
      : item.type === "toolCall"
        ? toolRunning.replace("{tool}", item.toolName)
        : `[${imageLabel}]`).filter(Boolean).join("\n");
}

function isVisibleMessage(message: AgentMessage): boolean {
  if (message.role === "custom") return message.display;
  // 新建 Pi 会话的首条空 assistant entry 只用于立即持久化，不能在 Agent 对话中占位。
  return message.role !== "assistant" || message.model !== "po-agent-runtime-bootstrap";
}

function appendWithoutDuplicate(messages: AgentMessage[], message: AgentMessage): AgentMessage[] {
  const last = messages.at(-1);
  return last?.role === message.role && messageText(last) === messageText(message)
    ? messages
    : [...messages, message];
}

function modelKey(provider: string, modelId: string): string {
  return JSON.stringify([provider, modelId]);
}

function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

function readPanelWidth(projectId: string): number {
  const stored = Number(window.localStorage.getItem(`${WIDTH_KEY_PREFIX}${projectId}`));
  return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_WIDTH;
}
