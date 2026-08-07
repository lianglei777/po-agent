"use client";

import { useCallback, useEffect } from "react";
import {
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  ABSENT_REVISION,
  type InstructionDocument,
} from "@/contracts/instructions";
import { useI18n } from "@/i18n/use-i18n";
import { mergeClasses } from "@/lib/utils";
import {
  deleteSystemInstructions,
  getProjectInstructions,
  getSystemInstructions,
  reloadInstructions,
  saveSystemInstructions,
} from "./api";
import { InstructionApiError } from "./types";
import {
  InstructionsStoreProvider,
  useInstructionsStore,
} from "./state/instructions-store-provider";

export interface SystemPromptWorkbenchProps {
  agentId?: string;
  cwd?: string;
  currentSystemPrompt?: string | null;
  isRunning?: boolean;
  needsApply?: boolean;
  onApplied?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onInstructionsChanged?: () => void;
  onOpenProjectInstructions?: () => void;
  onSystemPromptChange?: (prompt: string) => void;
}

function formatBytes(content: string): number {
  return new Blob([content]).size;
}

export function SystemPromptWorkbench({
  ...props
}: SystemPromptWorkbenchProps) {
  return (
    <InstructionsStoreProvider>
      <SystemPromptWorkbenchContent {...props} />
    </InstructionsStoreProvider>
  );
}

function SystemPromptWorkbenchContent({
  agentId,
  cwd,
  currentSystemPrompt,
  isRunning,
  needsApply,
  onApplied,
  onDirtyChange,
  onInstructionsChanged,
  onOpenProjectInstructions,
  onSystemPromptChange,
}: SystemPromptWorkbenchProps) {
  const { t } = useI18n();
  const {
    activeView,
    confirmGlobalDelete: showDeleteConfirm,
    globalEditor: globalState,
    reloadBusy,
    reloadError,
    reloadSuccess,
    setActiveView,
    setConfirmGlobalDelete: setShowDeleteConfirm,
    setGlobalEditor: setGlobalState,
    setReloadBusy,
    setReloadError,
    setReloadSuccess,
    setWorkbenchProjectDoc: setProjectDoc,
    setWorkbenchProjectLoading: setProjectLoading,
    workbenchProjectDoc: projectDoc,
    workbenchProjectLoading: projectLoading,
  } = useInstructionsStore((state) => state);

  const loadGlobal = useCallback(async () => {
    setGlobalState((state) => ({ ...state, loading: true, error: "" }));
    try {
      const result = await getSystemInstructions();
      setGlobalState({
        doc: result.append,
        draft: result.append.content,
        loading: false,
        saving: false,
        deleting: false,
        error: "",
        conflict: false,
      });
    } catch (cause) {
      setGlobalState((state) => ({
        ...state,
        loading: false,
        error:
          cause instanceof Error ? cause.message : t.instructions.errorLoad,
      }));
    }
  }, [setGlobalState, t.instructions.errorLoad]);

  useEffect(() => {
    let cancelled = false;
    setActiveView("effective");
    void loadGlobal();
    setReloadError("");
    setReloadSuccess(false);
    if (cwd) {
      setProjectLoading(true);
      void getProjectInstructions(cwd)
        .then((result) => {
          if (!cancelled) setProjectDoc(result.project);
        })
        .catch(() => {
          if (!cancelled) setProjectDoc(null);
        })
        .finally(() => {
          if (!cancelled) setProjectLoading(false);
        });
    } else {
      setProjectDoc(null);
      setProjectLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [
    cwd,
    loadGlobal,
    setActiveView,
    setProjectDoc,
    setProjectLoading,
    setReloadError,
    setReloadSuccess,
  ]);

  const globalDirty = Boolean(
    globalState.doc && globalState.draft !== globalState.doc.content,
  );

  useEffect(() => {
    onDirtyChange?.(globalDirty);
  }, [globalDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange],
  );

  const saveGlobal = useCallback(
    async (force = false) => {
      setGlobalState((state) => ({
        ...state,
        saving: true,
        error: "",
        conflict: false,
      }));
      try {
        const result = await saveSystemInstructions({
          content: globalState.draft,
          expectedRevision: globalState.doc?.revision ?? ABSENT_REVISION,
          force,
        });
        setGlobalState({
          doc: result.append,
          draft: result.append.content,
          loading: false,
          saving: false,
          deleting: false,
          error: "",
          conflict: false,
        });
        setReloadSuccess(false);
        onInstructionsChanged?.();
      } catch (cause) {
        const error = cause instanceof InstructionApiError ? cause : null;
        setGlobalState((state) => ({
          ...state,
          saving: false,
          error: error?.message ?? t.instructions.errorSave,
          conflict: error?.code === "INSTRUCTION_CONFLICT",
        }));
      }
    },
    [
      globalState.doc,
      globalState.draft,
      onInstructionsChanged,
      setGlobalState,
      setReloadSuccess,
      t.instructions.errorSave,
    ],
  );

  const deleteGlobal = useCallback(async () => {
    setGlobalState((state) => ({ ...state, deleting: true, error: "" }));
    try {
      await deleteSystemInstructions({
        expectedRevision: globalState.doc?.revision ?? ABSENT_REVISION,
      });
      setGlobalState({
        doc: {
          content: "",
          exists: false,
          filePath: globalState.doc?.filePath ?? "",
          revision: ABSENT_REVISION,
        },
        draft: "",
        loading: false,
        saving: false,
        deleting: false,
        error: "",
        conflict: false,
      });
      setShowDeleteConfirm(false);
      setReloadSuccess(false);
      onInstructionsChanged?.();
    } catch (cause) {
      const error = cause instanceof InstructionApiError ? cause : null;
      setShowDeleteConfirm(false);
      setGlobalState((state) => ({
        ...state,
        deleting: false,
        error: error?.message ?? t.instructions.errorDelete,
        conflict: error?.code === "INSTRUCTION_CONFLICT",
      }));
    }
  }, [
    globalState.doc,
    onInstructionsChanged,
    setGlobalState,
    setReloadSuccess,
    setShowDeleteConfirm,
    t.instructions.errorDelete,
  ]);

  const handleReload = useCallback(async () => {
    if (!agentId || isRunning) return;
    setReloadBusy(true);
    setReloadError("");
    setReloadSuccess(false);
    try {
      const result = (await reloadInstructions(agentId)) as {
        systemPrompt?: string;
      };
      if (result.systemPrompt) onSystemPromptChange?.(result.systemPrompt);
      setReloadSuccess(true);
      onApplied?.();
    } catch (cause) {
      setReloadError(
        cause instanceof Error ? cause.message : t.instructions.errorReload,
      );
    } finally {
      setReloadBusy(false);
    }
  }, [
    agentId,
    isRunning,
    onApplied,
    onSystemPromptChange,
    setReloadBusy,
    setReloadError,
    setReloadSuccess,
    t.instructions.errorReload,
  ]);

  const handleOpenProjectInstructions = useCallback(() => {
    if (!onOpenProjectInstructions) return;
    onOpenProjectInstructions();
  }, [onOpenProjectInstructions]);

  const globalPath =
    globalState.doc?.filePath ?? t.instructions.globalAppendFilePath;
  const projectPath = projectDoc?.filePath ?? (cwd ? `${cwd}/AGENTS.md` : "");

  return (
    <>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
        <header className="shrink-0 border-b border-line-subtle px-6 py-4">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-primary">
            {t.instructions.title}
          </h2>
          <p className="mt-1 max-w-[65ch] text-body-sm leading-6 text-muted">
            {t.instructions.description}
          </p>
        </header>

        {agentId && needsApply ? (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-warning/30 bg-warning/8 px-6 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-warning">
                {t.instructions.sessionOutdated}
              </p>
              <p className="mt-0.5 text-caption text-muted">
                {isRunning
                  ? t.instructions.reloadUnavailableWhileRunning
                  : t.instructions.sessionOutdatedDescription}
              </p>
              {reloadError ? (
                <p
                  className="mt-1 text-caption text-destructive-text"
                  role="alert"
                >
                  {reloadError}
                </p>
              ) : null}
            </div>
            <Button
              disabled={isRunning || reloadBusy}
              onClick={() => void handleReload()}
              size="sm"
              variant="outline"
            >
              {reloadBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RotateCw />
              )}
              {reloadBusy
                ? t.instructions.applying
                : t.instructions.applyToSession}
            </Button>
          </div>
        ) : null}

        {agentId && !needsApply && reloadSuccess ? (
          <div
            className="shrink-0 border-b border-line-subtle bg-subtle px-6 py-2 text-caption text-success-text"
            role="status"
          >
            {t.instructions.applied}
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)]">
          <aside
            aria-label={t.instructions.title}
            className="flex min-h-0 flex-col border-r border-line-subtle bg-canvas p-3"
          >
            <p className="px-2 pb-1.5 text-caption font-medium text-dim">
              {t.instructions.currentResult}
            </p>
            <SourceNavButton
              label={t.instructions.finalSystemPrompt}
              onClick={() => setActiveView("effective")}
              selected={activeView === "effective"}
              status={
                agentId ? t.instructions.active : t.instructions.noSession
              }
            />

            <p className="mt-5 px-2 pb-1.5 text-caption font-medium text-dim">
              {t.instructions.managedContent}
            </p>
            <SourceNavButton
              label={t.instructions.globalAppend}
              onClick={() => setActiveView("global")}
              path={globalPath}
              selected={activeView === "global"}
              status={
                globalState.loading
                  ? t.common.loading
                  : globalDirty
                    ? t.instructions.unsaved
                    : globalState.doc?.exists
                      ? t.instructions.active
                      : t.instructions.notConfigured
              }
              trailing={<ChevronRight />}
            />
            <SourceNavButton
              disabled={!cwd}
              label={t.instructions.projectInstructions}
              onClick={() => setActiveView("project")}
              path={cwd ? projectPath : t.instructions.projectNotSelected}
              selected={activeView === "project"}
              status={
                projectLoading
                  ? t.common.loading
                  : projectDoc?.exists
                    ? t.instructions.active
                    : t.instructions.notConfigured
              }
              trailing={<ChevronRight />}
            />
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col bg-canvas">
            {activeView === "effective" ? (
              <EffectivePromptView prompt={currentSystemPrompt} />
            ) : activeView === "global" ? (
              <GlobalPromptEditor
                dirty={globalDirty}
                error={globalState.error}
                conflict={globalState.conflict}
                draft={globalState.draft}
                filePath={globalPath}
                loading={globalState.loading}
                onChange={(draft) =>
                  setGlobalState((state) => ({
                    ...state,
                    draft,
                    error: "",
                    conflict: false,
                  }))
                }
                onForceSave={() => void saveGlobal(true)}
                onReload={() => void loadGlobal()}
              />
            ) : (
              <ProjectInstructionsView
                doc={projectDoc}
                filePath={projectPath}
                loading={projectLoading}
              />
            )}
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-line-subtle px-4 py-3">
          <div className="min-w-0 flex-1">
            {activeView === "global" && globalState.doc?.exists ? (
              <Button
                className="text-destructive-text hover:bg-destructive/8 hover:text-destructive-text"
                disabled={globalState.deleting || globalState.loading}
                onClick={() => setShowDeleteConfirm(true)}
                size="sm"
                variant="ghost"
              >
                <Trash2 />
                {t.instructions.delete}
              </Button>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeView === "global" && !globalState.loading ? (
              <span className="mr-1 font-ui-mono text-caption text-dim">
                {t.instructions.bytes.replace(
                  "{count}",
                  String(formatBytes(globalState.draft)),
                )}
              </span>
            ) : null}
            {activeView === "global" ? (
              <Button
                disabled={
                  !globalDirty || globalState.saving || globalState.loading
                }
                onClick={() => void saveGlobal()}
              >
                {globalState.saving ? (
                  <LoaderCircle className="animate-spin" />
                ) : null}
                {globalState.saving
                  ? t.instructions.saving
                  : t.instructions.save}
              </Button>
            ) : null}
            {activeView === "project" && cwd && onOpenProjectInstructions ? (
              <Button onClick={handleOpenProjectInstructions}>
                <ExternalLink />
                {projectDoc?.exists
                  ? t.instructions.editInFileWorkspace
                  : t.instructions.createInFileWorkspace}
              </Button>
            ) : null}
          </div>
        </footer>
      </main>

      <ConfirmDialog
        confirmLabel={t.instructions.delete}
        description={t.instructions.deleteGlobalDescription.replace(
          "{path}",
          globalPath,
        )}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => void deleteGlobal()}
        open={showDeleteConfirm}
        title={t.instructions.deleteGlobalTitle}
      />
    </>
  );
}

function EffectivePromptView({ prompt }: { prompt?: string | null }) {
  const { t } = useI18n();

  return (
    <>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-primary">
            {t.instructions.finalSystemPrompt}
          </h3>
          <p className="mt-1 max-w-[65ch] text-xs text-muted">
            {t.instructions.finalSystemPromptDescription}
          </p>
        </div>
        {prompt ? (
          <span className="shrink-0 font-ui-mono text-caption text-dim">
            {t.instructions.bytes.replace(
              "{count}",
              String(formatBytes(prompt)),
            )}
          </span>
        ) : null}
      </div>
      {prompt ? (
        <ScrollArea className="min-h-0 flex-1">
          <pre className="min-h-full whitespace-pre-wrap break-words p-5 font-ui-mono text-xs leading-5 text-primary">
            {prompt}
          </pre>
        </ScrollArea>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center px-8 text-center">
          <div className="max-w-md">
            <p className="text-sm font-medium text-primary">
              {t.instructions.noActiveSystemPromptTitle}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {t.instructions.noActiveSystemPrompt}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function ProjectInstructionsView({
  doc,
  filePath,
  loading,
}: {
  doc: InstructionDocument | null;
  filePath: string;
  loading: boolean;
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="shrink-0 border-b border-line-subtle px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-primary">
            {t.instructions.projectInstructions}
          </h3>
          {!loading ? (
            <Badge variant={doc?.exists ? "success" : "outline"}>
              {doc?.exists
                ? t.instructions.active
                : t.instructions.notConfigured}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 max-w-[65ch] text-xs text-muted">
          {t.instructions.projectInstructionsPreviewDescription}
        </p>
        <p
          className="mt-1 truncate font-ui-mono text-caption text-dim"
          title={filePath}
        >
          {filePath}
        </p>
      </div>
      {loading ? (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-muted">
          <span className="flex items-center gap-2">
            <LoaderCircle className="animate-spin" />
            {t.common.loading}
          </span>
        </div>
      ) : doc?.content ? (
        <ScrollArea className="min-h-0 flex-1">
          <pre className="min-h-full whitespace-pre-wrap break-words p-5 font-ui-mono text-xs leading-5 text-primary">
            {doc.content}
          </pre>
        </ScrollArea>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center px-8 text-center">
          <div className="max-w-md">
            <p className="text-sm font-medium text-primary">
              {t.instructions.noProjectInstructionsTitle}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {t.instructions.noProjectInstructionsDescription}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function GlobalPromptEditor({
  dirty,
  error,
  conflict,
  draft,
  filePath,
  loading,
  onChange,
  onForceSave,
  onReload,
}: {
  dirty: boolean;
  error: string;
  conflict: boolean;
  draft: string;
  filePath: string;
  loading: boolean;
  onChange: (draft: string) => void;
  onForceSave: () => void;
  onReload: () => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="shrink-0 border-b border-line-subtle px-5 py-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-primary">
            {t.instructions.globalAppend}
          </h3>
          {dirty ? (
            <Badge variant="secondary">{t.instructions.unsaved}</Badge>
          ) : null}
        </div>
        <p className="mt-1 max-w-[65ch] text-xs text-muted">
          {t.instructions.globalAppendDescription}
        </p>
        <p
          className="mt-1 truncate font-ui-mono text-caption text-dim"
          title={filePath}
        >
          {filePath}
        </p>
      </div>
      {loading ? (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-muted">
          <span className="flex items-center gap-2">
            <LoaderCircle className="animate-spin" />
            {t.common.loading}
          </span>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          <Textarea
            className="min-h-0 flex-1 resize-none font-ui-mono text-xs leading-5"
            onChange={(event) => onChange(event.target.value)}
            placeholder={t.instructions.globalContentPlaceholder}
            value={draft}
          />
          {error ? (
            <div
              className="shrink-0 space-y-2 rounded-lg border border-destructive/25 bg-destructive/8 p-3"
              role="alert"
            >
              <p className="text-xs text-destructive-text">{error}</p>
              {conflict ? (
                <div className="flex gap-2">
                  <Button onClick={onForceSave} size="sm" variant="destructive">
                    {t.instructions.conflictOverwrite}
                  </Button>
                  <Button onClick={onReload} size="sm" variant="outline">
                    {t.instructions.conflictReload}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}

function SourceNavButton({
  label,
  path,
  status,
  selected = false,
  disabled = false,
  trailing,
  onClick,
}: {
  label: string;
  path?: string;
  status: string;
  selected?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={mergeClasses(
        "group flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left outline-none transition-colors duration-[var(--motion-fast)] hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55",
        selected && "bg-selected",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-primary">
            {label}
          </span>
          <SourceStatus label={status} />
        </div>
        {path ? (
          <div
            className="mt-0.5 truncate font-ui-mono text-caption text-dim"
            title={path}
          >
            {path}
          </div>
        ) : null}
      </div>
      {trailing ? (
        <span className="shrink-0 text-dim [&_svg]:size-3.5">{trailing}</span>
      ) : null}
    </button>
  );
}

function SourceStatus({ label }: { label: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-caption text-muted">
      <span aria-hidden className="size-1.5 rounded-full bg-border-strong" />
      {label}
    </span>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();

  return (
    <Dialog onOpenChange={(next) => !next && onCancel()} open={open}>
      <DialogContent className="sm:max-w-md" closeLabel={t.common.close}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button autoFocus onClick={onCancel} variant="outline">
            {t.common.cancel}
          </Button>
          <Button onClick={onConfirm} variant="destructive">
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
