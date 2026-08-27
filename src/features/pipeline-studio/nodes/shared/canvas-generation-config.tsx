"use client";

import { Popover, Slider } from "antd";
import type { GenerationInputConstraint, GenerationParameterField, JsonValue } from "@/contracts/generation";
import { Settings2 } from "@/components/icons";
import { generationParameterConflict } from "@/components/generation/generation-input-constraints";
import { GenerationParameterEditor } from "@/components/generation/generation-parameter-editor";
import { useI18n } from "@/i18n/use-i18n";
import {
  canvasVisibleParameterFields,
  generationSettingsSummary,
} from "../../model/generation-composer-settings";

const PRIMARY_KEYS = new Set(["aspectRatio", "resolution", "durationSeconds", "generateAudio", "outputFormat", "bitrateMode"]);

export function CanvasGenerationConfig({
  ariaLabel,
  disabled,
  fields,
  constraints = [],
  values,
  onChange,
  getPopupContainer,
}: {
  ariaLabel: string;
  disabled: boolean;
  fields: GenerationParameterField[];
  constraints?: GenerationInputConstraint[];
  values: Record<string, JsonValue>;
  onChange: (values: Record<string, JsonValue>) => void;
  getPopupContainer?: (trigger: HTMLElement) => HTMLElement;
}) {
  const { t } = useI18n();
  const visibleFields = canvasVisibleParameterFields(fields);
  const primary = visibleFields.filter((field) => PRIMARY_KEYS.has(field.key));
  const secondary = visibleFields.filter((field) => !PRIMARY_KEYS.has(field.key));
  const conflict = generationParameterConflict(constraints, values);
  const inputLabels = t.contentGeneration.inputs as Readonly<Record<string, string>>;
  const conflictLabels = conflict?.keys.map((key) => inputLabels[key] ?? key).join(" / ");
  const summary = generationSettingsSummary(visibleFields, values, {
    audioOn: t.pipeline.generationAudioOn,
    audioOff: t.pipeline.generationAudioOff,
    autoDuration: t.pipeline.generationDurationAuto,
  });
  const setValue = (key: string, value: JsonValue) => onChange({ ...values, [key]: value });

  if (!fields.length) return null;
  return (
    <Popover
      arrow={false}
      content={(
        <section aria-label={ariaLabel} className="nodrag w-[min(520px,calc(100vw-48px))] space-y-4 p-1">
          <div>
            <h3 className="text-xs font-semibold text-[var(--pl-text)]">{ariaLabel}</h3>
            <p className="mt-1 text-[11px] text-[var(--pl-text-muted)]">{t.pipeline.generationConfigHint}</p>
          </div>
          <div className="space-y-4">
            {primary.map((field) => (
              <VisualParameterControl
                disabled={disabled}
                field={field}
                key={field.key}
                onChange={(value) => setValue(field.key, value)}
                value={values[field.key]}
              />
            ))}
          </div>
          {secondary.length ? (
            <details className="group border-t border-[var(--pl-border)] pt-3">
              <summary className="cursor-pointer list-none text-xs font-medium text-[var(--pl-text-secondary)] hover:text-[var(--pl-text)]">{t.pipeline.generationMoreSettings}</summary>
              <div className="mt-3">
                <GenerationParameterEditor disabled={disabled} fields={secondary} values={values} onChange={onChange} />
              </div>
            </details>
          ) : null}
          {conflictLabels ? (
            <p className="text-caption text-[var(--pl-danger)]" role="alert">
              {t.pipeline.generationParametersMutuallyExclusive.replace("{fields}", conflictLabels)}
            </p>
          ) : null}
        </section>
      )}
      destroyOnHidden
      getPopupContainer={getPopupContainer}
      placement="topLeft"
      trigger="click"
    >
      <button
        aria-label={ariaLabel}
        className="nodrag flex h-8 min-w-0 items-center gap-1.5 rounded-lg bg-[var(--pl-surface-hover)] px-2 text-xs text-[var(--pl-text-secondary)] hover:text-[var(--pl-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] disabled:opacity-50"
        disabled={disabled}
        type="button"
      >
        <Settings2 className="size-3.5 shrink-0" />
        <span className="max-w-72 truncate">{summary.length ? summary.join(" · ") : ariaLabel}</span>
      </button>
    </Popover>
  );
}

function VisualParameterControl({
  disabled,
  field,
  value,
  onChange,
}: {
  disabled: boolean;
  field: GenerationParameterField;
  value: JsonValue | undefined;
  onChange: (value: JsonValue) => void;
}) {
  const { t } = useI18n();
  const labels = t.contentGeneration.inputs as Readonly<Record<string, string>>;
  const label = labels[field.key] ?? field.label;

  if (field.type === "boolean") {
    return (
      <fieldset>
        <legend className="mb-2 text-[11px] text-[var(--pl-text-muted)]">{label}</legend>
        <SegmentedButtons
          disabled={disabled}
          onChange={onChange}
          options={[
            { label: t.pipeline.generationEnabled, value: true },
            { label: t.pipeline.generationDisabled, value: false },
          ]}
          value={value}
        />
      </fieldset>
    );
  }

  const options = field.options ?? [];
  if (field.key === "durationSeconds" && options.length > 5) {
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
    return (
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-[11px] text-[var(--pl-text-muted)]"><span>{label}</span><span className="tabular-nums text-[var(--pl-text-secondary)]">{options[selectedIndex]?.label}</span></span>
        <Slider
          disabled={disabled}
          min={0}
          max={options.length - 1}
          step={1}
          tooltip={{ formatter: (index) => options[index ?? selectedIndex]?.label }}
          value={selectedIndex}
          onChange={(index) => onChange(options[index]?.value ?? options[0].value)}
        />
      </label>
    );
  }
  if (field.key === "durationSeconds" && field.type === "number" && field.min !== undefined && field.max !== undefined) {
    const numberValue = typeof value === "number" ? value : field.min;
    return (
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-[11px] text-[var(--pl-text-muted)]"><span>{label}</span><span className="tabular-nums text-[var(--pl-text-secondary)]">{numberValue}s</span></span>
        <Slider disabled={disabled} min={field.min} max={field.max} value={numberValue} onChange={onChange} />
      </label>
    );
  }

  if (options.length) {
    return (
      <fieldset>
        <legend className="mb-2 text-[11px] text-[var(--pl-text-muted)]">{label}</legend>
        <SegmentedButtons disabled={disabled} onChange={onChange} options={options} value={value} visualRatio={field.key === "aspectRatio"} />
      </fieldset>
    );
  }

  return <GenerationParameterEditor disabled={disabled} fields={[field]} values={{ [field.key]: value ?? null }} onChange={(next) => onChange(next[field.key])} />;
}

function SegmentedButtons({
  disabled,
  onChange,
  options,
  value,
  visualRatio = false,
}: {
  disabled: boolean;
  onChange: (value: JsonValue) => void;
  options: Array<{ label: string; value: string | number | boolean }>;
  value: JsonValue | undefined;
  visualRatio?: boolean;
}) {
  return (
    <div className={`grid gap-1.5 ${visualRatio ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-2 sm:grid-cols-4"}`}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            aria-pressed={active}
            className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pl-accent)] ${active ? "border-[var(--pl-text-secondary)] bg-[var(--pl-surface-hover)] text-[var(--pl-text)]" : "border-[var(--pl-border)] bg-[var(--pl-surface)] text-[var(--pl-text-muted)] hover:border-[var(--pl-border-strong)] hover:text-[var(--pl-text)]"}`}
            disabled={disabled}
            key={String(option.value)}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {visualRatio ? <RatioGlyph ratio={String(option.value)} /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RatioGlyph({ ratio }: { ratio: string }) {
  const dimensions: Record<string, string> = {
    "1:1": "h-3 w-3",
    "16:9": "h-2 w-4",
    "9:16": "h-4 w-2",
    "4:3": "h-2.5 w-3.5",
    "3:4": "h-3.5 w-2.5",
    "21:9": "h-1.5 w-4",
    "3:2": "h-2.5 w-4",
    "2:3": "h-4 w-2.5",
  };
  return <span aria-hidden className={`rounded-[2px] border border-current ${dimensions[ratio] ?? "h-2.5 w-3.5"}`} />;
}
