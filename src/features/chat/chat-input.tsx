"use client";

import type {
  ChangeEvent,
  ClipboardEventHandler,
  KeyboardEventHandler,
  Ref,
  RefObject,
} from "react";
import { Button, Select, Tooltip } from "antd";
import {
  Brain,
  Clock3,
  Cpu,
  Paperclip,
  Send,
  Settings2,
  Square,
  X,
} from "@/components/icons";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/i18n/use-i18n";
import type { AttachedImage, ModelInfo } from "./agent-types";
import {
  resolveThinkingLevelForMode,
  type ThinkingMode,
} from "./chat-controller-state";

export function ChatInput({
  draft,
  images,
  running,
  stopping,
  canSubmit,
  models,
  modelKey,
  currentModel,
  canAttachImages,
  thinkingMode,
  generationReview,
  isCompacting,
  actionError,
  undoable,
  undoEdit,
  dismissUndo,
  retryInfo,
  agentPhase,
  textareaRef,
  fileInputRef,
  setDraft,
  addFiles,
  removeImage,
  submit,
  stop,
  changeModel,
  changeThinkingMode,
  setGenerationReview,
  handleKeyDown,
  handlePaste,
  setActionError,
  rootRef,
}: {
  draft: string;
  images: AttachedImage[];
  running: boolean;
  stopping: boolean;
  canSubmit: boolean;
  models: ModelInfo[];
  modelKey: string;
  currentModel?: ModelInfo;
  canAttachImages: boolean;
  thinkingMode: ThinkingMode;
  generationReview: boolean;
  isCompacting: boolean;
  actionError: string;
  undoable: { leafId: string } | null;
  undoEdit: () => Promise<void>;
  dismissUndo: () => void;
  retryInfo: {
    attempt: number;
    maxAttempts: number;
    errorMessage?: string;
  } | null;
  agentPhase: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  setDraft: (value: string) => void;
  addFiles: (files: File[]) => Promise<void>;
  removeImage: (id: string) => void;
  submit: (mode?: "prompt" | "steer" | "follow_up") => Promise<void>;
  stop: () => Promise<void>;
  changeModel: (value: string) => Promise<void>;
  changeThinkingMode: (value: ThinkingMode) => Promise<void>;
  setGenerationReview: (value: boolean) => void;
  handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  handlePaste: ClipboardEventHandler<HTMLTextAreaElement>;
  setActionError: (value: string) => void;
  rootRef?: Ref<HTMLDivElement>;
}) {
  const { t } = useI18n();
  const canTurnThinkingOn = Boolean(
    resolveThinkingLevelForMode(
      currentModel?.thinkingLevels ?? [],
      "on",
      currentModel?.thinkingDefaultLevel,
    ),
  );
  const thinkingOptions: Array<{ label: string; value: ThinkingMode }> = [
    { label: t.chat.input.thinkingAuto, value: "auto" },
    { label: t.chat.input.thinkingOff, value: "off" },
    ...(canTurnThinkingOn
      ? [{ label: t.chat.input.thinkingOn, value: "on" as const }]
      : []),
  ];

  return (
    <div
      className="pointer-events-none absolute right-0 bottom-0 left-0 z-20"
      ref={rootRef}
    >
      <div className="pointer-events-auto mx-auto max-w-[820px] bg-canvas px-4 pt-3 pb-3">
        {retryInfo ? (
          <InlineStatus tone="warning">
            {t.chat.input.retrying} {retryInfo.attempt}/{retryInfo.maxAttempts}
            {retryInfo.errorMessage ? ` · ${retryInfo.errorMessage}` : ""}
          </InlineStatus>
        ) : null}

        {isCompacting ? (
          <InlineStatus tone="warning">
            <span className="flex items-center gap-2">
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex size-full rounded-full bg-warning/35 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-warning" />
              </span>
              {t.chat.input.compacting}
            </span>
          </InlineStatus>
        ) : null}

        {undoable ? (
          <InlineStatus
            action={{
              disabled: running,
              disabledReason: running
                ? t.chat.message.branchNavigationUnavailableWhileRunning
                : undefined,
              label: t.chat.message.editUndoAction,
              onClick: () => void undoEdit(),
            }}
            dismissLabel={t.chat.input.dismissNotice}
            onDismiss={dismissUndo}
            tone="info"
          >
            {t.chat.message.editUndoNotice}
          </InlineStatus>
        ) : null}

        {actionError ? (
          <div className="mb-2 flex items-center gap-2 rounded-floating border border-destructive/25 bg-elevated px-3 py-2 text-xs text-destructive-text">
            <span className="min-w-0 flex-1">{actionError}</span>
            <Button
              aria-label={t.chat.input.dismissError}
              className="size-6"
              htmlType="button"
              icon={<X className="size-3.5" />}
              onClick={() => setActionError("")}
              size="small"
              type="text"
            />
          </div>
        ) : null}

        <div
          className={`overflow-hidden rounded-composer border border-line-strong bg-elevated shadow-[var(--shadow-composer)] transition-[border-color,box-shadow] duration-[var(--motion-standard)] has-[textarea:focus-visible]:shadow-[var(--shadow-composer-focus)] ${
            running
              ? "border-warning/50"
              : "has-[textarea:focus-visible]:border-ring"
          }`}
        >
          {running && agentPhase ? (
            <div
              aria-live="polite"
              className="flex items-center gap-2 border-b border-line-subtle px-4 py-2 text-meta text-warning"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-warning/35 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-warning" />
              </span>
              <span className="truncate">{agentPhase}</span>
            </div>
          ) : null}

          {images.length ? (
            <div className="flex gap-2 overflow-x-auto px-4 pt-3">
              {images.map((image) => (
                <div
                  className="relative size-16 flex-none overflow-hidden rounded-lg border border-line-subtle bg-panel"
                  key={image.id}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={image.name}
                    className="size-full object-cover"
                    src={image.previewUrl}
                  />
                  {/* Ant Button 自带定位规则，外层负责锚定，避免移除按钮被缩略图裁掉。 */}
                  <span className="absolute top-1 right-1 z-10 inline-flex">
                    <Button
                      aria-label={`${t.chat.input.removeImage} ${image.name}`}
                      className="size-5 border border-[var(--text)] bg-[var(--text)] p-0 text-[var(--bg-panel)] hover:border-[var(--text)] hover:bg-[var(--text)] hover:text-[var(--bg-panel)]"
                      htmlType="button"
                      icon={<X className="size-3" />}
                      onClick={() => removeImage(image.id)}
                      shape="circle"
                      size="small"
                      type="text"
                    />
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {/* Ant borderless textarea 仍会绘制内部焦点线；由 Composer 统一承载可见焦点。 */}
          <Textarea
            aria-label={t.chat.input.messageLabel}
            autoSize={{ minRows: 2, maxRows: 8 }}
            className="min-h-16 max-h-[220px] resize-none overflow-y-auto rounded-none border-0 bg-transparent px-4 pt-3 pb-2 text-prose leading-[1.6] shadow-none outline-none placeholder:text-dim focus:border-0 focus:shadow-none focus:outline-none focus-visible:border-0 focus-visible:outline-none! focus-visible:ring-0"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              running
                ? t.chat.input.placeholderRunning
                : t.chat.input.placeholderIdle
            }
            ref={textareaRef}
            value={draft}
            variant="borderless"
          />

          <div className="flex h-12 items-center gap-1.5 px-3 py-1.5">
            <input
              accept="image/*"
              className="hidden"
              multiple
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                void addFiles(Array.from(event.target.files ?? []));
                event.target.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
            {/* attachment */}
            <IconButton
              disabled={!canAttachImages}
              label={
                canAttachImages
                  ? t.chat.input.attachImages
                  : t.chat.input.imageUnsupported
              }
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </IconButton>

            {/*  models select */}
            <Select
              aria-label={t.chat.input.model}
              className="max-w-52"
              disabled={running}
              labelRender={() =>
                currentModel?.name ?? t.chat.input.chooseModel
              }
              onChange={(value) => void changeModel(value)}
              options={models.map((model) => ({
                label: `${model.name} · ${model.provider}`,
                value: `${model.provider}:${model.id}`,
              }))}
              placement="topLeft"
              popupMatchSelectWidth={false}
              prefix={<Cpu className="size-3.5 opacity-60" />}
              size="small"
              value={modelKey}
              variant="borderless"
            />

            {/* thinking */}
            <CompactSelect
              icon={<Brain />}
              label={t.chat.input.thinking}
              onValueChange={(value) =>
                void changeThinkingMode(value as ThinkingMode)
              }
              options={thinkingOptions}
              value={thinkingMode}
            />

            <CompactSelect
              disabled={running}
              icon={<Settings2 />}
              label={t.chat.input.generationControl}
              onValueChange={(value) =>
                setGenerationReview(value === "review")
              }
              options={[
                {
                  label: t.chat.input.generationAutomatic,
                  value: "automatic",
                },
                {
                  label: t.chat.input.generationReview,
                  value: "review",
                },
              ]}
              value={generationReview ? "review" : "automatic"}
            />

            <div className="flex-1" />

            {running || isCompacting ? (
              <>
                {running && !isCompacting ? (
                  <>
                    {/* queue button */}
                    <Button
                      className="h-9 px-2.5 text-xs"
                      disabled={!canSubmit}
                      htmlType="button"
                      icon={<Clock3 />}
                      onClick={() => void submit("follow_up")}
                      size="small"
                      title={t.chat.input.queueTitle}
                    >
                      <span>{t.chat.input.queue}</span>
                    </Button>

                    {/* steer button */}
                    <Button
                      className="h-9 px-3 text-xs"
                      disabled={!canSubmit}
                      htmlType="button"
                      icon={<Send />}
                      onClick={() => void submit("steer")}
                      size="small"
                      title={t.chat.input.steerTitle}
                      type="primary"
                    >
                      <span>{t.chat.input.steer}</span>
                    </Button>
                  </>
                ) : null}
                {/* stop send */}
                <Button
                  aria-label={
                    stopping
                      ? t.chat.input.stoppingAgent
                      : isCompacting
                        ? t.chat.input.stopCompaction
                      : t.chat.input.stopAgent
                  }
                  className="size-9 border-destructive/30 text-destructive-text hover:bg-destructive/10 hover:text-destructive-text"
                  danger
                  disabled={stopping}
                  htmlType="button"
                  icon={<Square className="size-3.5 fill-current" />}
                  loading={stopping}
                  onClick={() => void stop()}
                  title={
                    stopping
                      ? t.chat.input.stopping
                      : isCompacting
                        ? t.chat.input.stopCompaction
                        : t.chat.input.stop
                  }
                />
              </>
            ) : (
              // send button
              <Button
                aria-label={t.chat.input.sendMessage}
                className="size-9 rounded-full"
                disabled={!canSubmit}
                htmlType="button"
                icon={<Send className="rotate-[-90deg]" />}
                onClick={() => void submit()}
                shape="circle"
                type="primary"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineStatus({
  children,
  tone,
  onDismiss,
  dismissLabel,
  action,
}: {
  children: React.ReactNode;
  tone: "warning" | "error" | "success" | "info";
  onDismiss?: () => void;
  dismissLabel?: string;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
    disabledReason?: string;
  };
}) {
  const toneClasses: Record<typeof tone, string> = {
    warning: "border-warning/40 bg-warning/8 text-warning",
    error: "border-destructive/25 bg-destructive/8 text-destructive-text",
    success: "border-success/40 bg-success/8 text-success-text",
    info: "border-line-strong bg-subtle text-muted",
  };
  const actionButton = action ? (
    <Button
      className="h-6 shrink-0 text-xs"
      disabled={action.disabled}
      htmlType="button"
      onClick={action.onClick}
      size="small"
      type="text"
    >
      {action.label}
    </Button>
  ) : null;
  return (
    <div
      aria-live="polite"
      className={`mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${toneClasses[tone]}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {action?.disabledReason ? (
        <Tooltip
          mouseEnterDelay={0.35}
          placement="top"
          title={action.disabledReason}
        >
          <span className="inline-flex" title={action.disabledReason}>
            {actionButton}
          </span>
        </Tooltip>
      ) : (
        actionButton
      )}
      {onDismiss ? (
        <Button
          aria-label={dismissLabel}
          className="size-6 shrink-0"
          htmlType="button"
          icon={<X className="size-3.5" />}
          onClick={onDismiss}
          size="small"
          type="text"
        />
      ) : null}
    </div>
  );
}

function CompactSelect({
  icon,
  label,
  value,
  options,
  onValueChange,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? value;

  return (
    <Select
      aria-label={label}
      className="max-w-36 text-xs"
      disabled={disabled}
      labelRender={() => `${label}: ${selectedLabel}`}
      onChange={onValueChange}
      options={options.map((option) => ({
        label: `${label}: ${option.label}`,
        value: option.value,
      }))}
      placement="topLeft"
      prefix={icon}
      size="small"
      value={value}
      variant="borderless"
    />
  );
}

function IconButton({
  children,
  label,
  onClick,
  pressed,
  disabled,
  className = "size-9",
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Tooltip mouseEnterDelay={0.35} placement="top" title={label}>
      <span className="inline-flex">
        <Button
          aria-label={label}
          aria-pressed={pressed}
          className={className}
          disabled={disabled}
          htmlType="button"
          icon={children}
          onClick={onClick}
          size="small"
          type="text"
        />
      </span>
    </Tooltip>
  );
}
