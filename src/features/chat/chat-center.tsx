"use client";

import {
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ImagePlus,
  MessageSquarePlus,
  Puzzle,
  ServerCog,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/use-i18n";
import { ChatInput } from "./chat-input";
import { createConversationNavigatorEntries } from "./conversation-navigator/conversation-navigator-adapter";
import { ConversationNavigator } from "./conversation-navigator/conversation-navigator";
import { MessageList } from "./message-view";
import styles from "./welcome.module.css";
import type {
  ContextUsage,
  SessionStats,
} from "./agent-types";
import type { BranchState } from "./branch-state";
import { ChatStoreProvider } from "./state/chat-store-provider";
import { type ChatSession, useChatController } from "./use-chat-controller";

type ChatCenterProps = {
  session: ChatSession | null;
  newSessionCwd: string | null;
  modelsRevision: number;
  onAgentEnd?: () => void;
  onSessionCreated?: (sessionId: string) => void;
  onSessionForked?: (sessionId: string) => void;
  onSystemPromptChange?: (prompt: string | null) => void;
  onSessionStatsChange?: (stats: SessionStats | null) => void;
  onContextUsageChange?: (usage: ContextUsage | null) => void;
  onBranchState?: (state: BranchState | null) => void;
  onOpenModelProvider: () => void;
  onOpenSkills: () => void;
  projectName: string | null;
};

export function ChatCenter(props: ChatCenterProps) {
  return (
    <ChatStoreProvider initialLoading={Boolean(props.session)}>
      <ChatCenterContent {...props} />
    </ChatStoreProvider>
  );
}

function ChatCenterContent({
  session,
  newSessionCwd,
  modelsRevision,
  onAgentEnd,
  onSessionCreated,
  onSessionForked,
  onSystemPromptChange,
  onSessionStatsChange,
  onContextUsageChange,
  onBranchState,
  onOpenModelProvider,
  onOpenSkills,
  projectName,
}: ChatCenterProps) {
  const controller = useChatController({
    session,
    newSessionCwd,
    modelsRevision,
    onAgentEnd,
    onSessionCreated,
    onSessionForked,
    onSystemPromptChange,
    onSessionStatsChange,
    onContextUsageChange,
  });
  const { t } = useI18n();
  const [dragActive, setDragActive] = useState(false);
  const [scrollerNode, setScrollerNode] = useState<HTMLDivElement | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const dragCounter = useRef(0);
  const messageElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [chatInputNode, setChatInputNode] = useState<HTMLDivElement | null>(
    null,
  );
  const [chatInputHeight, setChatInputHeight] = useState(0);
  const { activeLeafId, changeLeaf, isCompacting, running, tree } = controller;

  const conversationNavigatorEntries = useMemo(
    () =>
      createConversationNavigatorEntries({
        entryIds: controller.entryIds,
        messages: controller.messages,
        streamingMessage: controller.stream.streamingMessage,
      }),
    [
      controller.entryIds,
      controller.messages,
      controller.stream.streamingMessage,
    ],
  );

  const handleMessageElement = useCallback(
    (id: string, element: HTMLElement | null) => {
      if (element) messageElementsRef.current.set(id, element);
      else messageElementsRef.current.delete(id);
    },
    [],
  );

  // 将分支状态传递给 WorkspaceTopBar
  useEffect(() => {
    onBranchState?.({
      tree,
      activeLeafId,
      running,
      busy: running || isCompacting,
      changeLeaf: (leafId) => changeLeaf(leafId),
    });
    return () => onBranchState?.(null);
  }, [activeLeafId, changeLeaf, isCompacting, onBranchState, running, tree]);

  // 监测 ChatInput 实际高度，让滚动容器底部留出对应空间，
  // 避免滚动条延伸到浮动输入区下方被遮挡
  useEffect(() => {
    if (!chatInputNode) return;
    const updateHeight = () => setChatInputHeight(chatInputNode.offsetHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(chatInputNode);
    return () => observer.disconnect();
  }, [chatInputNode]);

  function hasImages(event: DragEvent<HTMLElement>) {
    return Array.from(event.dataTransfer.items).some(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    void controller.addFiles(Array.from(event.dataTransfer.files));
  }

  const hasConversation =
    controller.messages.length > 0 ||
    controller.stream.streamingMessage ||
    controller.running;

  return (
    <main
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas"
      onDragEnter={(event) => {
        if (!hasImages(event) || !controller.canAttachImages) return;
        event.preventDefault();
        dragCounter.current += 1;
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          dragCounter.current = 0;
          setDragActive(false);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      {dragActive ? (
        <div className="pointer-events-none absolute inset-3 z-40 grid place-items-center rounded-lg border-2 border-dashed border-line bg-hover">
          <div className="flex flex-col items-center gap-2 text-sm font-semibold text-muted">
            <ImagePlus className="size-8 text-muted" />
            {t.chat.dragDropImages}
          </div>
        </div>
      ) : null}

      {controller.loading ? (
        <CenteredState>{t.chat.loadingSession}</CenteredState>
      ) : controller.error ? (
        <CenteredState error>{controller.error}</CenteredState>
      ) : (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            <div
              className="chat-scrollbar min-w-0 flex-1 overflow-y-auto overscroll-contain"
              style={{ marginBottom: chatInputHeight || undefined }}
              ref={(node) => {
                controller.setScrollerNode(node);
                setScrollerNode(node);
              }}
            >
              <div
                className={`min-h-full w-full px-4 pt-4 pb-4 ${
                  hasConversation ? "mx-auto max-w-[820px]" : ""
                }`}
                ref={(node) => {
                  controller.setContentNode(node);
                }}
              >
                {!hasConversation ? (
                  <Welcome
                    modelCount={controller.models.length}
                    modelReady={Boolean(controller.currentModel)}
                    onOpenModelProvider={onOpenModelProvider}
                    onOpenSkills={onOpenSkills}
                    onStart={() => controller.textareaRef.current?.focus()}
                    projectName={projectName}
                  />
                ) : null}

                <MessageList
                  cwd={session?.cwd ?? newSessionCwd ?? undefined}
                  entryIds={controller.entryIds}
                  forkingEntryId={controller.forkingEntryId}
                  lastUserRef={controller.lastUserRef}
                  messages={controller.messages}
                  partialToolResults={controller.partialToolResults}
                  onEdit={(targetId, text) =>
                    void controller.editFromHere(targetId, text)
                  }
                  onFork={(entryId) => void controller.fork(entryId)}
                  highlightedMessageId={highlightedMessageId}
                  onMessageElement={handleMessageElement}
                  running={controller.running}
                  streamingMessage={controller.stream.streamingMessage}
                />

                {controller.running ? <div className="h-[80vh]" /> : null}
              </div>
            </div>

            <ChatInput {...controller} rootRef={setChatInputNode} />
          </div>

          <ConversationNavigator
            entries={conversationNavigatorEntries}
            messageElementsRef={messageElementsRef}
            onHighlightMessageChange={setHighlightedMessageId}
            scroller={scrollerNode}
          />
        </div>
      )}
    </main>
  );
}

function Welcome({
  modelCount,
  modelReady,
  onOpenModelProvider,
  onOpenSkills,
  onStart,
  projectName,
}: {
  modelCount: number;
  modelReady: boolean;
  onOpenModelProvider: () => void;
  onOpenSkills: () => void;
  onStart: () => void;
  projectName: string | null;
}) {
  const { t } = useI18n();
  const skillsDisabledReason = projectName
    ? null
    : t.workspace.selectProjectForSkills;
  const sessionDisabledReason = !projectName
    ? t.chat.input.selectProjectBeforeStart
    : !modelReady
      ? t.chat.welcome.sessionNeedsModel
      : null;

  return (
    <section className={styles.stage}>
      <div className={styles.intro}>
        <p className={styles.eyebrow}>{t.chat.welcome.eyebrow}</p>
        <h1 className={styles.title}>{t.chat.welcome.headline}</h1>
        <p className={styles.description}>{t.chat.welcome.description}</p>
      </div>

      <div className={styles.actions}>
        <WelcomeAction
          emphasized={!modelReady}
          icon={ServerCog}
          onClick={onOpenModelProvider}
          status={
            modelCount > 0
              ? t.chat.welcome.modelConfigured.replace(
                  "{count}",
                  String(modelCount),
                )
              : t.chat.welcome.modelMissing
          }
          label={t.workspace.modelProvider}
        />
        <WelcomeAction
          disabledReason={skillsDisabledReason}
          icon={Puzzle}
          onClick={onOpenSkills}
          status={skillsDisabledReason ?? t.chat.welcome.skillsReady}
          label={t.workspace.skills}
        />
        <WelcomeAction
          disabledReason={sessionDisabledReason}
          emphasized={!sessionDisabledReason}
          icon={MessageSquarePlus}
          onClick={onStart}
          status={sessionDisabledReason ?? t.chat.welcome.sessionReady}
          label={t.workspace.newChat}
        />
      </div>

      <p className={styles.capabilities}>
        <strong>{t.chat.welcome.capabilitiesLead}</strong>
        <span>{t.chat.welcome.history}</span>
        <span>{t.chat.welcome.files}</span>
        <span>{t.chat.welcome.branches}</span>
      </p>
    </section>
  );
}

function WelcomeAction({
  disabledReason = null,
  emphasized = false,
  icon: Icon,
  label,
  onClick,
  status,
}: {
  disabledReason?: string | null;
  emphasized?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  status: string;
}) {
  const action = (
    <button
      aria-disabled={disabledReason ? true : undefined}
      className={`${styles.actionButton} ${emphasized ? styles.emphasized : ""}`}
      onClick={disabledReason ? undefined : onClick}
      type="button"
    >
      <span className={styles.actionIcon}>
        <Icon aria-hidden="true" />
      </span>
      <span className={styles.actionLabel}>{label}</span>
      <span className={styles.status}>
        <span aria-hidden="true" className={styles.statusDot} />
        {status}
      </span>
    </button>
  );

  return disabledReason ? (
    <Tooltip>
      <TooltipTrigger asChild>{action}</TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  ) : (
    action
  );
}

function CenteredState({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`grid flex-1 place-items-center text-sm ${
        error ? "text-destructive-text" : "text-muted"
      }`}
    >
      {children}
    </div>
  );
}
