"use client";

import type { ReactNode } from "react";
import { InputNumber, Switch } from "antd";
import type { GenerationRouteDto, JsonValue } from "@/contracts/generation";
import type { CanvasResourceReferenceAttrs, LipSyncPreparationDto } from "@/contracts/pipeline";
import { Check, FileMusic, FileVideo } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { CanvasComposerSubmitAction } from "./shared/canvas-composer-submit-action";
import { CanvasModelPicker } from "./shared/canvas-model-picker";
import { CanvasNodeComposerShell } from "./shared/canvas-node-composer-shell";

export function KlingLipSyncComposer({
  large,
  routes,
  selectedRouteId,
  references,
  preparation,
  faceKey,
  settings,
  automaticTiming,
  busy,
  cancellable,
  cancelling,
  disabledReason,
  error,
  onRouteChange,
  onFaceChange,
  onSettingsChange,
  onAutomaticTimingChange,
  onSubmit,
  onCancel,
  onExpand,
}: {
  large: boolean;
  routes: GenerationRouteDto[];
  selectedRouteId: string;
  references: CanvasResourceReferenceAttrs[];
  preparation: LipSyncPreparationDto | null;
  faceKey: string;
  settings: Record<string, JsonValue>;
  automaticTiming: boolean;
  busy: boolean;
  cancellable: boolean;
  cancelling: boolean;
  disabledReason: string;
  error: string | null;
  onRouteChange: (routeId: string) => void;
  onFaceChange: (faceKey: string) => void;
  onSettingsChange: (settings: Record<string, JsonValue>) => void;
  onAutomaticTimingChange: (value: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onExpand: () => void;
}) {
  const { t } = useI18n();
  const video = references.find((reference) => reference.mediaType === "video");
  const audio = references.find((reference) => reference.mediaType === "audio");
  const updateNumber = (key: string, value: number | null) => {
    if (value !== null) onSettingsChange({ ...settings, [key]: value });
  };
  return (
    <CanvasNodeComposerShell
      ariaLabel={t.pipeline.lipSyncTitle}
      large={large}
      compactHeightClass="h-[430px]"
      error={error}
      expandLabel={t.pipeline.textAiExpand}
      onExpand={onExpand}
      body={(
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-2 gap-3">
            <ResourceSummary icon={<FileVideo className="size-4" />} label={t.pipeline.lipSyncVideo} reference={video} missing={t.pipeline.lipSyncVideoMissing} />
            <ResourceSummary icon={<FileMusic className="size-4" />} label={t.pipeline.lipSyncAudio} reference={audio} missing={t.pipeline.lipSyncAudioMissing} />
          </div>

          <section className="mt-4" aria-label={t.pipeline.lipSyncTargetFace}>
            <p className="text-xs font-semibold text-[var(--pl-text)]">{t.pipeline.lipSyncTargetFace}</p>
            {!preparation ? <p className="mt-2 text-xs text-[var(--pl-text-muted)]">{t.pipeline.lipSyncFacePending}</p> : null}
            {preparation?.status === "analyzing" ? <p role="status" className="mt-2 text-xs text-[var(--pl-text-secondary)]">{t.pipeline.lipSyncAnalyzing}</p> : null}
            {preparation?.status === "ready" ? (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t.pipeline.lipSyncTargetFace}>
                {preparation.faces.map((face, index) => {
                  const selected = face.key === faceKey;
                  return (
                    <button
                      aria-checked={selected}
                      className={`relative min-w-0 rounded-lg border p-2 text-left transition-colors ${selected ? "border-[var(--pl-accent)] bg-[var(--pl-accent-soft)]" : "border-[var(--pl-border)] hover:border-[var(--pl-border-strong)]"}`}
                      key={face.key}
                      onClick={() => onFaceChange(face.key)}
                      role="radio"
                      type="button"
                    >
                      <div className="flex h-14 items-center justify-center overflow-hidden rounded-md bg-[var(--pl-surface)]">
                        {face.previewUrl ? (
                          <span
                            aria-hidden="true"
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${JSON.stringify(face.previewUrl)})` }}
                          />
                        ) : <FileVideo className="size-5 text-[var(--pl-text-muted)]" />}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-[var(--pl-text)]">
                        <span className="truncate">{t.pipeline.lipSyncPerson.replace("{index}", String(index + 1))}</span>
                        {face.recommended ? <span className="text-caption text-[var(--pl-accent)]">{t.pipeline.lipSyncRecommended}</span> : null}
                        {selected ? <Check className="ml-auto size-3.5 shrink-0 text-[var(--pl-accent)]" /> : null}
                      </div>
                      <p className="mt-0.5 text-caption tabular-nums text-[var(--pl-text-muted)]">{formatTime(face.availableStartMs)} - {formatTime(face.availableEndMs)}</p>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3" aria-label={t.pipeline.lipSyncTiming}>
            <label className="col-span-2 flex items-center justify-between text-xs text-[var(--pl-text-secondary)]">
              <span>{t.pipeline.lipSyncAutomaticTiming}</span>
              <Switch size="small" checked={automaticTiming} disabled={busy} onChange={onAutomaticTimingChange} />
            </label>
            <NumberField label={t.pipeline.lipSyncAudioStart} value={numberValue(settings.soundStartTime, 0)} disabled={busy || automaticTiming} onChange={(value) => updateNumber("soundStartTime", value)} />
            <NumberField label={t.pipeline.lipSyncAudioEnd} value={numberValue(settings.soundEndTime, 2000)} disabled={busy || automaticTiming} onChange={(value) => updateNumber("soundEndTime", value)} />
            <NumberField label={t.pipeline.lipSyncInsertTime} value={numberValue(settings.soundInsertTime, 0)} disabled={busy || automaticTiming} onChange={(value) => updateNumber("soundInsertTime", value)} />
            <NumberField label={t.pipeline.lipSyncSoundVolume} value={numberValue(settings.soundVolume, 1)} min={0} max={2} step={0.1} disabled={busy} onChange={(value) => updateNumber("soundVolume", value)} />
            <NumberField label={t.pipeline.lipSyncOriginalVolume} value={numberValue(settings.originalAudioVolume, 1)} min={0} max={2} step={0.1} disabled={busy} onChange={(value) => updateNumber("originalAudioVolume", value)} />
          </section>
        </div>
      )}
      footer={(
        <>
          <CanvasModelPicker
            ariaLabel={t.pipeline.videoAiRoute}
            disabled={busy || !routes.length}
            emptyLabel={t.pipeline.videoAiNoRoutes}
            itemDetailsLabel={t.pipeline.generationModelDetails}
            items={routes.map((route) => ({
              id: route.id,
              name: route.name,
              meta: route.providerId,
              description: route.description,
              tags: route.tags,
              icon: <FileVideo className="size-3.5" />,
            }))}
            onChange={onRouteChange}
            value={selectedRouteId}
          />
          <span className="flex-1" />
          <CanvasComposerSubmitAction
            cancellable={cancellable}
            cancelling={cancelling}
            cancelLabel={t.pipeline.videoAiCancel}
            disabledReason={disabledReason}
            generateLabel={preparation?.status === "ready" && preparation.faces.length > 1 ? t.pipeline.lipSyncGenerateSelected : t.pipeline.videoAiGenerate}
            generating={busy}
            generatingLabel={preparation?.status === "analyzing" ? t.pipeline.lipSyncAnalyzing : t.pipeline.videoAiGenerating}
            onCancel={onCancel}
            onSubmit={onSubmit}
          />
        </>
      )}
    />
  );
}

function ResourceSummary({ icon, label, reference, missing }: { icon: ReactNode; label: string; reference?: CanvasResourceReferenceAttrs; missing: string }) {
  return (
    <div className="rounded-lg border border-[var(--pl-border)] bg-[var(--pl-surface)] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-[var(--pl-text)]"><span className="text-[var(--pl-accent)]">{icon}</span>{label}</div>
      <p className={`mt-1.5 truncate text-xs ${reference ? "text-[var(--pl-text-secondary)]" : "text-[var(--pl-danger)]"}`}>{reference?.label ?? missing}</p>
    </div>
  );
}

function NumberField({ label, value, disabled, min = 0, max = 60_000, step = 100, onChange }: { label: string; value: number; disabled: boolean; min?: number; max?: number; step?: number; onChange: (value: number | null) => void }) {
  return (
    <label className="min-w-0 text-xs text-[var(--pl-text-secondary)]">
      <span className="mb-1 block">{label}</span>
      <div className="flex items-center gap-2">
        <InputNumber className="min-w-0 flex-1" controls={false} disabled={disabled} min={min} max={max} step={step} value={value} onChange={onChange} />
        {max === 60_000 ? <span className="shrink-0 text-caption text-[var(--pl-text-muted)]">ms</span> : null}
      </div>
    </label>
  );
}

function numberValue(value: JsonValue | undefined, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
