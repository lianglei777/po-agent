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
  GenerationRouteDto,
  GenerationRunViewDto,
  JsonValue,
} from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";
import { rawFileUrl } from "@/lib/raw-file-url";
import { generationArtifactPath } from "./generation-tool-presentation";

const ACTIVE = new Set(["queued", "running", "cancel_requested"]);

export function ChatGenerationRunCard({
  busy,
  cwd,
  onCancel,
  onConfirm,
  routes,
  view,
}: {
  busy: boolean;
  cwd?: string;
  onCancel: () => Promise<void>;
  onConfirm: (prompt: string, parameters: Record<string, JsonValue>) => Promise<void>;
  routes: GenerationRouteDto[];
  view: GenerationRunViewDto;
}) {
  const { t } = useI18n();
  const route = routes.find((candidate) => candidate.id === view.run.routeId);
  const [prompt, setPrompt] = useState(view.run.input.prompt);
  const [parameters, setParameters] = useState<Record<string, JsonValue>>(
    () => route
      ? resolvedGenerationParameters(route, view.run.input.parameters)
      : (view.run.input.parameters ?? {}),
  );
  const awaiting = view.run.status === "awaiting_confirmation";
  const active = ACTIVE.has(view.run.status);
  const originalPrompt = view.run.input.originalPrompt ?? view.run.prompt;
  const inputAssets = view.run.input.assets ?? [];
  return (
    <section className="mb-5 space-y-3" aria-live="polite">
      <div className="ml-auto max-w-[78%] rounded-floating bg-[var(--user-bg)] px-3.5 py-2 text-sm leading-[1.6] text-primary">
        <p className="whitespace-pre-wrap">{originalPrompt}</p>
        {inputAssets.length && cwd ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {inputAssets.map((asset, index) => {
              if (asset.ref.type !== "workspace-file") return null;
              const slot = route?.inputSchema.assets?.find((candidate) => candidate.key === asset.slot);
              const src = rawFileUrl(generationArtifactPath(cwd, asset.ref.relativePath));
              return slot?.mediaType === "image" ? (
                <Image
                  alt={`${slot.label} ${index + 1}`}
                  className="rounded-md object-cover"
                  height={112}
                  key={`${asset.slot}-${asset.ref.relativePath}`}
                  src={src}
                  width={112}
                />
              ) : (
                <MediaPreview
                  className="h-28 w-48 rounded-md bg-black"
                  contentType={`${slot?.mediaType ?? "video"}/*`}
                  key={`${asset.slot}-${asset.ref.relativePath}`}
                  name={slot?.label ?? asset.slot}
                  src={src}
                />
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="space-y-3 rounded-lg border border-line-subtle bg-subtle p-3">
      <div className="flex items-center gap-2">
        {active ? <LoaderCircle className="size-4 animate-spin text-muted" /> : view.run.status === "succeeded" ? <CheckCircle2 className="size-4 text-success-text" /> : <Square className="size-3.5 text-muted" />}
        <strong className="text-xs text-primary">{route?.name ?? view.run.routeId}</strong>
        <Tag className="ml-auto" color={awaiting ? "warning" : active ? "processing" : undefined}>
          {t.contentGeneration.runStatuses[view.run.status]}
        </Tag>
      </div>
      {view.run.prompt !== originalPrompt ? (
        <details className="rounded-md border border-line-subtle bg-canvas px-3 py-2 text-xs">
          <summary className="cursor-pointer select-none text-muted">
            {t.chat.message.generationEffectivePrompt}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-primary">{view.run.prompt}</p>
        </details>
      ) : null}
      {awaiting && route ? (
        <>
          <label className="block space-y-1 text-caption text-muted">
            <span>{t.contentGeneration.prompt}</span>
            <Input.TextArea disabled={busy} onChange={(event) => setPrompt(event.target.value)} value={prompt} />
          </label>
          <GenerationParameterEditor disabled={busy} fields={route.inputSchema.parameters ?? []} onChange={setParameters} values={parameters} />
          <div className="flex justify-end gap-2">
            <Button disabled={busy} onClick={() => void onCancel()} size="small">{t.chat.message.generationNotNow}</Button>
            <Button disabled={busy || (route.inputSchema.prompt.required && !prompt.trim())} onClick={() => void onConfirm(prompt, parameters)} size="small" type="primary">{t.chat.message.generationConfirm}</Button>
          </div>
        </>
      ) : null}
      {view.run.errorMessage ? <Alert showIcon title={view.run.errorMessage} type="error" /> : null}
      {view.artifacts.map((artifact, index) => {
        const path = artifact.localPath && cwd ? generationArtifactPath(cwd, artifact.localPath) : null;
        if (!path || !artifact.contentType) return null;
        const src = rawFileUrl(path);
        return artifact.contentType.startsWith("image/") ? (
          <div className="grid max-h-[70vh] min-h-36 place-items-center overflow-auto rounded-md border border-line-subtle bg-canvas p-3" key={artifact.id}>
            <Image
              alt={`${t.chat.message.generationArtifact} ${index + 1}`}
              className="max-h-[66vh] max-w-full object-contain"
              src={src}
            />
          </div>
        ) : (
          <MediaPreview className="min-h-56 rounded-md border border-line-subtle bg-canvas" contentType={artifact.contentType} key={artifact.id} name={`${t.chat.message.generationArtifact} ${index + 1}`} src={src} />
        );
      })}
      {active ? <Button danger disabled={busy} onClick={() => void onCancel()} size="small">{t.contentGeneration.cancelRun}</Button> : null}
      </div>
    </section>
  );
}
