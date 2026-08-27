"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ChevronDown,
  Copy,
  FileMusic,
  GitBranch,
  GitFork,
  PencilLine,
} from "@/components/icons";
import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import { Button, Collapse, Image, Tag } from "antd";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MediaPreview } from "@/components/ui/media-preview";
import type { GenerationToolDetails } from "@/contracts/generation";
import type { GenerationRunViewDto } from "@/contracts/generation";
import { loadGenerationRun } from "@/lib/client/generation-run-api";
import { rawFileUrl } from "@/lib/raw-file-url";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/use-i18n";
import { assistantErrorDetails } from "./assistant-error";
import type {
  AgentMessage,
  AgentFailure,
  AssistantMessage,
  ImageContent,
  TextContent,
  ToolResultMessage,
  UserMessage,
} from "./agent-types";
import { toolResults } from "./chat-logic";
import {
  generationArtifactPath,
  generationDetailsWithView,
  generationToolDetails,
} from "./generation-tool-presentation";
import {
  activeGenerationRunIdsKey,
  generationRunIds,
  generationRunIdsKey,
} from "./generation-polling";
import { GenerationReviewCard } from "./generation-review-card";
import {
  buildMessagePresentation,
  collapseGenerationQueries,
  executionProcessStatus,
  partitionAssistantTurn,
  type AssistantTurnBlock,
  type AssistantTurnPresentationItem,
} from "./message-presentation";
import styles from "./message-view.module.css";

const GENERATION_POLL_INTERVAL_MS = 10_000;

// 懒加载代码块组件，避免将 react-syntax-highlighter 打入主 bundle
const CodeBlock = dynamic(
  () => import("./code-block").then((m) => m.CodeBlock),
  {
    ssr: false,
    loading: () => (
      <div className="my-3 h-16 rounded-floating border border-line-subtle bg-[var(--tool-bg)]" />
    ),
  },
);

export function MessageList({
  messages,
  partialToolResults,
  cwd,
  entryIds,
  streamingMessage,
  running,
  forkingEntryId,
  lastUserRef,
  highlightedMessageId,
  onMessageElement,
  onFork,
  onEdit,
}: {
  messages: AgentMessage[];
  partialToolResults?: Map<string, ToolResultMessage>;
  cwd?: string;
  entryIds: string[];
  streamingMessage: Partial<AssistantMessage> | null;
  running: boolean;
  forkingEntryId: string | null;
  lastUserRef: React.MutableRefObject<HTMLElement | null>;
  highlightedMessageId?: string | null;
  onMessageElement?: (id: string, element: HTMLElement | null) => void;
  onFork: (entryId: string) => void;
  onEdit: (targetId: string, text: string) => void;
}) {
  const results = useMemo(() => {
    const merged = toolResults(messages);
    for (const [toolCallId, result] of partialToolResults ?? []) {
      merged.set(toolCallId, result);
    }
    return merged;
  }, [messages, partialToolResults]);
  const presentation = useMemo(
    () => buildMessagePresentation(messages, entryIds, streamingMessage),
    [entryIds, messages, streamingMessage],
  );
  return (
    <>
      {presentation.map((item, presentationIndex) => {
        if (item.kind === "user") {
          const { entryId, message, originalIndex } = item;
          const previous =
            originalIndex > 0 ? messages[originalIndex - 1] : null;
          const previousEntryId =
            originalIndex > 0 ? entryIds[originalIndex - 1] : undefined;
          const navigatorId =
            entryId ??
            message.clientId ??
            `user-${message.timestamp ?? "untimed"}-${originalIndex}`;
          const isLastUser = !presentation
            .slice(presentationIndex + 1)
            .some((candidate) => candidate.kind === "user");
          const highlighted = highlightedMessageId === navigatorId;
          return (
            <article
              className={cn(
                "group relative mb-6 scroll-mt-4 px-2 py-1 transition-[background-color,outline-color] duration-[var(--motion-fast)] -mx-2",
                highlighted &&
                  "bg-subtle outline outline-1 outline-line-strong",
              )}
              data-message-role="user"
              key={entryId ?? navigatorId}
              ref={(element) => {
                onMessageElement?.(navigatorId, element);
                if (isLastUser) lastUserRef.current = element;
              }}
            >
              <UserMessageView
                canEdit={
                  previous?.role === "assistant" && Boolean(previousEntryId)
                }
                canFork={Boolean(entryId) && presentationIndex > 0}
                entryId={entryId}
                forking={forkingEntryId === entryId}
                message={message}
                cwd={cwd}
                onEdit={() =>
                  previousEntryId &&
                  onEdit(previousEntryId, messageText(message))
                }
                onFork={() => entryId && onFork(entryId)}
                running={running}
              />
            </article>
          );
        }

        const messageIds = [
          ...item.entryIds,
          ...(item.streaming ? ["streaming-assistant"] : []),
        ];
        const messageId =
          messageIds[0] ??
          `assistant-${item.messages[0]?.timestamp ?? "untimed"}-${presentationIndex}`;
        const highlighted =
          highlightedMessageId !== null &&
          highlightedMessageId !== undefined &&
          messageIds.includes(highlightedMessageId);
        const previousUser = [...presentation.slice(0, presentationIndex)]
          .reverse()
          .find((candidate) => candidate.kind === "user");
        const logicalTurnKey = previousUser?.kind === "user"
          ? previousUser.entryId ?? previousUser.message.clientId ?? previousUser.message.timestamp
          : undefined;
        return (
          <article
            className={cn(
              "group relative mb-6 scroll-mt-4 px-2 py-1 transition-[background-color,outline-color] duration-[var(--motion-fast)] -mx-2",
              highlighted && "bg-subtle outline outline-1 outline-line-strong",
            )}
            data-message-role="assistant"
            data-streaming={item.streaming || undefined}
            key={logicalTurnKey ? `assistant-turn-${logicalTurnKey}` : messageId}
            ref={(element) => {
              for (const id of messageIds) {
                onMessageElement?.(id, element);
              }
            }}
          >
            <AssistantTurnView
              active={running && presentationIndex === presentation.length - 1}
              cwd={cwd}
              results={results}
              turn={item}
            />
          </article>
        );
      })}
    </>
  );
}

function UserMessageView({
  message,
  cwd,
  entryId,
  running,
  canEdit,
  canFork,
  forking,
  onEdit,
  onFork,
}: {
  message: UserMessage;
  cwd?: string;
  entryId?: string;
  running: boolean;
  canEdit: boolean;
  canFork: boolean;
  forking: boolean;
  onEdit: () => void;
  onFork: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [selectedAssetIndex, setSelectedAssetIndex] = useState<number | null>(null);
  const { t } = useI18n();
  const blocks =
    typeof message.content === "string"
      ? [{ type: "text" as const, text: message.content }]
      : message.content;
  // 按类型分组，避免空图片容器占据 first-child 导致文本块的 first:mt-0 失效
  const imageBlocks = blocks.filter(
    (block): block is ImageContent => block.type === "image",
  );
  const textBlocks = blocks.filter(
    (block): block is TextContent => block.type === "text",
  );
  const selectedAsset = selectedAssetIndex !== null
    ? message.generationAssets?.[selectedAssetIndex]
    : undefined;
  const selectedAssetSource = selectedAsset?.ref.type === "workspace-file" && cwd
    ? rawFileUrl(generationArtifactPath(cwd, selectedAsset.ref.relativePath))
    : undefined;
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[78%] rounded-floating bg-[var(--user-bg)] px-3.5 py-2 text-sm leading-[1.6] break-words whitespace-pre-wrap">
       {message.generationAssets?.length ? (
          <div className="mb-2 flex flex-wrap gap-2 first:mb-0">
           {message.generationAssets.map((asset, index) => {
             const source = asset.ref.type === "workspace-file" && cwd
               ? rawFileUrl(generationArtifactPath(cwd, asset.ref.relativePath))
               : undefined;
             return source ? (
               asset.mimeType.startsWith("image/") ? (
                 // 图片素材与产物画廊统一：固定 160x112 磁贴 + object-cover + 边框/背景/圆角
                 <Image
                   alt={asset.name}
                   className="size-full rounded-md border border-line-subtle bg-subtle object-cover"
                   height={112}
                   key={`${asset.slot}-${asset.name}-${index}`}
                   src={source}
                   width={160}
                 />
               ) : (
                  // 非图片素材与产物画廊统一：固定 160x112 磁贴 + 点击弹窗预览
                 <button
                   aria-label={asset.name}
                    className="relative h-28 w-40 overflow-hidden rounded-md border border-line-subtle bg-subtle outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring"
                   key={`${asset.slot}-${asset.name}-${index}`}
                   onClick={() => setSelectedAssetIndex(index)}
                   type="button"
                 >
                  {asset.mimeType.startsWith("video/") ? (
                      <>
                      <video className="size-full object-cover" muted playsInline preload="metadata" src={source} />
                      <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-caption font-medium text-white/90">
                        {asset.mimeType.split("/")[1]?.toUpperCase()}
                      </span>
                      </>
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted">
                      <FileMusic className="size-7" />
                      <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-caption font-medium text-white/90">
                        {asset.mimeType.split("/")[1]?.toUpperCase()}
                      </span>
                    </div>
                  )}
                 </button>
               )
             ) : (
               <div
                 className="rounded-lg border border-line-subtle px-3 py-2 text-xs text-muted"
                 key={`${asset.slot}-${asset.name}-${index}`}
               >
                 {asset.name}
               </div>
             );
           })}
         </div>
        ) : null}
        {imageBlocks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
           {/* image content */}
            {/* 固定 160x112 缩略磁贴 + object-cover 填充；与生成产物图保持一致的边框/背景/圆角。
                antd Image 的 className 只作用于内层 img（自带 width:100%），百分比/最大尺寸约束在
                flex 布局中解析不稳定，因此用 width/height props 固定盒子尺寸。 */}
           {imageBlocks.map((block, index) => (
             <Image
               alt={t.chat.message.attachedImage}
                className="size-full rounded-md border border-line-subtle bg-subtle object-cover"
               height={112}
               key={index}
               src={
                  block.source.url ??
                  `data:${block.source.mediaType};base64,${block.source.data}`
                }
                width={160}
              />
            ))}
          </div>
        ) : null}

        {/* text content */}
        <CollapsibleUserText blocks={textBlocks} />
      </div>

      <div className="mt-1 flex min-h-7 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {message.status === "failed" ? (
          <Tag color="error" variant="filled">
            {t.chat.message.failed}
          </Tag>
        ) : null}

        <div className="flex items-center gap-1">
          {/* copy */}
          <SmallAction
            label={copied ? t.chat.message.copied : t.chat.message.copy}
            onClick={() =>
              void copyText(messageText(message)).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? <Check /> : <Copy />}
          </SmallAction>
          {/* 从此处编辑 */}
          {canEdit && !running ? (
            <SmallAction label={t.chat.message.editFromHere} onClick={onEdit}>
              <PencilLine />
            </SmallAction>
          ) : null}
          {/* 新会话 */}
          {canFork && entryId && !running ? (
            <SmallAction
              disabled={forking}
              label={
                forking ? t.chat.message.creating : t.chat.message.newSession
              }
              onClick={onFork}
            >
              <GitFork />
            </SmallAction>
          ) : null}
        </div>

        {/* time */}
        {message.timestamp ? <MessageTime value={message.timestamp} /> : null}
      </div>
      <Dialog
        open={selectedAsset !== undefined}
        onOpenChange={(open) => !open && setSelectedAssetIndex(null)}
      >
        {selectedAsset && selectedAssetSource ? (
          <DialogContent
            className="max-h-[90vh] max-w-5xl grid-rows-[auto,minmax(0,1fr),auto]"
            closeLabel={t.common.close}
          >
            <DialogHeader>
              <DialogTitle>{selectedAsset.name}</DialogTitle>
            </DialogHeader>
            <MediaPreview
              className="min-h-64 max-h-[70vh]"
              contentType={selectedAsset.mimeType}
              name={selectedAsset.name}
              src={selectedAssetSource}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

// 用户消息文本过长时自动收起，点击切换展开/收起。
// 使用 CSS line-clamp 限制收起时的可见行数，并通过 scrollHeight 与 clientHeight
// 的差值判断是否溢出，仅在实际溢出时显示切换按钮。
function CollapsibleUserText({ blocks }: { blocks: TextContent[] }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // 折叠态下比较 scrollHeight 与 clientHeight 判断是否被截断；
  // 展开态直接跳过，overflowing 保留上次值以维持按钮可见。
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || expanded) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    // 仅依赖 expanded：首次挂载和展开/收起切换时检查溢出；
    // 视口和内容变化由下方 ResizeObserver 覆盖。
  }, [expanded]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const check = () => {
      if (expanded) return;
      setOverflowing(el.scrollHeight > el.clientHeight + 1);
    };
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded]);

  if (blocks.length === 0) return null;

  const text = blocks.map((block) => block.text).join("\n");

  return (
    <div className="mt-1 first:mt-0">
      <div
        className={cn("whitespace-pre-wrap", !expanded && "line-clamp-[8]")}
        ref={contentRef}
      >
        {text}
      </div>
      {overflowing ? (
        <button
          className="mt-1 flex items-center gap-0.5 text-caption text-dim transition-colors hover:text-primary"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? t.chat.message.collapse : t.chat.message.expand}
          <ChevronDown
            className={cn(
              "size-3 transition-transform duration-[var(--motion-fast)]",
              expanded && "rotate-180",
            )}
          />
        </button>
      ) : null}
    </div>
  );
}

function AssistantTurnView({
  active,
  turn,
  results,
  cwd,
}: {
  active: boolean;
  turn: AssistantTurnPresentationItem;
  results: Map<string, ToolResultMessage>;
  cwd?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [errorCopied, setErrorCopied] = useState(false);
  const { t } = useI18n();
  const { final, process: rawProcess } = useMemo(
    () => partitionAssistantTurn(turn),
    [turn],
  );
  const process = useMemo(() => collapseGenerationQueries(rawProcess), [rawProcess]);
  const sourceGenerationDetails = useMemo(() => {
    const unique = new Map<string, GenerationToolDetails>();
    for (const step of process) {
      if (step.block.type !== "toolCall") continue;
      const details = generationToolDetails(results.get(step.block.toolCallId)?.details);
      if (details) unique.set(details.runId, details);
    }
    return [...unique.values()];
  }, [process, results]);
  const [generationViews, setGenerationViews] = useState(
    () => new Map<string, GenerationRunViewDto>(),
  );
  const runIdsKey = generationRunIdsKey(sourceGenerationDetails);
  const activeRunIdsKey = activeGenerationRunIdsKey(
    sourceGenerationDetails,
    generationViews,
  );
  useEffect(() => {
    const runIds = generationRunIds(runIdsKey);
    if (!runIds.length) return;
    let disposed = false;
    const controller = new AbortController();
    const refresh = async () => {
      const settled = await Promise.allSettled(
        runIds.map((runId) => loadGenerationRun(runId, controller.signal)),
      );
      if (disposed) return;
      setGenerationViews((current) => {
        const next = new Map(current);
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") {
            next.set(runIds[index]!, result.value);
          }
        });
        return next;
      });
    };
    void refresh();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [runIdsKey]);
  useEffect(() => {
    const runIds = generationRunIds(activeRunIdsKey);
    if (!runIds.length) return;
    let disposed = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    const poll = async () => {
      controller = new AbortController();
      const settled = await Promise.allSettled(
        runIds.map((runId) => loadGenerationRun(runId, controller!.signal)),
      );
      if (disposed) return;
      setGenerationViews((current) => {
        const next = new Map(current);
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") next.set(runIds[index]!, result.value);
        });
        return next;
      });
      // 上一次请求结束后再计时，避免慢请求叠加成并发轮询。
      timer = window.setTimeout(poll, GENERATION_POLL_INTERVAL_MS);
    };
    timer = window.setTimeout(poll, GENERATION_POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [activeRunIdsKey]);
  const currentResults = useMemo(() => {
    const next = new Map(results);
    for (const step of process) {
      if (step.block.type !== "toolCall") continue;
      const result = results.get(step.block.toolCallId);
      const details = generationToolDetails(result?.details);
      if (!result || !details) continue;
      next.set(step.block.toolCallId, {
        ...result,
        details: generationDetailsWithView(details, generationViews.get(details.runId)),
      });
    }
    return next;
  }, [generationViews, process, results]);
  const status = useMemo(
    () => executionProcessStatus(process, currentResults, turn.streaming),
    [currentResults, process, turn.streaming],
  );
  const latestMessage = turn.messages.at(-1);
  const identityMessage =
    [...turn.messages]
      .reverse()
      .find((candidate) => candidate.provider || candidate.model) ??
    latestMessage;
  const errorMessage = turn.messages.find(
    (candidate) => assistantErrorDetails(candidate) !== null,
  );
  const error = errorMessage ? assistantErrorDetails(errorMessage) : null;
  const text = final
    .filter(
      (item): item is AssistantTurnBlock & { block: TextContent } =>
        item.block.type === "text",
    )
    .map((item) => item.block.text)
    .join("\n\n");
  const generatedArtifacts = useMemo(() => {
    const unique = new Map<string, GenerationToolDetails["artifacts"][number]>();
    for (const step of process) {
      if (step.block.type !== "toolCall") continue;
      const details = generationToolDetails(currentResults.get(step.block.toolCallId)?.details);
      if (details?.status !== "succeeded" || details.review) continue;
      for (const artifact of details.artifacts) {
        if (artifact.kind === "image" || artifact.kind === "video") unique.set(artifact.id, artifact);
      }
    }
    return [...unique.values()];
  }, [currentResults, process]);
  const generationReviews = useMemo(() => {
    const unique = new Map<string, GenerationToolDetails>();
    for (const step of process) {
      if (step.block.type !== "toolCall") continue;
      const details = generationToolDetails(currentResults.get(step.block.toolCallId)?.details);
      if (details?.review) unique.set(details.runId, details);
    }
    return [...unique.values()];
  }, [currentResults, process]);

  return (
    <div>
      <div
        className="mb-2 text-meta font-medium text-dim"
        title={
          identityMessage?.provider && identityMessage.model
            ? `${identityMessage.provider}:${identityMessage.model}`
            : undefined
        }
      >
        {identityMessage?.provider && identityMessage.model
          ? identityMessage.model
          : "Pi Agent"}
      </div>

      {process.length ? (
        <ExecutionProcess
          active={active}
          assistantError={Boolean(error)}
          cwd={cwd}
          process={process}
          results={currentResults}
          status={status}
        />
      ) : null}

      {error ? (
        <div
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive-text" />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-destructive-text">
                {failureSummary(error.code, error.summary, t)}
              </div>
              <div className="mt-1 text-xs text-muted">
                {errorMessage?.provider && errorMessage.model
                  ? `${errorMessage.provider}:${errorMessage.model} · `
                  : ""}
                {t.chat.error.code}: {error.code}
              </div>
              {error.technicalMessage ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-muted hover:text-primary">
                    {t.chat.error.technicalDetails}
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-floating border border-line-subtle bg-[var(--tool-bg)] p-2 font-ui-mono text-meta text-muted">
                    {error.technicalMessage}
                  </pre>
                  <Button
                    className="mt-2 h-7 px-2 text-caption"
                    htmlType="button"
                    onClick={() =>
                      void copyText(error.technicalMessage ?? "").then(() => {
                        setErrorCopied(true);
                        window.setTimeout(() => setErrorCopied(false), 1500);
                      })
                    }
                    size="small"
                  >
                    {errorCopied
                      ? t.chat.error.copied
                      : t.chat.error.copyDetails}
                  </Button>
                </details>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {final.length ? (
        <div className={process.length || error ? "mt-3" : undefined}>
          {final.map(({ block }, index) => (
            <FinalAssistantBlock block={block} key={index} />
          ))}
        </div>
      ) : null}

      {generationReviews.map((details) => (
        <GenerationReviewCard
          cwd={cwd}
          details={details}
          key={details.runId}
          onViewChange={(view) => setGenerationViews((current) =>
            new Map(current).set(details.runId, view)
          )}
          view={generationViews.get(details.runId)}
        />
      ))}

      {generatedArtifacts.length ? (
        <GenerationArtifactGallery artifacts={generatedArtifacts} cwd={cwd} />
      ) : null}

      {!turn.streaming ? (
        <div className="mt-2 flex min-h-7 items-center gap-2 text-caption text-dim opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {/*  copy button */}
          {text ? (
            <SmallAction
              label={copied ? t.chat.message.copied : t.chat.message.copy}
              onClick={() =>
                void copyText(text).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                })
              }
            >
              {copied ? <Check /> : <Copy />}
            </SmallAction>
          ) : null}

          {latestMessage?.timestamp ? (
            <MessageTime value={latestMessage.timestamp} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ExecutionProcess({
  active,
  process,
  results,
  status,
  assistantError,
  cwd,
}: {
  active: boolean;
  process: AssistantTurnBlock[];
  results: Map<string, ToolResultMessage>;
  status: ReturnType<typeof executionProcessStatus>;
  assistantError: boolean;
  cwd?: string;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(active || assistantError ? "execution-process" : "");
  const userControlled = useRef(false);
  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current && !userControlled.current) {
      setValue("execution-process");
    }
    wasActive.current = active;
  }, [active]);

  return (
    <Collapse
      accordion
      activeKey={value || undefined}
      className="my-1.5"
      items={[
        {
          children: (
            <div className="max-h-[min(52vh,520px)] overflow-auto p-0 font-sans whitespace-normal">
              <div className={styles.stepList}>
                {process.map((step, index) => (
                  <ExecutionStep
                    cwd={cwd}
                    key={executionStepKey(step, index)}
                    result={
                      step.block.type === "toolCall"
                        ? results.get(step.block.toolCallId)
                        : undefined
                    }
                    step={step}
                  />
                ))}
              </div>
            </div>
          ),
          key: "execution-process",
          label: (
            <>
              <GitBranch className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                {t.chat.message.executionProcess} · {status.stepCount}{" "}
                {t.chat.message.executionSteps}
              </span>
            </>
          ),
        },
      ]}
      onChange={(nextKey) => {
        userControlled.current = true;
        setValue(
          Array.isArray(nextKey)
            ? String(nextKey[0] ?? "")
            : String(nextKey ?? ""),
        );
      }}
      size="small"
    />
  );
}

function ExecutionStep({
  step,
  result,
  cwd,
}: {
  step: AssistantTurnBlock;
  result?: ToolResultMessage;
  cwd?: string;
}) {
  const { t } = useI18n();
  const { block } = step;

  if (block.type === "image") {
    return (
      <div className="p-2.5">
        <AssistantImage block={block} />
      </div>
    );
  }

  if (block.type === "toolCall") {
    const summary = toolSummary(block.input);
    const generation = generationToolDetails(result?.details);
    const generationFinished = generation
      ? ["succeeded", "failed", "cancelled"].includes(generation.status)
      : Boolean(result);
    const generationAwaitingReview =
      generation?.status === "awaiting_confirmation";
    const toolFailed = Boolean(result?.isError || generation?.status === "failed");
    const statusLabel = toolFailed
      ? t.chat.message.toolError
      : generationAwaitingReview
        ? t.chat.message.generationAwaitingReview
      : generationFinished
        ? t.chat.message.toolDone
        : t.chat.message.toolRunning;
    return (
      <details className={styles.stepDetails}>
        <summary
          className={styles.stepSummary}
          title={summary ? `${block.toolName} ${summary}` : block.toolName}
        >
          <GitBranch className="size-3.5 text-muted" />
          <span className="min-w-0 truncate font-ui-mono text-meta text-muted">
            <span className="font-medium text-primary">{block.toolName}</span>
            {summary ? ` ${summary}` : ""}
            {step.repeatCount && step.repeatCount > 1 ? ` × ${step.repeatCount}` : ""}
          </span>
          <Tag
            className={styles.stepStatus}
            color={
              toolFailed
                ? "error"
                : generationAwaitingReview
                  ? "warning"
                  : generationFinished
                    ? "success"
                    : undefined
            }
            variant={
              toolFailed || generationFinished || generationAwaitingReview
                ? "filled"
                : "outlined"
            }
          >
            {statusLabel}
          </Tag>
          <ChevronRight className={styles.stepChevron} />
        </summary>
        {generation ? (
          <GenerationToolResult cwd={cwd} details={generation} toolInput={block.input} />
        ) : (
          <pre className="max-h-[400px] overflow-auto border-t border-line-subtle bg-[var(--tool-bg)] px-3 py-2.5 font-ui-mono text-meta leading-[1.65] whitespace-pre-wrap text-muted">
            {JSON.stringify(block.input, null, 2)}
            {"\n\n"}
            {result ? resultText(result, t) : t.chat.message.waitingForOutput}
          </pre>
        )}
      </details>
    );
  }

  const label =
    block.type === "thinking"
      ? t.chat.message.thinking
      : t.chat.message.executionNote;
  const content = block.type === "thinking" ? block.thinking : block.text;
  return (
    <details className={styles.stepDetails}>
      <summary className={styles.stepSummary}>
        <span className="size-1.5 justify-self-center rounded-full bg-line-strong" />
        <span className="min-w-0 truncate text-meta text-muted">
          <span className="font-medium text-primary">{label}</span>
          {content ? ` ${firstLine(content, 100)}` : ""}
        </span>
        <span />
        <ChevronRight className={styles.stepChevron} />
      </summary>
      <div className="border-t border-line-subtle bg-[var(--tool-bg)] px-3 py-2.5 text-meta leading-[1.65] whitespace-pre-wrap text-muted">
        {block.type === "text" ? <Markdown text={content} /> : content}
      </div>
    </details>
  );
}

function FinalAssistantBlock({ block }: { block: TextContent | ImageContent }) {
  if (block.type === "text") return <Markdown text={block.text} />;
  return <AssistantImage block={block} />;
}

function GenerationToolResult({
  details,
  cwd,
  toolInput,
}: {
  details: GenerationToolDetails;
  cwd?: string;
  toolInput: Record<string, unknown>;
}) {
  const { t } = useI18n();
  const elapsedMs = useElapsedMs(details.createdAt, details.completedAt);
  return (
    <div className="space-y-2 border-t border-line-subtle bg-[var(--tool-bg)] p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-ui-mono text-muted" title={details.runId}>
          {t.chat.message.generationRunId} {details.runId.slice(0, 8)}
        </span>
        <Tag
          color={
            details.error
              ? "error"
              : details.status === "succeeded"
                ? "success"
                : undefined
          }
          variant={
            details.error || details.status === "succeeded"
              ? "filled"
              : "outlined"
          }
        >
          {t.contentGeneration.toolPhases[details.phase]}
        </Tag>
      </div>
      {details.providerTaskId ? (
        <div className="flex min-w-0 items-center gap-2 text-caption text-muted">
          <span className="shrink-0">
            {details.providerId === "runninghub"
              ? t.chat.message.runningHubTaskId
              : t.chat.message.providerTaskId}
          </span>
          <span
            className="truncate font-ui-mono text-foreground"
            title={details.providerTaskId}
          >
            {details.providerTaskId}
          </span>
        </div>
      ) : null}
      {details.createdAt ? (
        <p className="text-caption text-muted">
          {details.completedAt ? t.chat.message.generationDuration : t.chat.message.generationElapsed}{" "}
          {formatDuration(elapsedMs)}
          {details.waitTimedOut ? ` · ${t.chat.message.generationContinuesInBackground}` : ""}
        </p>
      ) : null}
      <div className="grid gap-2 text-xs">
        <GenerationAuditSection
          label={t.chat.message.generationToolInput}
          value={toolInput}
        />
        {details.input ? (
          <GenerationAuditSection
            label={t.chat.message.generationResolvedInput}
            value={{
              routeId: details.routeId,
              providerId: details.providerId,
              providerOperation: details.providerOperation,
              ...details.input,
            }}
          />
        ) : null}
        {details.requestSnapshot !== undefined ? (
          <GenerationAuditSection
            label={t.chat.message.generationProviderRequest}
            value={details.requestSnapshot}
          />
        ) : null}
        {details.responseSnapshot !== undefined ? (
          <GenerationAuditSection
            label={t.chat.message.generationProviderResponse}
            value={details.responseSnapshot}
          />
        ) : null}
      </div>
      {details.error ? (
        <p className="text-xs text-destructive-text">
          {details.error.code}: {details.error.message}
        </p>
      ) : null}

      {details.artifacts.map((artifact, index) => {
        const absolutePath =
          artifact.localPath && cwd
            ? generationArtifactPath(cwd, artifact.localPath)
            : null;
        return (
          <div
            className="overflow-hidden rounded-md border border-line-subtle bg-canvas"
            key={artifact.id}
          >
            {absolutePath &&
            artifact.contentType &&
            artifact.kind !== "text" ? (
              // 执行过程处于限高滚动容器内：图片固定 160x112 缩略磁贴避免长图撑出滚动条；视频/音频保留原展示。
              artifact.contentType.startsWith("image/") ? (
                <div className="p-3">
                  <Image
                    alt={`${t.chat.message.generationArtifact} ${index + 1}`}
                    className="size-full object-contain"
                    height={112}
                    src={rawFileUrl(absolutePath)}
                    width={160}
                  />
                </div>
              ) : (
                <MediaPreview
                  className="max-h-72 min-h-36"
                  contentType={artifact.contentType}
                  name={`${t.chat.message.generationArtifact} ${index + 1}`}
                  src={rawFileUrl(absolutePath)}
                />
              )
            ) : null}
            {artifact.text ? (
              <p className="whitespace-pre-wrap p-3 text-sm">
                {artifact.text}
              </p>
            ) : null}
            {artifact.localPath ? (
              <p className="border-t border-line-subtle px-3 py-2 font-ui-mono text-caption text-muted">
                {artifact.localPath}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function GenerationAuditSection({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <details className="rounded-md border border-line-subtle bg-canvas">
      <summary className="cursor-pointer select-none px-3 py-2 text-muted">
        {label}
      </summary>
      <pre className="max-h-80 overflow-auto border-t border-line-subtle px-3 py-2.5 font-ui-mono text-caption leading-[1.6] whitespace-pre-wrap text-primary">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function useElapsedMs(createdAt?: string, completedAt?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (completedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [completedAt]);
  const start = createdAt ? Date.parse(createdAt) : Number.NaN;
  const end = completedAt ? Date.parse(completedAt) : now;
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
}

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function GenerationArtifactGallery({
  artifacts,
  cwd,
}: {
  artifacts: GenerationToolDetails["artifacts"];
  cwd?: string;
}) {
  const { t } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = artifacts.find((artifact) => artifact.id === selectedId);
  return (
    <div className="mt-3 space-y-2" data-generation-artifacts>
      <div className="flex flex-wrap gap-2">
        {artifacts.map((artifact, index) => {
          const absolutePath = artifact.localPath && cwd
            ? generationArtifactPath(cwd, artifact.localPath)
            : null;
          const src = absolutePath ? rawFileUrl(absolutePath) : artifact.remoteUrl;
          if (!src || !artifact.contentType) return null;
          // 图片产物直接用 antd Image 内置预览；antd 预览不支持视频，视频保留按钮 + 弹窗。
          if (artifact.kind === "image") {
            return (
              <Image
                alt={`${t.chat.message.generationArtifact} ${index + 1}`}
                className="size-full rounded-md border border-line-subtle bg-subtle object-cover"
                height={112}
                key={artifact.id}
                src={src}
                width={160}
              />
            );
          }
         return (
           <button
             aria-label={`${t.chat.message.openGenerationArtifact} ${index + 1}`}
              className="relative h-28 w-40 overflow-hidden rounded-md border border-line-subtle bg-subtle outline-none hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring"
             key={artifact.id}
             onClick={() => setSelectedId(artifact.id)}
             type="button"
          >
              <video className="size-full object-cover" muted playsInline preload="metadata" src={src} />
              <span className="pointer-events-none absolute right-1 top-1 rounded bg-black/70 px-1 py-0.5 text-caption font-medium text-white/90">
                {artifact.contentType?.split("/")[1]?.toUpperCase()}
              </span>
          </button>
          );
        })}
      </div>
      {artifacts.map((artifact) => artifact.localPath ? (
        <p className="break-all font-ui-mono text-caption text-muted" key={`${artifact.id}-path`}>
          {artifact.localPath}
        </p>
      ) : null)}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        {selected ? (
          <DialogContent className="max-h-[90vh] max-w-5xl grid-rows-[auto,minmax(0,1fr),auto]" closeLabel={t.common.close}>
            <DialogHeader>
              <DialogTitle>{t.chat.message.generationArtifact}</DialogTitle>
            </DialogHeader>
            {selected.contentType ? (
              <MediaPreview
                className="min-h-64 max-h-[70vh]"
                contentType={selected.contentType}
                name={t.chat.message.generationArtifact}
                src={selected.localPath && cwd
                  ? rawFileUrl(generationArtifactPath(cwd, selected.localPath))
                  : selected.remoteUrl ?? ""}
              />
            ) : null}
            {selected.localPath ? <p className="break-all font-ui-mono text-caption text-muted">{selected.localPath}</p> : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
function AssistantImage({ block }: { block: ImageContent }) {
  const { t } = useI18n();
  // 执行过程/最终回复统一渲染为固定 160x112 缩略磁贴，长图不再撑出滚动条，点击放大看全图。
  return (
    <Image
      alt={t.chat.message.assistantImage}
      className="my-2 size-full rounded-lg object-contain"
      height={112}
      src={
        block.source.url ??
        `data:${block.source.mediaType};base64,${block.source.data}`
      }
      width={160}
    />
  );
}

function executionStepKey(step: AssistantTurnBlock, index: number) {
  return step.block.type === "toolCall"
    ? step.block.toolCallId
    : `${step.messageIndex}-${step.block.type}-${index}`;
}

function failureSummary(
  code: AgentFailure["code"],
  fallback: string,
  t: ReturnType<typeof useI18n>["t"],
) {
  switch (code) {
    case "MODEL_AUTH_FAILED":
      return t.chat.error.authFailed;
    case "MODEL_RATE_LIMITED":
      return t.chat.error.rateLimited;
    case "MODEL_PROTOCOL_ERROR":
      return t.chat.error.protocolError;
    case "MODEL_TIMEOUT":
      return t.chat.error.timeout;
    case "MODEL_UNAVAILABLE":
      return t.chat.error.unavailable;
    default:
      return fallback || t.chat.error.requestFailed;
  }
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="text-prose leading-[1.65] text-primary [&_a]:text-accent-hover [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-line-subtle [&_blockquote]:pl-3 [&_code]:rounded [&_code]:font-ui-mono [&_li]:my-1 [&_ol]:my-2.5 [&_ol]:pl-6 [&_p]:my-2.5 [&_table]:my-3 [&_table]:w-full [&_td]:border [&_td]:border-line-subtle [&_td]:p-2 [&_th]:border [&_th]:border-line-subtle [&_th]:p-2 [&_ul]:my-2.5 [&_ul]:pl-6">
      <ReactMarkdown
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? "");
            const code = String(children).replace(/\n$/, "");
            if (!match) {
              return (
                <code
                  className="rounded bg-selected px-1 py-0.5 text-[0.88em]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return <CodeBlock code={code} language={match[1]} />;
          },
        }}
        remarkPlugins={[remarkGfm]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function SmallAction({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      aria-label={label}
      className="h-7 px-2 text-caption"
      disabled={disabled}
      htmlType="button"
      icon={children}
      onClick={onClick}
      size="small"
      title={label}
      type="text"
    >
      <span>{label}</span>
    </Button>
  );
}

function MessageTime({ value }: { value: number }) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return (
    <time>
      {date.toLocaleString([], {
        year:
          date.getFullYear() === today.getFullYear() ? undefined : "numeric",
        month: sameDay ? undefined : "short",
        day: sameDay ? undefined : "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </time>
  );
}

function messageText(message: UserMessage) {
  return typeof message.content === "string"
    ? message.content
    : message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");
}

function resultText(
  message: ToolResultMessage,
  t: ReturnType<typeof useI18n>["t"],
) {
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  return text.trim() && text !== t.chat.message.noOutput
    ? text
    : t.chat.message.noOutput;
}

function toolSummary(input: Record<string, unknown>) {
  const keys = ["command", "path", "file_path", "pattern", "query"];
  const key =
    keys.find((candidate) => candidate in input) ?? Object.keys(input)[0];
  return key ? String(input[key]).slice(0, 120) : "";
}

function firstLine(text: string, limit: number) {
  const line = text.trim().split(/\r?\n/, 1)[0] ?? "";
  return line.length > limit ? `${line.slice(0, limit)}…` : line;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
