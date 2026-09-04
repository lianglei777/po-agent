"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Mentions, Select, Switch, Tooltip } from "antd";
import type { AgentEvent, AgentMessage, AssistantMessage } from "@/contracts/agent";
import type { ModelInfo } from "@/contracts/models";
import type { PipelineAgentConversationResponse } from "@/contracts/pipeline-agent";
import type { CanvasWorkflowRun } from "@/contracts/pipeline";
import { Bot, Cpu, LoaderCircle, PanelRight, PanelRightClose, Send, Sparkles, Square } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineStudioApi } from "../api/pipeline-studio-api";
import { useCanvasStore } from "../state/canvas-store";
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
    allowGeneration: t.pipeline.canvasAgentPanelAllowGeneration,
    allowGenerationDescription: t.pipeline.canvasAgentPanelAllowGenerationDescription,
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
    selection: t.pipeline.canvasAgentPanelSelection,
    removeSelection: t.pipeline.canvasAgentPanelRemoveSelection,
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
  const [input, setInput] = useState("");
  const [mentionedNodeIds, setMentionedNodeIds] = useState<string[]>([]);
  const [excludedSelectionIds, setExcludedSelectionIds] = useState<string[]>([]);
  const [undoingActionId, setUndoingActionId] = useState<string | null>(null);
  const [undoneActionIds, setUndoneActionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<() => void>(() => undefined);
  const activeSessionIdRef = useRef<string | null>(null);
  const canvasRevision = useCanvasStore((state) => state.revision);
  const canvasNodes = useCanvasStore((state) => state.nodes);
  const selectedNodeIds = useCanvasStore((state) => state.selectedNodeIds);
  const canvasSaveState = useCanvasStore((state) => state.saveState);
  const pendingCanvasMutationCount = useCanvasStore((state) => state.pendingMutations.length);

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
  const contextSelectedNodeIds = useMemo(() => selectedNodeIds
    .filter((nodeId) => !excludedSelectionIds.includes(nodeId)), [excludedSelectionIds, selectedNodeIds]);
  const selectedNodes = useMemo(() => contextSelectedNodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node) => node !== undefined), [contextSelectedNodeIds, nodeById]);
  const mentionOptions = useMemo(() => canvasNodes.map((node) => ({
    key: node.id,
    value: mentionToken(node.data?.name ?? node.type, node.id),
    label: `${node.data?.name ?? node.type} · ${node.type}`,
  })), [canvasNodes]);
  const mentionIdByToken = useMemo(() => new Map(mentionOptions.map((option) => [option.value, option.key])), [mentionOptions]);
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
    const message = input.trim();
    if (!conversation || !message || running || submitting || !canvasContextReady) return;
    const submittedMentions = mentionedNodeIds;
    const submittedAt = Date.now();
    setInput("");
    setMentionedNodeIds([]);
    setExcludedSelectionIds([]);
    setError(null);
    setSubmitting(true);
    setMessages((current) => [...current, { role: "user", content: message, timestamp: submittedAt }]);
    try {
      await pipelineStudioApi.submitAgentTurn(projectId, {
        turnId: crypto.randomUUID(),
        message,
        canvasRevision,
        selectedNodeIds: contextSelectedNodeIds,
        mentionedNodeIds: submittedMentions,
      });
      // POST 与 SSE 的到达顺序不固定；提交后重新读取 Runtime，避免极快回合已经结束却被客户端重新标记为运行中。
      await reloadRunningState(conversation.sessionId).catch((cause) => {
        setError(cause instanceof Error ? cause.message : copy.loadError);
      });
    } catch (cause) {
      setRunning(false);
      setInput(message);
      setMentionedNodeIds(submittedMentions);
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
        <div className="h-4 w-px shrink-0 bg-[var(--pl-border)]" />
        <div className="flex shrink-0 items-center gap-2 text-caption">
          <Tooltip title={copy.allowGenerationDescription} placement="left">
            <span className="cursor-help text-[var(--pl-text-muted)]">{copy.allowGeneration}</span>
          </Tooltip>
          <Switch
            size="small"
            checked={conversation?.allowAgentGeneration ?? false}
            disabled={!conversation || saving || running || submitting}
            aria-label={copy.allowGeneration}
            onChange={(checked) => void updateSettings({ allowAgentGeneration: checked })}
          />
        </div>
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
          />)
        )}
        {partial && <MessageBubble message={{ role: "assistant", provider: "", model: "", content: partial.content ?? [] }} streaming />}
      </div>

      <div className="shrink-0 border-t border-[var(--pl-border)] px-3 pb-3 pt-2.5">
        {error && <p className="mb-2 text-xs text-[var(--pl-danger)]" role="alert">{error}</p>}
        {selectedNodes.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5" aria-label={copy.selection}>
            {selectedNodes.map((node) => (
              <button
                className="max-w-36 truncate rounded-md border border-[var(--pl-border)] bg-[var(--pl-surface-subtle)] px-2 py-1 text-caption text-[var(--pl-text-secondary)] transition-colors hover:bg-[var(--pl-surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--pl-accent)]"
                key={node.id}
                onClick={() => setExcludedSelectionIds((current) => [...current, node.id])}
                title={copy.removeSelection.replace("{name}", node.data?.name ?? node.type)}
                type="button"
              >
                {node.data?.name ?? node.type}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-1.5 rounded-[var(--radius-composer)] border border-[var(--pl-border-strong)] bg-[var(--pl-surface-elevated)] p-1.5 shadow-[var(--shadow-composer)] focus-within:border-[var(--pl-accent)]">
          <Mentions
            variant="borderless"
            value={input}
            disabled={loading || !conversation}
            autoSize={{ minRows: 2, maxRows: 7 }}
            options={mentionOptions}
            placement="top"
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            onChange={(value) => {
              setInput(value);
              setMentionedNodeIds([...new Set(Mentions.getMentions(value)
                .map(({ value: token }) => mentionIdByToken.get(token))
                .filter((nodeId): nodeId is string => Boolean(nodeId)))]);
            }}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
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
                <Button className="size-8" shape="circle" type="primary" loading={submitting} icon={<Send className="rotate-[-90deg]" />} aria-label={copy.send} disabled={!input.trim() || !conversation || !canvasContextReady || submitting} onClick={() => void submit()} />
              </span>
            </Tooltip>
          )}
        </div>
      </div>
      </>}
    </aside>
  );
}

function MessageBubble({
  message,
  streaming = false,
  onUndoAction,
  undoingActionId,
  undoneActionIds = [],
  workflowRuns = [],
}: {
  message: AgentMessage;
  streaming?: boolean;
  onUndoAction?: (actionId: string) => void;
  undoingActionId?: string | null;
  undoneActionIds?: string[];
  workflowRuns?: CanvasWorkflowRun[];
}) {
  const { t } = useI18n();
  const text = messageText(
    message,
    t.pipeline.canvasAgentPanelToolRunning,
    t.pipeline.canvasAgentPanelImage,
  );
  const user = message.role === "user";
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

function mentionToken(name: string, nodeId: string): string {
  return `${name.replaceAll(" ", "_")}·${nodeId.slice(0, 6)}`;
}
