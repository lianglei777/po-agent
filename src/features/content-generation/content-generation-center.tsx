"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileImage,
  LoaderCircle,
  Send,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ContentGenerationApi,
  ContentGenerationJob,
  ContentGenerationOutput,
  ContentGenerationProviderResponse,
} from "@/contracts/content-generation";
import type { SessionInfo } from "@/features/sessions/types";
import { Button } from "@/components/ui/button";
import { MediaPreview } from "@/components/ui/media-preview";
import { Textarea } from "@/components/ui/textarea";
import { rawFileUrl } from "@/features/files/api";
import { useI18n } from "@/i18n/use-i18n";
import {
  createContentGenerationJob,
  loadContentGenerationApis,
  loadContentGenerationJobs,
  pollContentGenerationJob,
} from "./api";

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
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
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

  async function submit() {
    if (!api || !prompt.trim() || activeJob || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const job = await createContentGenerationJob(session.id, prompt, files);
      setJobs((current) => [...current, job]);
      setPrompt("");
      setFiles([]);
      onChanged?.();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setSubmitting(false);
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
                <GenerationTurn cwd={session.cwd} job={job} key={job.id} />
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
        <div className="mx-auto max-w-[820px] rounded-[22px] border border-line-strong bg-canvas p-3 shadow-floating">
          {files.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {files.map((file) => (
                <span className="flex items-center gap-1 rounded-md bg-subtle px-2 py-1 text-caption" key={`${file.name}-${file.lastModified}`}>
                  <FileImage className="size-3" />
                  {file.name}
                  <button aria-label={t.contentGeneration.removeFile} onClick={() => setFiles((current) => current.filter((item) => item !== file))} type="button">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <Textarea
            aria-label={t.contentGeneration.prompt}
            className="min-h-20 resize-none border-0 px-1 shadow-none focus-visible:ring-0"
            disabled={Boolean(activeJob)}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t.contentGeneration.promptPlaceholder}
            value={prompt}
          />
          <div className="mt-2 flex items-center justify-between">
            <div>
              {api.requiresImages ? (
                <>
                  <input
                    accept={api.upload?.acceptedTypes?.join(",")}
                    className="hidden"
                    multiple={Boolean(api.upload?.maxFiles && api.upload.maxFiles > 1)}
                    onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                    ref={fileInput}
                    type="file"
                  />
                  <Button onClick={() => fileInput.current?.click()} size="sm" type="button" variant="ghost">
                    <FileImage />
                    {t.contentGeneration.addImage}
                  </Button>
                </>
              ) : (
                <span className="px-2 text-caption text-muted">{t.contentGeneration.textOnly}</span>
              )}
            </div>
            <Button
              aria-label={t.contentGeneration.generate}
              disabled={!prompt.trim() || Boolean(activeJob) || submitting || (api.requiresImages && !files.length)}
              onClick={() => void submit()}
              size="icon"
              type="button"
            >
              {submitting ? <LoaderCircle className="animate-spin" /> : <Send />}
            </Button>
          </div>
          {error ? <p className="mt-2 text-xs text-destructive-text">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}

function GenerationTurn({ cwd, job }: { cwd: string; job: ContentGenerationJob }) {
  return (
    <section className="space-y-5">
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-2xl bg-[var(--user-bg)] px-4 py-2.5 text-sm leading-[1.65] whitespace-pre-wrap text-primary">
          {job.prompt}
        </div>
      </div>
      <GenerationResult cwd={cwd} job={job} />
    </section>
  );
}

function GenerationResult({ cwd, job }: { cwd: string; job: ContentGenerationJob }) {
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
