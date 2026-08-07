"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  LoaderCircle,
  RotateCcw,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type {
  GenerationArtifactDto,
  GenerationRouteDto,
  GenerationRunStatus,
  GenerationRunViewDto,
  JsonValue,
  ProviderJobDto,
} from "@/contracts/generation";
import { Button } from "@/components/ui/button";
import { MediaPreview } from "@/components/ui/media-preview";
import { rawFileUrl } from "@/lib/raw-file-url";
import type { SessionInfo } from "@/features/sessions/types";
import { useI18n } from "@/i18n/use-i18n";
import {
  cancelGenerationRun,
  createGenerationRun,
  loadGenerationRoutes,
  loadGenerationRuns,
  retryGenerationRun,
  uploadGenerationAsset,
} from "./api";
import {
  ContentGenerationComposer,
  type SelectedGenerationAsset,
} from "./content-generation-composer";
import { useContentGenerationStore } from "./state/content-generation-store-provider";

const ACTIVE_STATUSES = new Set<GenerationRunStatus>([
  "queued",
  "running",
  "cancel_requested",
]);
const REFRESH_INTERVAL_MS = 2_000;

export function ContentGenerationCenter({
  session,
  onChanged,
}: {
  session: SessionInfo;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const {
    applyCenterData,
    centerError,
    centerLoading,
    pendingActionId,
    replaceRun,
    resetCenter,
    routes,
    runs,
    selectedRouteId,
    setCenterError,
    setCenterLoading,
    setPendingActionId,
    setRuns,
    setSelectedRouteId,
    setSubmitting,
    submitting,
  } = useContentGenerationStore(
    useShallow(
      ({
        applyCenterData,
        centerError,
        centerLoading,
        pendingActionId,
        replaceRun,
        resetCenter,
        routes,
        runs,
        selectedRouteId,
        setCenterError,
        setCenterLoading,
        setPendingActionId,
        setRuns,
        setSelectedRouteId,
        setSubmitting,
        submitting,
      }) => ({
        applyCenterData,
        centerError,
        centerLoading,
        pendingActionId,
        replaceRun,
        resetCenter,
        routes,
        runs,
        selectedRouteId,
        setCenterError,
        setCenterLoading,
        setPendingActionId,
        setRuns,
        setSelectedRouteId,
        setSubmitting,
        submitting,
      }),
    ),
  );
  const endOfConversation = useRef<HTMLDivElement>(null);
  const enabledRoutes = useMemo(
    () => routes.filter((item) => item.enabled),
    [routes],
  );
  const route = enabledRoutes.find((item) => item.id === selectedRouteId);
  const activeRun = useMemo(
    () => runs.find((view) => ACTIVE_STATUSES.has(view.run.status)),
    [runs],
  );
  const orderedRuns = useMemo(
    () => [...runs].sort((left, right) => left.run.createdAt.localeCompare(right.run.createdAt)),
    [runs],
  );

  useEffect(() => {
    let disposed = false;
    resetCenter();
    void Promise.all([
      loadGenerationRoutes(),
      loadGenerationRuns(session.id),
    ])
      .then(([nextRoutes, nextRuns]) => {
        if (disposed) return;
        applyCenterData(nextRoutes, nextRuns);
      })
      .catch((cause) => !disposed && setCenterError(messageOf(cause)))
      .finally(() => !disposed && setCenterLoading(false));
    return () => { disposed = true; };
  }, [
    applyCenterData,
    resetCenter,
    session.id,
    setCenterError,
    setCenterLoading,
  ]);

  useEffect(() => {
    if (!activeRun) return;
    const timer = window.setTimeout(() => {
      void loadGenerationRuns(session.id)
        .then((nextRuns) => {
          setRuns(nextRuns);
          if (!nextRuns.some((view) => ACTIVE_STATUSES.has(view.run.status))) {
            onChanged?.();
          }
        })
        .catch((cause) => setCenterError(messageOf(cause)));
    }, REFRESH_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [activeRun, onChanged, session.id, setCenterError, setRuns]);

  useEffect(() => {
    endOfConversation.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [runs]);

  async function submit(input: {
    prompt: string;
    parameters: Record<string, JsonValue>;
    assets: SelectedGenerationAsset[];
  }) {
    if (!route || activeRun || submitting) return false;
    if (!window.confirm(t.contentGeneration.paidGenerationConfirm)) return false;
    setSubmitting(true);
    setCenterError("");
    try {
      const assets = await Promise.all(input.assets.map(async (asset) => ({
        slot: asset.slot,
        ref: (await uploadGenerationAsset(session.id, asset.file)).ref,
      })));
      const created = await createGenerationRun(session.id, {
        capability: route.capability,
        routeId: route.id,
        prompt: input.prompt,
        parameters: input.parameters,
        assets,
        source: "direct-ui",
        idempotencyKey: crypto.randomUUID(),
      });
      setRuns((current) => current.some((view) => view.run.id === created.run.id)
        ? current
        : [...current, created]);
      onChanged?.();
      return true;
    } catch (cause) {
      setCenterError(messageOf(cause));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(runId: string) {
    setPendingActionId(runId);
    setCenterError("");
    try {
      replaceRun(await cancelGenerationRun(runId));
      onChanged?.();
    } catch (cause) {
      setCenterError(messageOf(cause));
    } finally {
      setPendingActionId(null);
    }
  }

  async function retry(runId: string) {
    if (!window.confirm(t.contentGeneration.paidGenerationRetryConfirm)) return;
    setPendingActionId(runId);
    setCenterError("");
    try {
      const created = await retryGenerationRun(runId, crypto.randomUUID());
      replaceRun(created);
      onChanged?.();
    } catch (cause) {
      setCenterError(messageOf(cause));
    } finally {
      setPendingActionId(null);
    }
  }

  if (centerLoading) {
    return <div className="grid flex-1 place-items-center text-sm text-muted">{t.common.loading}</div>;
  }
  if (!route) {
    return <div className="grid flex-1 place-items-center text-sm text-destructive-text">{t.contentGeneration.apiUnavailable}</div>;
  }
  const selectedRoute = route;

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-[820px]">
          <h1 className="sr-only">{t.contentGeneration.mode}</h1>
          {orderedRuns.length ? (
            <div className="space-y-8">
              {orderedRuns.map((view) => (
                <GenerationTurn
                  route={routes.find((item) => item.id === view.run.routeId) ?? selectedRoute}
                  busy={pendingActionId === view.run.id}
                  cwd={session.cwd}
                  key={view.run.id}
                  onCancel={cancel}
                  onRetry={retry}
                  view={view}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-52 place-items-center text-center text-sm text-muted">
              <div>
                <p className="font-medium text-primary">{t.contentGeneration.noJobs}</p>
                <p className="mt-1 text-xs">{t.contentGeneration.noJobsDescription}</p>
              </div>
            </div>
          )}
          <div ref={endOfConversation} />
        </div>
      </div>
      <div className="flex-none px-4 pb-4">
        <ContentGenerationComposer
          busy={Boolean(activeRun) || submitting}
          error={centerError}
          key={selectedRoute.id}
          onRouteChange={setSelectedRouteId}
          onSubmit={submit}
          route={selectedRoute}
          routes={enabledRoutes}
        />
      </div>
    </main>
  );
}

function GenerationTurn({
  route,
  busy,
  cwd,
  onCancel,
  onRetry,
  view,
}: {
  route: GenerationRouteDto;
  busy: boolean;
  cwd: string;
  onCancel: (runId: string) => void;
  onRetry: (runId: string) => void;
  view: GenerationRunViewDto;
}) {
  const { t } = useI18n();
  const inputLabels = t.contentGeneration.inputs as Readonly<Record<string, string>>;
  const parameterEntries = Object.entries(view.run.input.parameters ?? {});
  const latestJob = view.jobs.at(-1);
  return (
    <section className="space-y-5">
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl bg-[var(--user-bg)] px-4 py-2.5 text-sm leading-[1.65] whitespace-pre-wrap text-primary">
          {view.run.prompt}
          {parameterEntries.length || view.run.input.assets?.length ? (
            <div className="mt-2 border-t border-line-subtle pt-2 text-caption text-muted">
              {parameterEntries.map(([key, value]) => (
                <div className="flex gap-2" key={key}>
                  <span>{inputLabels[key] ?? route.inputSchema.parameters?.find((field) => field.key === key)?.label ?? key}</span>
                  <span className="ml-auto max-w-52 truncate font-ui-mono">{displayParameter(value)}</span>
                </div>
              ))}
              {view.run.input.assets?.map((asset, index) => (
                <div className="flex gap-2" key={`${asset.slot}-${index}`}>
                  <span>{inputLabels[asset.slot] ?? asset.slot}</span>
                  <span className="ml-auto max-w-52 truncate">{assetName(asset)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <GenerationResult
        artifacts={view.artifacts}
        busy={busy}
        cwd={cwd}
        job={latestJob}
        onCancel={() => onCancel(view.run.id)}
        onRetry={() => onRetry(view.run.id)}
        status={view.run.status}
        errorMessage={view.run.errorMessage}
      />
    </section>
  );
}

function GenerationResult({
  artifacts,
  busy,
  cwd,
  errorMessage,
  job,
  onCancel,
  onRetry,
  status,
}: {
  artifacts: GenerationArtifactDto[];
  busy: boolean;
  cwd: string;
  errorMessage?: string;
  job?: ProviderJobDto;
  onCancel: () => void;
  onRetry: () => void;
  status: GenerationRunStatus;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const active = ACTIVE_STATUSES.has(status);
  return (
    <article className="max-w-[92%] text-sm text-primary">
      <div className="flex items-center gap-2 font-medium">
        {active ? <LoaderCircle className="size-4 animate-spin text-muted" /> : status === "succeeded" ? <CheckCircle2 className="size-4 text-success-text" /> : <AlertTriangle className="size-4 text-destructive-text" />}
        <span>{runStatusLabel(status, t.contentGeneration)}</span>
      </div>
      {job?.remoteTaskId ? (
        <div className="mt-3 flex max-w-xl items-center gap-2 rounded-md border border-line-subtle bg-subtle px-3 py-2">
          <span className="shrink-0 text-caption text-muted">{t.contentGeneration.taskId}</span>
          <code className="min-w-0 flex-1 truncate font-ui-mono text-xs">{job.remoteTaskId}</code>
          <Button aria-label={copied ? t.contentGeneration.copied : t.contentGeneration.copyTaskId} onClick={() => void navigator.clipboard.writeText(job.remoteTaskId ?? "").then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })} size="icon-sm" type="button" variant="ghost">
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      ) : null}
      {errorMessage ? <p className="mt-3 text-xs text-destructive-text">{errorMessage}</p> : null}
      {active ? (
        <Button className="mt-2" disabled={busy} onClick={() => {
          if (window.confirm(t.contentGeneration.cancelRunConfirm)) onCancel();
        }} size="sm" type="button" variant="ghost">
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
          {t.contentGeneration.cancelRun}
        </Button>
      ) : status === "failed" || status === "cancelled" ? (
        <Button className="mt-2" disabled={busy} onClick={onRetry} size="sm" type="button" variant="ghost">
          {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          {t.contentGeneration.retryRun}
        </Button>
      ) : null}
      {artifacts.length ? (
        <div className="mt-4 space-y-4">
          {artifacts.map((artifact, index) => (
            <GenerationOutput artifact={artifact} cwd={cwd} index={index} key={artifact.id} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function GenerationOutput({ artifact, cwd, index }: { artifact: GenerationArtifactDto; cwd: string; index: number }) {
  const { t } = useI18n();
  const absolutePath = artifact.localPath ? workspacePath(cwd, artifact.localPath) : null;
  return (
    <div className="overflow-hidden rounded-xl border border-line-subtle bg-subtle">
      {absolutePath && artifact.contentType && artifact.kind !== "text" ? (
        <MediaPreview className="max-h-[480px] min-h-52" contentType={artifact.contentType} name={`${t.contentGeneration.output} ${index + 1}`} src={rawFileUrl(absolutePath)} />
      ) : null}
      {artifact.text ? <p className="whitespace-pre-wrap p-3 text-sm">{artifact.text}</p> : null}
      {artifact.localPath ? <p className="border-t border-line-subtle px-3 py-2 font-ui-mono text-caption text-muted" title={artifact.localPath}>{artifact.localPath}</p> : null}
      {!absolutePath && artifact.remoteUrl ? <a className="block px-3 py-2 text-xs underline" href={artifact.remoteUrl} rel="noreferrer" target="_blank">{t.contentGeneration.openRemoteOutput}</a> : null}
    </div>
  );
}

function runStatusLabel(status: GenerationRunStatus, labels: ReturnType<typeof useI18n>["t"]["contentGeneration"]) {
  return labels.runStatuses[status];
}

function assetName(asset: NonNullable<GenerationRunViewDto["run"]["input"]["assets"]>[number]) {
  return asset.ref.type === "workspace-file"
    ? asset.ref.relativePath.split(/[\\/]/).at(-1) ?? asset.ref.relativePath
    : asset.ref.artifactId;
}

function workspacePath(cwd: string, localPath: string) {
  if (/^(?:[a-zA-Z]:[\\/]|\/)/.test(localPath)) return localPath;
  const separator = cwd.includes("\\") ? "\\" : "/";
  return `${cwd.replace(/[\\/]+$/, "")}${separator}${localPath.replace(/^[\\/]+/, "")}`;
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}

function displayParameter(value: JsonValue) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}
