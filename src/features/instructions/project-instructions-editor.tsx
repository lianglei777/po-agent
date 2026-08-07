"use client";

import { useCallback, useEffect } from "react";
import { LoaderCircle, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  ABSENT_REVISION,
  AGENTS_MD_TEMPLATE,
} from "@/contracts/instructions";
import { useI18n } from "@/i18n/use-i18n";
import {
  deleteProjectInstructions,
  getProjectInstructions,
  reloadInstructions,
  saveProjectInstructions,
} from "./api";
import { InstructionApiError } from "./types";
import {
  InstructionsStoreProvider,
  useInstructionsStore,
} from "./state/instructions-store-provider";

type ProjectInstructionsEditorProps = {
  cwd: string;
  agentId?: string;
  isRunning?: boolean;
  needsApply?: boolean;
  onChanged?: () => void;
  onApplied?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSystemPromptChange?: (prompt: string) => void;
};

export function ProjectInstructionsEditor({
  ...props
}: ProjectInstructionsEditorProps) {
  return (
    <InstructionsStoreProvider>
      <ProjectInstructionsEditorContent {...props} />
    </InstructionsStoreProvider>
  );
}

function ProjectInstructionsEditorContent({
  cwd,
  agentId,
  isRunning,
  needsApply,
  onChanged,
  onApplied,
  onDirtyChange,
  onSystemPromptChange,
}: ProjectInstructionsEditorProps) {
  const { t } = useI18n();
  const {
    applyingProject: applying,
    confirmProjectDelete: confirmDelete,
    projectApplyError: applyError,
    projectApplySuccess: applySuccess,
    projectEditor: { conflict, deleting, doc, draft, error, loading, saving },
    setApplyingProject: setApplying,
    setConfirmProjectDelete: setConfirmDelete,
    setProjectApplyError: setApplyError,
    setProjectApplySuccess: setApplySuccess,
    setProjectEditorField,
  } = useInstructionsStore((state) => state);
  const dirty = Boolean(doc && draft !== doc.content);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const load = useCallback(async () => {
    setProjectEditorField("loading", true);
    setProjectEditorField("error", "");
    try {
      const result = await getProjectInstructions(cwd);
      setProjectEditorField("doc", result.project);
      setProjectEditorField("draft", result.project.content);
      setProjectEditorField("conflict", false);
    } catch (cause) {
      setProjectEditorField(
        "error",
        cause instanceof Error ? cause.message : t.instructions.errorLoad,
      );
    } finally {
      setProjectEditorField("loading", false);
    }
  }, [cwd, setProjectEditorField, t.instructions.errorLoad]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(force = false) {
    setProjectEditorField("saving", true);
    setProjectEditorField("error", "");
    setProjectEditorField("conflict", false);
    setApplyError("");
    setApplySuccess(false);
    try {
      const result = await saveProjectInstructions({
        cwd,
        content: draft,
        expectedRevision: doc?.revision ?? ABSENT_REVISION,
        force,
      });
      setProjectEditorField("doc", result.project);
      setProjectEditorField("draft", result.project.content);
      setApplySuccess(false);
      onChanged?.();
    } catch (cause) {
      const requestError = cause instanceof InstructionApiError ? cause : null;
      setProjectEditorField(
        "error",
        requestError?.message ?? t.instructions.errorSave,
      );
      setProjectEditorField(
        "conflict",
        requestError?.code === "INSTRUCTION_CONFLICT",
      );
    } finally {
      setProjectEditorField("saving", false);
    }
  }

  async function remove() {
    setProjectEditorField("deleting", true);
    setProjectEditorField("error", "");
    setApplyError("");
    setApplySuccess(false);
    try {
      await deleteProjectInstructions({
        cwd,
        expectedRevision: doc?.revision ?? ABSENT_REVISION,
      });
      setProjectEditorField("doc", { content: "", exists: false, filePath: doc?.filePath ?? `${cwd}/AGENTS.md`, revision: ABSENT_REVISION });
      setProjectEditorField("draft", "");
      setConfirmDelete(false);
      setApplySuccess(false);
      onChanged?.();
    } catch (cause) {
      const requestError = cause instanceof InstructionApiError ? cause : null;
      setProjectEditorField(
        "error",
        requestError?.message ?? t.instructions.errorDelete,
      );
      setProjectEditorField(
        "conflict",
        requestError?.code === "INSTRUCTION_CONFLICT",
      );
      setConfirmDelete(false);
    } finally {
      setProjectEditorField("deleting", false);
    }
  }

  async function applyToSession() {
    if (!agentId || isRunning || dirty) return;
    setApplying(true);
    setApplyError("");
    try {
      const result = (await reloadInstructions(agentId)) as {
        systemPrompt?: string;
      };
      if (result.systemPrompt) onSystemPromptChange?.(result.systemPrompt);
      setApplySuccess(true);
      onApplied?.();
    } catch (cause) {
      setApplyError(
        cause instanceof Error ? cause.message : t.instructions.errorReload,
      );
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col bg-canvas">
        <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">AGENTS.md</h2>
              {doc?.exists ? <Badge variant="success">{t.instructions.saved}</Badge> : <Badge variant="outline">{t.instructions.notConfigured}</Badge>}
              {dirty ? <Badge variant="secondary">{t.instructions.dirtyWarning}</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted">{t.instructions.projectInstructionsDescription}</p>
            <p className="mt-1 truncate font-ui-mono text-caption text-dim" title={doc?.filePath}>{doc?.filePath ?? `${cwd}/AGENTS.md`}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {!doc?.exists && !draft ? (
              <Button onClick={() => setProjectEditorField("draft", AGENTS_MD_TEMPLATE)} size="sm" variant="outline">{t.instructions.createTemplate}</Button>
            ) : null}
            <Button disabled={!dirty || saving || loading} onClick={() => void save()} size="sm">
              {saving ? <LoaderCircle className="animate-spin" /> : null}{saving ? t.instructions.saving : t.instructions.save}
            </Button>
            {doc?.exists ? (
              <Button disabled={deleting || loading} onClick={() => setConfirmDelete(true)} size="sm" variant="outline"><Trash2 />{t.instructions.delete}</Button>
            ) : null}
          </div>
        </div>
        {agentId && needsApply ? (
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line-subtle bg-subtle px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary">
                {t.instructions.sessionOutdated}
              </p>
              <p className="mt-1 text-caption text-muted">
                {dirty
                  ? t.instructions.saveBeforeApply
                  : t.instructions.sessionOutdatedDescription}
              </p>
              {isRunning ? (
                <p className="mt-1 text-caption text-muted">
                  {t.instructions.reloadUnavailableWhileRunning}
                </p>
              ) : null}
              {applyError ? (
                <p className="mt-1 text-caption text-destructive-text" role="alert">
                  {applyError}
                </p>
              ) : null}
            </div>
            <Button
              disabled={dirty || isRunning || applying}
              onClick={() => void applyToSession()}
              size="sm"
              type="button"
              variant="outline"
            >
              {applying ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RotateCw />
              )}
              {applying
                ? t.instructions.applying
                : t.instructions.applyToSession}
            </Button>
          </div>
        ) : null}
        {agentId && !needsApply && applySuccess ? (
          <div
            className="shrink-0 border-b border-line-subtle bg-subtle px-4 py-2 text-caption text-success-text"
            role="status"
          >
            {t.instructions.applied}
          </div>
        ) : null}
        {loading ? (
          <div className="grid flex-1 place-items-center text-sm text-muted"><span className="flex items-center gap-2"><LoaderCircle className="animate-spin" />{t.common.loading}</span></div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
            <Textarea className="min-h-0 flex-1 resize-none font-ui-mono text-xs" onChange={(event) => { setProjectEditorField("draft", event.target.value); setProjectEditorField("error", ""); setProjectEditorField("conflict", false); }} placeholder={t.instructions.contentPlaceholder} value={draft} />
            <p className="text-caption text-dim">{t.instructions.bytes.replace("{count}", String(new Blob([draft]).size))}</p>
            {error ? (
              <div className="space-y-2 rounded-lg border border-destructive/25 bg-destructive/8 p-3">
                <p className="text-sm text-destructive-text">{error}</p>
                {conflict ? <div className="flex gap-2"><Button onClick={() => void save(true)} size="sm" variant="destructive">{t.instructions.conflictOverwrite}</Button><Button onClick={() => void load()} size="sm" variant="outline">{t.instructions.conflictReload}</Button></div> : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <Dialog onOpenChange={(next) => !next && setConfirmDelete(false)} open={confirmDelete}>
        <DialogContent className="sm:max-w-md" closeLabel={t.common.close}>
          <DialogHeader><DialogTitle>{t.instructions.deleteProjectTitle}</DialogTitle><DialogDescription>{t.instructions.deleteProjectDescription.replace("{path}", doc?.filePath ?? `${cwd}/AGENTS.md`)}</DialogDescription></DialogHeader>
          <DialogFooter><Button autoFocus onClick={() => setConfirmDelete(false)} variant="outline">{t.common.cancel}</Button><Button disabled={deleting} onClick={() => void remove()} variant="destructive">{t.instructions.delete}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
