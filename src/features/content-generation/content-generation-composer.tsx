"use client";

import { FileImage, FileMusic, FileVideo, Send, X } from "lucide-react";
import { useState } from "react";
import type {
  ContentGenerationApi,
  ContentGenerationAssetSlot,
  ContentGenerationParameterField,
  JsonValue,
} from "@/contracts/content-generation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { mergeClasses } from "@/lib/utils";
import { useI18n } from "@/i18n/use-i18n";

export interface SelectedGenerationAsset {
  id: string;
  slot: string;
  file: File;
}

export function ContentGenerationComposer({
  api,
  busy,
  error,
  onSubmit,
}: {
  api: ContentGenerationApi;
  busy: boolean;
  error: string;
  onSubmit: (input: {
    prompt: string;
    parameters: Record<string, JsonValue>;
    assets: SelectedGenerationAsset[];
  }) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState("");
  const [parameters, setParameters] = useState<Record<string, JsonValue>>(
    () => defaultParameters(api),
  );
  const [assets, setAssets] = useState<SelectedGenerationAsset[]>([]);
  const schema = api.inputSchema;
  const inputLabels = t.contentGeneration.inputs as Readonly<Record<string, string>>;
  const assetSlots = schema?.assets ?? (api.requiresImages ? [{
    key: "images",
    label: t.contentGeneration.addImage,
    mediaType: "image" as const,
    required: true,
    multiple: Boolean(api.upload?.maxFiles && api.upload.maxFiles > 1),
    maxFiles: api.upload?.maxFiles ?? 1,
    maxFileSizeBytes: api.upload?.maxFileSizeBytes,
    acceptedTypes: api.upload?.acceptedTypes,
  }] : []);

  const missingRequiredAsset = assetSlots.some((slot) =>
    slot.required && !assets.some((asset) => asset.slot === slot.key));
  const promptMissing = (schema?.prompt.required ?? true) && !prompt.trim();
  const disabled = busy || promptMissing || missingRequiredAsset;

  async function submit() {
    if (disabled) return;
    const succeeded = await onSubmit({ prompt, parameters, assets });
    if (succeeded) {
      setPrompt("");
      setAssets([]);
    }
  }

  // 按控件类型分组--select/number/text 统一网格，boolean 横向开关，multi-select chip 切换
  const allFields = schema?.parameters ?? [];
  const selectFields = allFields.filter((f) => f.type === "select" || f.type === "number" || f.type === "text");
  const booleanFields = allFields.filter((f) => f.type === "boolean");
  const multiSelectFields = allFields.filter((f) => f.type === "multi-select");

  return (
    <div className="mx-auto max-w-[820px] rounded-[22px] border border-line-strong bg-canvas p-3 shadow-floating">
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

      {api.capability === "multimodal-to-video" && assets.length ? (
        <div className="mb-2 flex flex-wrap items-center gap-1 px-1">
          <span className="mr-1 text-caption text-muted">{t.contentGeneration.insertReference}</span>
          {assets.map((asset) => {
            const sameType = assets.filter((item) => item.slot === asset.slot);
            const reference = `@${referenceType(asset.file.type)} ${sameType.indexOf(asset) + 1}`;
            return (
              <button
                className="rounded-md border border-line-subtle bg-subtle px-2 py-1 font-ui-mono text-caption text-primary hover:bg-hover"
                key={asset.id}
                onClick={() => setPrompt((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${reference} `)}
                type="button"
              >
                {reference}
              </button>
            );
          })}
        </div>
      ) : null}

      <Textarea
        aria-label={t.contentGeneration.prompt}
        className="min-h-20 resize-none rounded-control border border-line-subtle bg-subtle px-3 py-2.5 shadow-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
        disabled={busy}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={schema?.prompt.required === false
          ? t.contentGeneration.optionalPromptPlaceholder
          : t.contentGeneration.promptPlaceholder}
        value={prompt}
      />

      {/* 选择项与数值--统一网格布局 */}
      {selectFields.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line-subtle pt-3 sm:grid-cols-4">
          {selectFields.map((field) => (
            <SelectParameterControl
              disabled={busy}
              field={field}
              key={field.key}
              onChange={(value) => setParameters((current) => ({ ...current, [field.key]: value }))}
              value={parameters[field.key]}
              translatedLabel={inputLabels[field.key] ?? field.label}
            />
          ))}
        </div>
      ) : null}

      {/* 开关项--横向排列 */}
      {booleanFields.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-subtle pt-3">
          {booleanFields.map((field) => (
            <SwitchParameterControl
              disabled={busy}
              field={field}
              key={field.key}
              onChange={(value) => setParameters((current) => ({ ...current, [field.key]: value }))}
              value={parameters[field.key]}
              translatedLabel={inputLabels[field.key] ?? field.label}
            />
          ))}
        </div>
      ) : null}

      {/* 多选项--inline chip 切换 */}
      {multiSelectFields.length ? (
        <div className="mt-3 space-y-1.5 border-t border-line-subtle pt-3">
          {multiSelectFields.map((field) => (
            <MultiSelectParameterControl
              disabled={busy}
              field={field}
              key={field.key}
              onChange={(value) => setParameters((current) => ({ ...current, [field.key]: value }))}
              value={parameters[field.key]}
              translatedLabel={inputLabels[field.key] ?? field.label}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <span className="px-1 text-caption text-muted">
          {assetSlots.length ? t.contentGeneration.assetsReady : t.contentGeneration.textOnly}
        </span>
        <Button
          aria-label={t.contentGeneration.generate}
          disabled={disabled}
          onClick={() => void submit()}
          size="icon"
          type="button"
        >
          <Send />
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive-text">{error}</p> : null}
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
  slot: ContentGenerationAssetSlot;
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
          <button aria-label={`${t.contentGeneration.removeFile} ${asset.file.name}`} onClick={() => onRemove(asset.id)} type="button">
            <X className="size-3" />
          </button>
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

// 选择项与数值控件--select 使用 Radix Select，number/text 使用 Input
function SelectParameterControl({
  disabled,
  field,
  onChange,
  value,
  translatedLabel,
}: {
  disabled: boolean;
  field: ContentGenerationParameterField;
  onChange: (value: JsonValue) => void;
  value: JsonValue | undefined;
  translatedLabel: string;
}) {
  if (field.type === "select") {
    return (
      <label className="space-y-1 text-caption text-muted" title={field.description}>
        <span>{translatedLabel}</span>
        <Select
          disabled={disabled}
          onValueChange={(v) => onChange(optionValue(field, v))}
          value={String(value ?? "")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={String(option.value)} value={String(option.value)}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    );
  }
  return (
    <label className="space-y-1 text-caption text-muted" title={field.description}>
      <span>{translatedLabel}</span>
      <Input
        disabled={disabled}
        max={field.max}
        min={field.min}
        onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
        type={field.type === "number" ? "number" : "text"}
        value={typeof value === "string" || typeof value === "number" ? value : ""}
      />
    </label>
  );
}

// 开关项--使用 Switch primitive
function SwitchParameterControl({
  disabled,
  field,
  onChange,
  value,
  translatedLabel,
}: {
  disabled: boolean;
  field: ContentGenerationParameterField;
  onChange: (value: JsonValue) => void;
  value: JsonValue | undefined;
  translatedLabel: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-primary" title={field.description}>
      <Switch checked={value === true} disabled={disabled} onCheckedChange={onChange} />
      {translatedLabel}
    </label>
  );
}

// 多选项--inline chip 切换，选中态高亮
function MultiSelectParameterControl({
  disabled,
  field,
  onChange,
  value,
  translatedLabel,
}: {
  disabled: boolean;
  field: ContentGenerationParameterField;
  onChange: (value: JsonValue) => void;
  value: JsonValue | undefined;
  translatedLabel: string;
}) {
  const selected = Array.isArray(value) ? value : [];
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-caption text-muted">{translatedLabel}</legend>
      <div className="flex flex-wrap gap-1.5">
        {field.options?.map((option) => {
          const active = selected.includes(option.value as never);
          return (
            <button
              className={mergeClasses(
                "rounded-control border px-2 py-1 text-caption transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent-deep"
                  : "border-line-subtle bg-subtle text-muted hover:bg-hover hover:text-primary",
              )}
              disabled={disabled}
              key={String(option.value)}
              onClick={() => onChange(active
                ? selected.filter((item) => item !== option.value)
                : [...selected, option.value])}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function defaultParameters(api: ContentGenerationApi) {
  return Object.fromEntries(
    (api.inputSchema?.parameters ?? [])
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.key, structuredClone(field.defaultValue) as JsonValue]),
  );
}

function optionValue(field: ContentGenerationParameterField, serialized: string) {
  return field.options?.find((option) => String(option.value) === serialized)?.value ?? serialized;
}

function referenceType(mimeType: string) {
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  return "Image";
}
