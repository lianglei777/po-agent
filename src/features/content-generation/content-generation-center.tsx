"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ContentGenerationApi,
  ContentGenerationJob,
  ContentGenerationOutput,
  ContentGenerationProviderResponse,
  JsonValue,
} from "@/contracts/content-generation";
import type { SessionInfo } from "@/features/sessions/types";
import { Button } from "@/components/ui/button";
import { MediaPreview } from "@/components/ui/media-preview";
import { rawFileUrl } from "@/features/files/api";
import { useI18n } from "@/i18n/use-i18n";
import {
  createContentGenerationJob,
  loadContentGenerationApis,
  loadContentGenerationJobs,
  pollContentGenerationJob,
} from "./api";
import {
  ContentGenerationComposer,
  type SelectedGenerationAsset,
} from "./content-generation-composer";

const ACTIVE_PHASES = new Set([
  "created",
  "uploading",
  "submitting",
  "queued",
  "running",
  "downloading",
]);
const MIN_POLL_INTERVAL_MS = 5000;

export function ContentGenerationCenter({
  session,
  onChanged,
}: {
  session: SessionInfo;
  onChanged?: () => void;
}) {
  const { t } = useI18n();
  const [apis, setApis] = useState<ContentGenerationApi[]>([]);
  const [jobs, setJobs] = useState<ContentGenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const endOfConversation = useRef<HTMLDivElement>(null);
  const api = apis.find((item) => item.id === session.contentGenerationApiId);
  const activeJob = useMemo(
    () => jobs.find((job) => ACTIVE_PHASES.has(job.phase)),
    [jobs],
  );
  const orderedJobs = useMemo(
    () => [...jobs].sort((left, right) => left.created.localeCompare(right.created)),
    [jobs],
  );

  useEffect(() => {
    void Promise.all([
      loadContentGenerationApis(),
      loadContentGenerationJobs(session.id),
    ])
      .then(([nextApis, nextJobs]) => {
        setApis(nextApis);
        setJobs(nextJobs);
        setError("");
      })
      .catch((cause) => setError(messageOf(cause)))
      .finally(() => setLoading(false));
  }, [session.id]);

  useEffect(() => {
    if (!activeJob || !api || api.completion.mode !== "polling") return;
    const timer = window.setTimeout(() => {
      void pollContentGenerationJob(activeJob.id)
        .then((next) => {
          setJobs((current) =>
            current.map((job) => (job.id === next.id ? next : job)),
          );
          if (next.phase === "succeeded") onChanged?.();
        })
        .catch((cause) => setError(messageOf(cause)));
    }, Math.max(api.completion.intervalMs, MIN_POLL_INTERVAL_MS));
    return () => window.clearTimeout(timer);
  }, [activeJob, api, onChanged]);

  useEffect(() => {
    endOfConversation.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [jobs]);

  async function submit(input: {
    prompt: string;
    parameters: Record<string, JsonValue>;
    assets: SelectedGenerationAsset[];
  }) {
    if (!api || activeJob || submitting) return false;
    setSubmitting(true);
    setError("");
    try {
      const job = await createContentGenerationJob(
        session.id,
        input.prompt,
        input.parameters,
        input.assets.map((asset) => ({ slot: asset.slot, file: asset.file })),
      );
      setJobs((current) => [...current, job]);
      onChanged?.();
      return true;
    } catch (cause) {
      setError(messageOf(cause));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  async function retryPoll(jobId: string) {
    setRetryingJobId(jobId);
    setError("");
    try {
      const next = await pollContentGenerationJob(jobId);
      setJobs((current) =>
        current.map((job) => (job.id === next.id ? next : job)),
      );
      if (next.phase === "succeeded") onChanged?.();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setRetryingJobId(null);
    }
  }

  if (loading) {
    return <div className="grid flex-1 place-items-center text-sm text-muted">{t.common.loading}</div>;
  }
  if (!api) {
    return <div className="grid flex-1 place-items-center text-sm text-destructive-text">{t.contentGeneration.apiUnavailable}</div>;
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-[820px]">
          <header className="mb-8 border-b border-line-subtle pb-4">
            <p className="text-caption text-muted">{t.contentGeneration.mode}</p>
            <h1 className="mt-1 text-lg font-semibold text-primary">{api.name}</h1>
            <p className="mt-1 font-ui-mono text-meta text-muted">{api.capability}</p>
          </header>
          {orderedJobs.length ? (
            <div className="space-y-8">
              {orderedJobs.map((job) => (
                <GenerationTurn
                  api={api}
                  cwd={session.cwd}
                  job={job}
                  key={job.id}
                  onRetry={retryPoll}
                  retrying={retryingJobId === job.id}
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
          api={api}
          busy={Boolean(activeJob) || submitting}
          error={error}
          key={api.id}
          onSubmit={submit}
        />
      </div>
    </main>
  );
}

function GenerationTurn({
  api,
  cwd,
  job,
  onRetry,
  retrying,
}: {
  api: ContentGenerationApi;
  cwd: string;
  job: ContentGenerationJob;
  onRetry: (jobId: string) => void;
  retrying: boolean;
}) {
  const { t } = useI18n();
  const inputLabels = t.contentGeneration.inputs as Readonly<Record<string, string>>;
  const parameterEntries = Object.entries(job.parameters ?? {});
  return (
    <section className="space-y-5">
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl bg-[var(--user-bg)] px-4 py-2.5 text-sm leading-[1.65] whitespace-pre-wrap text-primary">
          {job.prompt || t.contentGeneration.noPrompt}
          {parameterEntries.length || job.uploadedAssets?.length ? (
            <div className="mt-2 border-t border-line-subtle pt-2 text-caption text-muted">
              {parameterEntries.map(([key, value]) => (
                <div className="flex gap-2" key={key}>
                  <span>{inputLabels[key] ?? api.inputSchema?.parameters?.find((field) => field.key === key)?.label ?? key}</span>
                  <span className="ml-auto max-w-52 truncate font-ui-mono">{displayParameter(value)}</span>
                </div>
              ))}
              {job.uploadedAssets?.map((asset) => (
                <div className="flex gap-2" key={`${asset.slot}-${asset.name}`}>
                  <span>{inputLabels[asset.slot] ?? api.inputSchema?.assets?.find((slot) => slot.key === asset.slot)?.label ?? asset.slot}</span>
                  <span className="ml-auto max-w-52 truncate">{asset.name}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <GenerationResult cwd={cwd} job={job} onRetry={onRetry} retrying={retrying} />
    </section>
  );
}

function GenerationResult({
  cwd,
  job,
  onRetry,
  retrying,
}: {
  cwd: string;
  job: ContentGenerationJob;
  onRetry: (jobId: string) => void;
  retrying: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const active = ACTIVE_PHASES.has(job.phase);
  const displayOutputs = job.outputs.filter(isDisplayOutput);
  return (
    <article className="max-w-[92%] text-sm text-primary">
      <div className="flex items-center gap-2 font-medium">
        {active ? <LoaderCircle className="size-4 animate-spin text-muted" /> : job.phase === "succeeded" ? <CheckCircle2 className="size-4 text-success-text" /> : <AlertTriangle className="size-4 text-destructive-text" />}
        <span>{phaseLabel(job.phase, t.contentGeneration)}</span>
      </div>

      {job.remoteTaskId ? (
        <div className="mt-3 flex max-w-xl items-center gap-2 rounded-md border border-line-subtle bg-subtle px-3 py-2">
          <span className="shrink-0 text-caption text-muted">{t.contentGeneration.taskId}</span>
          <code className="min-w-0 flex-1 truncate font-ui-mono text-xs">{job.remoteTaskId}</code>
          <Button
            aria-label={copied ? t.contentGeneration.copied : t.contentGeneration.copyTaskId}
            onClick={() => void navigator.clipboard.writeText(job.remoteTaskId ?? "").then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      ) : null}

      {job.error ? <p className="mt-3 text-xs text-destructive-text">{job.error.message}</p> : null}

      {job.phase === "failed" && job.error?.stage === "query" ? (
        <Button
          className="mt-2"
          disabled={retrying}
          onClick={() => onRetry(job.id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          {retrying ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
          {retrying ? t.contentGeneration.retrying : t.contentGeneration.retryQuery}
        </Button>
      ) : null}

      {displayOutputs.length ? (
        <div className="mt-4 space-y-4">
          {displayOutputs.map((output, index) => (
            <GenerationOutput cwd={cwd} index={index} key={`${job.id}-${index}`} output={output} />
          ))}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {job.submitRequest ? <ResponseDetails label={t.contentGeneration.submitRequest} response={job.submitRequest} /> : null}
        {job.submitResponse ? <ResponseDetails label={t.contentGeneration.submitResponse} response={job.submitResponse} /> : null}
        {job.latestQueryResponse ? <ResponseDetails label={t.contentGeneration.latestQueryResponse} response={job.latestQueryResponse} /> : null}
      </div>
    </article>
  );
}

function GenerationOutput({
  cwd,
  index,
  output,
}: {
  cwd: string;
  index: number;
  output: ContentGenerationOutput;
}) {
  const { t } = useI18n();
  const contentType = mediaContentType(output);
  const absolutePath = output.localPath ? workspacePath(cwd, output.localPath) : null;
  return (
    <div className="overflow-hidden rounded-xl border border-line-subtle bg-subtle">
      {absolutePath && contentType ? (
        <MediaPreview
          className="max-h-[480px] min-h-52"
          contentType={contentType}
          name={`${t.contentGeneration.output} ${index + 1}`}
          src={rawFileUrl(absolutePath)}
        />
      ) : null}
      {output.text ? <p className="whitespace-pre-wrap p-3 text-sm">{output.text}</p> : null}
      {output.localPath ? (
        <p className="border-t border-line-subtle px-3 py-2 font-ui-mono text-caption text-muted" title={output.localPath}>
          {output.localPath}
        </p>
      ) : null}
      {!absolutePath && output.remoteUrl ? (
        <a className="block px-3 py-2 text-xs underline" href={output.remoteUrl} rel="noreferrer" target="_blank">
          {t.contentGeneration.openRemoteOutput}
        </a>
      ) : null}
    </div>
  );
}

function ResponseDetails({
  label,
  response,
}: {
  label: string;
  response: ContentGenerationProviderResponse;
}) {
  return (
    <details className="max-w-2xl rounded-md border border-line-subtle bg-subtle text-xs">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-muted marker:hidden">
        <ChevronDown className="size-3" />
        {label}
      </summary>
      <pre className="max-h-72 overflow-auto border-t border-line-subtle p-3 font-ui-mono leading-5 whitespace-pre-wrap text-primary">
        {JSON.stringify(response.body, null, 2)}
      </pre>
    </details>
  );
}

function contentTypeForOutput(outputType?: string) {
  const normalized = outputType?.replace(/^\./, "").toLowerCase();
  return ({
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
  } as Record<string, string>)[normalized ?? ""];
}

function mediaContentType(output: ContentGenerationOutput) {
  if (/^(?:image|video|audio)\//.test(output.contentType ?? "")) {
    return output.contentType;
  }
  return contentTypeForOutput(output.outputType);
}

function isDisplayOutput(output: ContentGenerationOutput) {
  return output.outputType?.toLowerCase() !== "text";
}

function workspacePath(cwd: string, localPath: string) {
  if (/^(?:[a-zA-Z]:[\\/]|\/)/.test(localPath)) return localPath;
  const separator = cwd.includes("\\") ? "\\" : "/";
  return `${cwd.replace(/[\\/]+$/, "")}${separator}${localPath.replace(/^[\\/]+/, "")}`;
}

function phaseLabel(
  phase: ContentGenerationJob["phase"],
  labels: ReturnType<typeof useI18n>["t"]["contentGeneration"],
) {
  return labels.phases[phase];
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}

function displayParameter(value: JsonValue) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}
