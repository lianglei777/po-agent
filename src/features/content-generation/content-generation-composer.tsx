"use client";

import { FileImage, FileMusic, FileVideo, Send, X } from "@/components/icons";
import { useState } from "react";
import { Alert, Button, Input, Tooltip } from "antd";
import type {
  GenerationAssetSlot,
  GenerationRouteDto,
  JsonValue,
} from "@/contracts/generation";
import {
  defaultGenerationParameters,
  GenerationParameterEditor,
} from "@/components/generation/generation-parameter-editor";
import { useI18n } from "@/i18n/use-i18n";
import {
  GenerationRouteDetails,
  GenerationRouteSelect,
} from "@/components/generation/generation-route-presentation";
import { generationParameterConflict } from "@/components/generation/generation-input-constraints";

export interface SelectedGenerationAsset {
  id: string;
  slot: string;
  file: File;
}

export function ContentGenerationComposer({
  route,
  routes,
  busy,
  error,
  onRouteChange,
  onSubmit,
}: {
  route: GenerationRouteDto;
  routes: GenerationRouteDto[];
  busy: boolean;
  error: string;
  onRouteChange: (routeId: string) => void;
  onSubmit: (input: {
    prompt: string;
    parameters: Record<string, JsonValue>;
    assets: SelectedGenerationAsset[];
  }) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [parameters, setParameters] = useState<Record<string, JsonValue>>(
    () => defaultGenerationParameters(route),
  );
  const [assets, setAssets] = useState<SelectedGenerationAsset[]>([]);
  const schema = route.inputSchema;
  const inputLabels = t.contentGeneration.inputs as Readonly<Record<string, string>>;
  const assetSlots = schema.assets ?? [];

  const missingRequiredAsset = assetSlots.some((slot) =>
    slot.required && !assets.some((asset) => asset.slot === slot.key));
  const missingConstrainedAsset = (schema.constraints ?? []).some((constraint) =>
    constraint.kind === "at-least-one-asset" &&
    assets.filter((asset) => constraint.slots.includes(asset.slot)).length <
      (constraint.minFiles ?? 1));
  const exceedsConstrainedAssets = (schema.constraints ?? []).some((constraint) =>
    constraint.kind === "max-total-assets" &&
    assets.filter((asset) => constraint.slots.includes(asset.slot)).length > constraint.maxFiles);
  const promptMissing = schema.prompt.required && !prompt.trim();
  const parameterConflict = generationParameterConflict(schema.constraints ?? [], parameters);
  const parameterConflictLabels = parameterConflict?.keys
    .map((key) => inputLabels[key] ?? key)
    .join(" / ");
  const parameterConflictMessage = parameterConflictLabels
    ? t.contentGeneration.generateParametersConflict.replace("{fields}", parameterConflictLabels)
    : null;
  const disabled = busy || promptMissing || missingRequiredAsset || missingConstrainedAsset || exceedsConstrainedAssets || Boolean(parameterConflict);
  const disabledReason = busy
    ? t.contentGeneration.generateBusy
    : promptMissing
      ? t.contentGeneration.generatePromptRequired
      : missingRequiredAsset || missingConstrainedAsset
        ? t.contentGeneration.generateAssetsRequired
        : exceedsConstrainedAssets
          ? t.contentGeneration.generateAssetsExceeded
        : parameterConflictMessage;

  async function submit() {
    if (disabled) return;
    const succeeded = await onSubmit({ prompt, parameters, assets });
    if (succeeded) {
      setPrompt("");
      setAssets([]);
    }
  }

  const allFields = schema.parameters ?? [];

  return (
    <div className="mx-auto max-w-[820px] rounded-composer border border-line-strong bg-panel p-3 shadow-composer">
      <div className="mb-3 flex flex-col gap-2 border-b border-line-subtle pb-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 px-1">
          <p className="text-caption font-medium text-primary">
            {t.contentGeneration.capability}
          </p>
          <p className="mt-0.5 truncate font-ui-mono text-caption text-muted">
            {route.capability}
          </p>
        </div>
        <GenerationRouteSelect
          ariaLabel={t.contentGeneration.capability}
          className="w-full sm:w-72"
          disabled={busy}
          onChange={onRouteChange}
          routes={routes}
          value={route.id}
        />
      </div>

      <GenerationRouteDetails
        className="mb-3 border-b border-line-subtle px-1 pb-3"
        route={route}
      />

      {assetSlots.length ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {assetSlots.map((slot) => (
            <AssetSlotInput
              assets={assets.filter((asset) => asset.slot === slot.key)}
              disabled={busy}
              key={slot.key}
              onAdd={(files) => setAssets((current) => [
                ...current.filter((asset) => asset.slot !== slot.key),
                ...files.map((file) => ({ id: crypto.randomUUID(), slot: slot.key, file })),
              ])}
              onRemove={(id) => setAssets((current) => current.filter((asset) => asset.id !== id))}
              slot={slot}
              translatedLabel={inputLabels[slot.key] ?? slot.label}
            />
          ))}
        </div>
      ) : null}

      {route.capability === "multimodal-to-video" && assets.length ? (
        <div className="mb-2 flex flex-wrap items-center gap-1 px-1">
          <span className="mr-1 text-caption text-muted">{t.contentGeneration.insertReference}</span>
          {assets.map((asset) => {
            const sameType = assets.filter((item) => item.slot === asset.slot);
            const reference = `@${referenceType(asset.file.type)} ${sameType.indexOf(asset) + 1}`;
            return (
              <Button
                key={asset.id}
                onClick={() => setPrompt((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${reference} `)}
                size="small"
                type="text"
              >
                {reference}
              </Button>
            );
          })}
        </div>
      ) : null}

      <Input.TextArea
        aria-label={t.contentGeneration.prompt}
        autoSize={{ minRows: 3, maxRows: 8 }}
        className="bg-subtle"
        disabled={busy}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={schema.prompt.required === false
          ? t.contentGeneration.optionalPromptPlaceholder
          : t.contentGeneration.promptPlaceholder}
        value={prompt}
      />

      {allFields.length ? (
        <div className="mt-3 border-t border-line-subtle pt-3">
          <GenerationParameterEditor
            disabled={busy}
            fields={allFields}
            onChange={setParameters}
            values={parameters}
          />
        </div>
      ) : null}
      {parameterConflictMessage ? (
        <Alert className="mt-2" showIcon title={parameterConflictMessage} type="error" />
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <span className="px-1 text-caption text-muted">
          {assetSlots.length ? t.contentGeneration.assetsReady : t.contentGeneration.textOnly}
        </span>
        <Tooltip title={disabledReason ?? t.contentGeneration.generate}>
          <span className="inline-flex">
            <Button
              aria-label={t.contentGeneration.generate}
              disabled={disabled}
              htmlType="button"
              icon={<Send />}
              loading={busy}
              onClick={() => void submit()}
              shape="circle"
              type="primary"
            />
          </span>
        </Tooltip>
      </div>
      {error ? <Alert className="mt-2" showIcon title={error} type="error" /> : null}
    </div>
  );
}

function AssetSlotInput({
  assets,
  disabled,
  onAdd,
  onRemove,
  slot,
  translatedLabel,
}: {
  assets: SelectedGenerationAsset[];
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  slot: GenerationAssetSlot;
  translatedLabel: string;
}) {
  const { t } = useI18n();
  const Icon = slot.mediaType === "video" ? FileVideo : slot.mediaType === "audio" ? FileMusic : FileImage;
  const remaining = Math.max(0, (slot.maxFiles ?? 1) - assets.length);
  return (
    <div className="rounded-control border border-line-subtle bg-subtle px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-muted" />
        <span className="text-caption font-medium text-primary">
          {translatedLabel}{slot.required ? " *" : ""}
        </span>
        <span className="text-caption text-muted ml-auto">{assets.length}/{slot.maxFiles ?? 1}</span>
      </div>
      {assets.map((asset) => (
        <div className="mt-1 flex items-center gap-1 text-caption text-muted" key={asset.id}>
          <Icon className="size-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={asset.file.name}>{asset.file.name}</span>
          <Button
            aria-label={`${t.contentGeneration.removeFile} ${asset.file.name}`}
            disabled={disabled}
            htmlType="button"
            icon={<X />}
            onClick={() => onRemove(asset.id)}
            shape="circle"
            size="small"
            type="text"
          />
        </div>
      ))}
      {remaining > 0 ? (
        <label className="mt-1 flex h-6 cursor-pointer items-center justify-center rounded-md border border-dashed border-line-strong text-caption text-muted hover:bg-hover hover:text-primary">
          <Icon className="mr-1 size-3" />
          {assets.length ? t.contentGeneration.addMoreFiles : t.contentGeneration.chooseFile}
          <input
            accept={slot.acceptedTypes?.join(",")}
            className="hidden"
            disabled={disabled}
            multiple={Boolean(slot.multiple)}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []).slice(0, remaining);
              if (files.length) onAdd(slot.multiple ? [...assets.map((asset) => asset.file), ...files] : files);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      ) : null}
    </div>
  );
}

function referenceType(mimeType: string) {
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return "Image";
}
