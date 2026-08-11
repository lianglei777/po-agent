"use client";

import { useCallback, useEffect } from "react";
import { Alert, Button, Input, Skeleton, Tag } from "antd";
import { useShallow } from "zustand/react/shallow";
import { RotateCw, Trash2 } from "@/components/icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    // 项目切换时重建 Store，确保首帧不会复用上一个项目的指令草稿。
    <InstructionsStoreProvider key={props.cwd}>
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
  } = useInstructionsStore(
    useShallow(
      ({
        applyingProject,
        confirmProjectDelete,
        projectApplyError,
        projectApplySuccess,
        projectEditor,
        setApplyingProject,
        setConfirmProjectDelete,
        setProjectApplyError,
        setProjectApplySuccess,
        setProjectEditorField,
      }) => ({
        applyingProject,
        confirmProjectDelete,
        projectApplyError,
        projectApplySuccess,
        projectEditor,
        setApplyingProject,
        setConfirmProjectDelete,
        setProjectApplyError,
        setProjectApplySuccess,
        setProjectEditorField,
      }),
    ),
  );
  const dirty = Boolean(doc && draft !== doc.content);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setProjectEditorField("loading", true);
    setProjectEditorField("error", "");
    try {
      const result = await getProjectInstructions(cwd, signal);
      if (signal?.aborted) return;
      setProjectEditorField("doc", result.project);
      setProjectEditorField("draft", result.project.content);
      setProjectEditorField("conflict", false);
    } catch (cause) {
      if (signal?.aborted) return;
      setProjectEditorField(
        "error",
        cause instanceof Error ? cause.message : t.instructions.errorLoad,
      );
    } finally {
      if (!signal?.aborted) setProjectEditorField("loading", false);
    }
  }, [cwd, setProjectEditorField, t.instructions.errorLoad]);

  useEffect(() => {
    // 取消旧项目请求，避免迟到响应覆盖当前项目的 AGENTS.md。
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
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
              {doc?.exists ? <Tag color="success" variant="filled">{t.instructions.saved}</Tag> : <Tag variant="outlined">{t.instructions.notConfigured}</Tag>}
              {dirty ? <Tag variant="filled">{t.instructions.dirtyWarning}</Tag> : null}
            </div>
            <p className="mt-1 text-xs text-muted">{t.instructions.projectInstructionsDescription}</p>
            <p className="mt-1 truncate font-ui-mono text-caption text-dim" title={doc?.filePath}>{doc?.filePath ?? `${cwd}/AGENTS.md`}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            {!doc?.exists && !draft ? (
              <Button htmlType="button" onClick={() => setProjectEditorField("draft", AGENTS_MD_TEMPLATE)} size="small">{t.instructions.createTemplate}</Button>
            ) : null}
            <Button disabled={!dirty || saving || loading} htmlType="button" loading={saving} onClick={() => void save()} size="small" type="primary">
              {saving ? t.instructions.saving : t.instructions.save}
            </Button>
            {doc?.exists ? (
              <Button danger disabled={deleting || loading} htmlType="button" icon={<Trash2 />} onClick={() => setConfirmDelete(true)} size="small" type="text">{t.instructions.delete}</Button>
            ) : null}
          </div>
        </div>
        {agentId && needsApply ? (
          <Alert
            action={(
              <Button
                disabled={dirty || isRunning || applying}
                htmlType="button"
                icon={<RotateCw />}
                loading={applying}
                onClick={() => void applyToSession()}
                size="small"
              >
                {applying
                  ? t.instructions.applying
                  : t.instructions.applyToSession}
              </Button>
            )}
            className="shrink-0 rounded-none border-x-0"
            description={(
              <>
                {dirty
                  ? t.instructions.saveBeforeApply
                  : t.instructions.sessionOutdatedDescription}
                {isRunning ? (
                  <span className="mt-1 block">
                    {t.instructions.reloadUnavailableWhileRunning}
                  </span>
                ) : null}
                {applyError ? (
                  <span className="mt-1 block text-destructive-text">
                    {applyError}
                  </span>
                ) : null}
              </>
            )}
            showIcon
            title={t.instructions.sessionOutdated}
            type={applyError ? "error" : "warning"}
          />
        ) : null}
        {agentId && !needsApply && applySuccess ? (
          <Alert
            className="shrink-0 rounded-none border-x-0"
            showIcon
            title={t.instructions.applied}
            type="success"
          />
        ) : null}
        {loading ? (
          <Skeleton active className="p-4" paragraph={{ rows: 8 }} title={false} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
            <Input.TextArea className="min-h-0 flex-1 resize-none font-ui-mono text-xs" onChange={(event) => { setProjectEditorField("draft", event.target.value); setProjectEditorField("error", ""); setProjectEditorField("conflict", false); }} placeholder={t.instructions.contentPlaceholder} value={draft} />
            <p className="text-caption text-dim">{t.instructions.bytes.replace("{count}", String(new Blob([draft]).size))}</p>
            {error ? (
              <Alert
                action={conflict ? <div className="flex gap-2"><Button danger htmlType="button" onClick={() => void save(true)} size="small" type="primary">{t.instructions.conflictOverwrite}</Button><Button htmlType="button" onClick={() => void load()} size="small">{t.instructions.conflictReload}</Button></div> : undefined}
                showIcon
                title={error}
                type="error"
              />
            ) : null}
          </div>
        )}
      </div>
      <Dialog onOpenChange={(next) => !next && setConfirmDelete(false)} open={confirmDelete}>
        <DialogContent className="sm:max-w-md" closeLabel={t.common.close}>
          <DialogHeader><DialogTitle>{t.instructions.deleteProjectTitle}</DialogTitle><DialogDescription>{t.instructions.deleteProjectDescription.replace("{path}", doc?.filePath ?? `${cwd}/AGENTS.md`)}</DialogDescription></DialogHeader>
          <DialogFooter><Button autoFocus disabled={deleting} htmlType="button" onClick={() => setConfirmDelete(false)}>{t.common.cancel}</Button><Button danger disabled={deleting} htmlType="button" loading={deleting} onClick={() => void remove()} type="primary">{t.instructions.delete}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
