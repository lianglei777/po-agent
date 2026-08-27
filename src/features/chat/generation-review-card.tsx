"use client";

import { useState } from "react";
import { Alert, Button, Image, Input, Tag } from "antd";
import { CheckCircle2, LoaderCircle, Square } from "@/components/icons";
import {
  GenerationParameterEditor,
  resolvedGenerationParameters,
} from "@/components/generation/generation-parameter-editor";
import { MediaPreview } from "@/components/ui/media-preview";
import type {
  GenerationRunViewDto,
  GenerationToolDetails,
  JsonValue,
} from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";
import {
  cancelGenerationRunReview,
  confirmGenerationRun,
} from "@/lib/client/generation-run-api";
import { rawFileUrl } from "@/lib/raw-file-url";
import { generationArtifactPath } from "./generation-tool-presentation";
import {
  GenerationRouteDetails,
  GenerationRouteTags,
} from "@/components/generation/generation-route-presentation";

const ACTIVE_STATUSES = new Set(["queued", "running", "cancel_requested"]);

export function GenerationReviewCard({
  cwd,
  details,
  onViewChange,
  view,
}: {
  cwd?: string;
  details: GenerationToolDetails;
  onViewChange: (view: GenerationRunViewDto) => void;
  view?: GenerationRunViewDto;
}) {
  const { t } = useI18n();
  const review = details.review!;
  const [prompt, setPrompt] = useState(review.input.prompt);
  const [parameters, setParameters] = useState<Record<string, JsonValue>>(() =>
    resolvedGenerationParameters(review.route, review.input.parameters),
  );
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const status = view?.run.status ?? details.status;
  const fields = review.route.inputSchema.parameters ?? [];

  async function confirm() {
    if (busy || (review.route.inputSchema.prompt.required && !prompt.trim())) {
      return;
    }
    setBusy("confirm");
    setError("");
    try {
      onViewChange(
        await confirmGenerationRun(details.runId, { prompt, parameters }),
      );
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy("cancel");
    setError("");
    try {
      onViewChange(await cancelGenerationRunReview(details.runId));
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  if (status !== "awaiting_confirmation") {
    return (
      <GenerationReviewProgress cwd={cwd} error={error} view={view} />
    );
  }

  return (
    <section
      aria-labelledby={`generation-review-${details.runId}`}
      className="mt-3 space-y-3 rounded-lg border border-line-subtle bg-subtle p-3"
      data-generation-review
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p
            className="text-xs font-semibold text-primary"
            id={`generation-review-${details.runId}`}
          >
            {t.chat.message.generationReviewTitle}
          </p>
          <p className="mt-0.5 text-caption text-muted">
            {review.route.name} · {review.route.product}
          </p>
          <GenerationRouteTags className="mt-1.5" limit={3} tags={review.route.tags} />
        </div>
        <Tag color="warning" variant="filled">
          {t.contentGeneration.runStatuses.awaiting_confirmation}
        </Tag>
      </div>

      <details className="group rounded-control border border-line-subtle bg-panel px-2.5 py-2">
        <summary className="cursor-pointer list-none text-caption font-medium text-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          {t.contentGeneration.routeInfo}
        </summary>
        <GenerationRouteDetails className="mt-2" route={review.route} />
      </details>

      <label className="block space-y-1 text-caption text-muted">
        <span>{t.contentGeneration.prompt}</span>
        <Input.TextArea
          autoSize={{ minRows: 2, maxRows: 6 }}
          disabled={Boolean(busy)}
          onChange={(event) => setPrompt(event.target.value)}
          value={prompt}
        />
      </label>

      {fields.length ? (
        <GenerationParameterEditor
          disabled={Boolean(busy)}
          fields={fields}
          onChange={setParameters}
          values={parameters}
        />
      ) : null}

      {review.input.assets?.length ? (
        <p className="text-caption text-muted">
          {t.chat.message.generationAssetsLocked.replace(
            "{count}",
            String(review.input.assets.length),
          )}
        </p>
      ) : null}
      <p className="text-caption text-muted">
        {t.chat.message.generationReviewNotice}
      </p>
      {error ? <Alert showIcon title={error} type="error" /> : null}
      <div className="flex justify-end gap-2">
        <Button
          disabled={Boolean(busy)}
          htmlType="button"
          loading={busy === "cancel"}
          onClick={() => void cancel()}
          size="small"
        >
          {t.chat.message.generationNotNow}
        </Button>
        <Button
          disabled={Boolean(busy) || (review.route.inputSchema.prompt.required && !prompt.trim())}
          htmlType="button"
          loading={busy === "confirm"}
          onClick={() => void confirm()}
          size="small"
          type="primary"
        >
          {t.chat.message.generationConfirm}
        </Button>
      </div>
    </section>
  );
}

function GenerationReviewProgress({
  cwd,
  error,
  view,
}: {
  cwd?: string;
  error: string;
  view?: GenerationRunViewDto;
}) {
  const { t } = useI18n();
  if (!view) {
    return (
      <div className="mt-3 rounded-lg border border-line-subtle bg-subtle p-3">
        {error ? <Alert showIcon title={error} type="error" /> : t.common.loading}
      </div>
    );
  }
  const active = ACTIVE_STATUSES.has(view.run.status);
  return (
    <section
      aria-live="polite"
      className="mt-3 space-y-3 rounded-lg border border-line-subtle bg-subtle p-3"
      data-generation-activity
    >
      <div className="flex items-center gap-2 text-xs font-medium text-primary">
        {active ? (
          <LoaderCircle className="size-4 animate-spin text-muted" />
        ) : view.run.status === "succeeded" ? (
          <CheckCircle2 className="size-4 text-success-text" />
        ) : (
          <Square className="size-3.5 text-muted" />
        )}
        <span>{generationActivityLabel(view, t)}</span>
      </div>
      {error ? <Alert showIcon title={error} type="error" /> : null}
      {view.artifacts.map((artifact, index) => {
        const path =
          artifact.localPath && cwd
            ? generationArtifactPath(cwd, artifact.localPath)
            : null;
        return path && artifact.contentType ? (
          // 图片产物统一固定 160x112 磁贴，避免 MediaPreview 弹性尺寸在长图时出滚动条；视频/音频保留原展示。
          artifact.contentType.startsWith("image/") ? (
            <div
              className="min-h-36 overflow-hidden rounded-md border border-line-subtle bg-canvas p-3"
              key={artifact.id}
            >
              <Image
                alt={`${t.chat.message.generationArtifact} ${index + 1}`}
                className="size-full object-contain"
                height={112}
                src={rawFileUrl(path)}
                width={160}
              />
            </div>
          ) : (
            <MediaPreview
              className="max-h-72 min-h-36 overflow-hidden rounded-md border border-line-subtle bg-canvas"
              contentType={artifact.contentType}
              key={artifact.id}
              name={`${t.chat.message.generationArtifact} ${index + 1}`}
              src={rawFileUrl(path)}
            />
          )
        ) : null;
      })}
    </section>
  );
}

function generationActivityLabel(
  view: GenerationRunViewDto,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (view.run.status === "queued") {
    return t.chat.message.generationConfirmedQueued;
  }
  if (view.run.status === "running" || view.run.status === "cancel_requested") {
    return view.jobs.at(-1)?.status === "downloading"
      ? t.chat.message.generationDownloading
      : t.chat.message.generationConfirmedRunning;
  }
  if (view.run.status === "succeeded") return t.chat.message.generationCompleted;
  return t.contentGeneration.runStatuses[view.run.status];
}

function messageOf(value: unknown) {
  return value instanceof Error ? value.message : "Request failed";
}
