"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  GitBranch,
  GitFork,
  PencilLine,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { MediaPreview } from "@/components/ui/media-preview";
import type { GenerationToolDetails } from "@/contracts/generation";
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
  generationToolDetails,
} from "./generation-tool-presentation";
import {
  buildMessagePresentation,
  executionProcessStatus,
  partitionAssistantTurn,
  type AssistantTurnBlock,
  type AssistantTurnPresentationItem,
} from "./message-presentation";
import styles from "./message-view.module.css";

// 懒加载代码块组件，避免将 react-syntax-highlighter 打入主 bundle
const CodeBlock = dynamic(
  () => import("./code-block").then((m) => m.CodeBlock),
  {
    ssr: false,
    loading: () => (
      <div className="my-3 h-16 rounded-2xl border border-line-subtle bg-[var(--tool-bg)]" />
    ),
  },
);

export function MessageList({
  messages,
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
  const results = useMemo(() => toolResults(messages), [messages]);
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
                "group relative mb-8 scroll-mt-4 px-2 py-1 transition-[background-color,outline-color] duration-[var(--motion-fast)] -mx-2",
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
        return (
          <article
            className={cn(
              "group relative mb-8 scroll-mt-4 px-2 py-1 transition-[background-color,outline-color] duration-[var(--motion-fast)] -mx-2",
              highlighted && "bg-subtle outline outline-1 outline-line-strong",
            )}
            data-message-role="assistant"
            data-streaming={item.streaming || undefined}
            key={messageId}
            ref={(element) => {
              for (const id of messageIds) {
                onMessageElement?.(id, element);
              }
            }}
          >
            <AssistantTurnView cwd={cwd} results={results} turn={item} />
          </article>
        );
      })}
    </>
  );
}

function UserMessageView({
  message,
  entryId,
  running,
  canEdit,
  canFork,
  forking,
  onEdit,
  onFork,
}: {
  message: UserMessage;
  entryId?: string;
  running: boolean;
  canEdit: boolean;
  canFork: boolean;
  forking: boolean;
  onEdit: () => void;
  onFork: () => void;
}) {
  const [copied, setCopied] = useState(false);
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
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[78%] rounded-2xl bg-[var(--user-bg)] px-4 py-2.5 text-sm leading-[1.65] break-words whitespace-pre-wrap">
        {imageBlocks.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {/* image content */}
            {imageBlocks.map((block, index) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={t.chat.message.attachedImage}
                className="max-h-60 max-w-60 rounded-lg object-contain"
                key={index}
                src={
                  block.source.url ??
                  `data:${block.source.mediaType};base64,${block.source.data}`
                }
              />
            ))}
          </div>
        ) : null}

        {/* text content */}
        {textBlocks.map((block, index) => (
          <div className="mt-1 first:mt-0" key={index}>
            {block.text}
          </div>
        ))}
      </div>

      <div className="mt-1 flex min-h-7 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {message.status === "failed" ? (
          <Badge variant="destructive">{t.chat.message.failed}</Badge>
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
    </div>
  );
}

function AssistantTurnView({
  turn,
  results,
  cwd,
}: {
  turn: AssistantTurnPresentationItem;
  results: Map<string, ToolResultMessage>;
  cwd?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [errorCopied, setErrorCopied] = useState(false);
  const { t } = useI18n();
  const { final, process } = useMemo(
    () => partitionAssistantTurn(turn),
    [turn],
  );
  const status = useMemo(
    () => executionProcessStatus(process, results, turn.streaming),
    [process, results, turn.streaming],
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
          assistantError={Boolean(error)}
          cwd={cwd}
          process={process}
          results={results}
          status={status}
          streaming={turn.streaming}
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
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-line-subtle bg-[var(--tool-bg)] p-2 font-ui-mono text-meta text-muted">
                    {error.technicalMessage}
                  </pre>
                  <Button
                    className="mt-2 h-7 px-2 text-caption"
                    onClick={() =>
                      void copyText(error.technicalMessage ?? "").then(() => {
                        setErrorCopied(true);
                        window.setTimeout(() => setErrorCopied(false), 1500);
                      })
                    }
                    size="sm"
                    variant="outline"
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
  process,
  results,
  status,
  streaming,
  assistantError,
  cwd,
}: {
  process: AssistantTurnBlock[];
  results: Map<string, ToolResultMessage>;
  status: ReturnType<typeof executionProcessStatus>;
  streaming: boolean;
  assistantError: boolean;
  cwd?: string;
}) {
  const { t } = useI18n();
  const automaticValue = streaming || assistantError ? "execution-process" : "";
  const [value, setValue] = useState(automaticValue);
  const userControlled = useRef(false);

  useEffect(() => {
    if (!userControlled.current) setValue(automaticValue);
  }, [automaticValue]);

  return (
    <Accordion
      className="my-1.5"
      collapsible
      onValueChange={(nextValue) => {
        userControlled.current = true;
        setValue(nextValue);
      }}
      type="single"
      value={value}
    >
      <AccordionItem value="execution-process">
        <AccordionTrigger>
          <GitBranch className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {t.chat.message.executionProcess} · {status.stepCount}{" "}
            {t.chat.message.executionSteps}
          </span>
        </AccordionTrigger>
        <AccordionContent className="max-h-[min(52vh,520px)] overflow-auto p-0 font-sans whitespace-normal">
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
        </AccordionContent>
      </AccordionItem>
    </Accordion>
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
    const statusLabel = result?.isError
      ? t.chat.message.toolError
      : result
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
          </span>
          <Badge
            className={styles.stepStatus}
            variant={
              result?.isError ? "destructive" : result ? "success" : "outline"
            }
          >
            {statusLabel}
          </Badge>
          <ChevronRight className={styles.stepChevron} />
        </summary>
        {generation ? (
          <GenerationToolResult cwd={cwd} details={generation} />
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
}: {
  details: GenerationToolDetails;
  cwd?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 border-t border-line-subtle bg-[var(--tool-bg)] p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-ui-mono text-muted" title={details.runId}>
          {t.chat.message.generationRun} {details.runId.slice(0, 8)}
        </span>
        <Badge
          variant={
            details.error
              ? "destructive"
              : details.status === "succeeded"
                ? "success"
                : "outline"
          }
        >
          {t.contentGeneration.runStatuses[details.status]}
        </Badge>
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
              <MediaPreview
                className="max-h-72 min-h-36"
                contentType={artifact.contentType}
                name={`${t.chat.message.generationArtifact} ${index + 1}`}
                src={rawFileUrl(absolutePath)}
              />
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
function AssistantImage({ block }: { block: ImageContent }) {
  const { t } = useI18n();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={t.chat.message.assistantImage}
      className="my-2 max-h-80 max-w-full rounded-lg object-contain"
      src={
        block.source.url ??
        `data:${block.source.mediaType};base64,${block.source.data}`
      }
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
    <div className="text-sm leading-[1.7] text-primary [&_a]:text-accent-deep [&_a]:underline [&_blockquote]:border-l [&_blockquote]:border-line-subtle [&_blockquote]:pl-3 [&_code]:rounded [&_code]:font-ui-mono [&_li]:my-1 [&_ol]:my-3 [&_ol]:pl-6 [&_p]:my-3 [&_table]:my-3 [&_table]:w-full [&_td]:border [&_td]:border-line-subtle [&_td]:p-2 [&_th]:border [&_th]:border-line-subtle [&_th]:p-2 [&_ul]:my-3 [&_ul]:pl-6">
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
      className="h-7 gap-1 px-2 text-caption"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
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
