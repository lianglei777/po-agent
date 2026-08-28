"use client";

import type { ReactNode } from "react";
import { Checkbox, Input, InputNumber, Select, Slider, Switch } from "antd";
import type {
  GenerationParameterField,
  GenerationParameterOption,
  GenerationRouteDto,
  JsonValue,
} from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";
import { generationOptionVisual } from "./generation-parameter-presentation";

export function GenerationParameterEditor({
  disabled,
  fields,
  onChange,
  values,
}: {
  disabled: boolean;
  fields: GenerationParameterField[];
  onChange: (values: Record<string, JsonValue>) => void;
  values: Record<string, JsonValue>;
}) {
  const { t } = useI18n();
  const labels = t.contentGeneration.inputs as Readonly<Record<string, string>>;
  const setValue = (key: string, value: JsonValue | undefined) => {
    const nextValues = { ...values };
    if (value === undefined) delete nextValues[key];
    else nextValues[key] = value;
    onChange(nextValues);
  };

  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <GenerationParameterControl
          disabled={disabled}
          field={field}
          key={field.key}
          label={labels[field.key] ?? field.label}
          onChange={(value) => setValue(field.key, value)}
          value={values[field.key]}
        />
      ))}
    </div>
  );
}

export function defaultGenerationParameters(route: GenerationRouteDto) {
  return {
    ...Object.fromEntries(
      (route.inputSchema.parameters ?? [])
        .filter((field) => field.defaultValue !== undefined)
        .map((field) => [field.key, structuredClone(field.defaultValue) as JsonValue]),
    ),
    ...route.defaults,
  };
}

export function resolvedGenerationParameters(
  route: GenerationRouteDto,
  values?: Record<string, JsonValue>,
) {
  return { ...defaultGenerationParameters(route), ...values };
}

function GenerationParameterControl({
  disabled,
  field,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  field: GenerationParameterField;
  label: string;
  onChange: (value: JsonValue | undefined) => void;
  value: JsonValue | undefined;
}) {
  const { t } = useI18n();
  const control = field.presentation?.control;

  if (field.type === "multi-select") {
    return <MultiSelectParameterControl disabled={disabled} field={field} label={label} onChange={onChange} value={value} />;
  }
  if (control === "ratio-grid" && field.options?.length) {
    return <OptionGrid disabled={disabled} field={field} label={label} onChange={onChange} value={value} />;
  }
  if (control === "slider") {
    return <SliderParameterControl disabled={disabled} field={field} label={label} onChange={onChange} value={value} />;
  }
  if (control === "segmented") {
    const options = field.type === "boolean"
      ? [
          { label: t.pipeline.generationDisabled, value: false },
          { label: t.pipeline.generationEnabled, value: true },
        ]
      : field.options ?? [];
    return <SegmentedParameterControl disabled={disabled} label={label} onChange={onChange} options={options} value={value} />;
  }
  if (field.type === "boolean") {
    return (
      <label className="flex items-center justify-between gap-4 text-xs text-primary" title={field.description}>
        <span>{label}</span>
        <Switch checked={value === true} disabled={disabled} onChange={onChange} size="small" />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <FieldLabel description={field.description} label={label}>
        <Select
          className="w-full"
          disabled={disabled}
          onChange={(nextValue) => onChange(optionValue(field, nextValue))}
          options={field.options?.map((option) => ({ label: option.label, value: String(option.value) }))}
          popupMatchSelectWidth={false}
          value={value === undefined ? undefined : String(value)}
        />
      </FieldLabel>
    );
  }
  if (field.type === "number") {
    return (
      <FieldLabel description={field.description} label={label}>
        <InputNumber
          className="w-full"
          disabled={disabled}
          max={field.max}
          min={field.min}
          onChange={(nextValue) => onChange(nextValue ?? undefined)}
          placeholder={t.pipeline.generationOptionalRandom}
          value={typeof value === "number" ? value : null}
        />
      </FieldLabel>
    );
  }
  return (
    <FieldLabel description={field.description} label={label}>
      <Input
        disabled={disabled}
        maxLength={field.maxLength}
        onChange={(event) => onChange(event.target.value)}
        value={typeof value === "string" ? value : ""}
      />
    </FieldLabel>
  );
}

function OptionGrid({
  disabled, field, label, onChange, value,
}: {
  disabled: boolean;
  field: GenerationParameterField;
  label: string;
  onChange: (value: JsonValue) => void;
  value: JsonValue | undefined;
}) {
  const { t } = useI18n();
  const dimensions = field.presentation?.optionVisual === "dimensions";
  return (
    <fieldset title={field.description}>
      <legend className="mb-2 text-caption font-medium text-muted">{label}</legend>
      <div className={`grid gap-2 ${dimensions ? "grid-cols-3" : "grid-cols-3 sm:grid-cols-4"}`}>
        {field.options?.map((option) => {
          const visual = generationOptionVisual(option.value);
          const active = option.value === value;
          return (
            <button
              aria-pressed={active}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-control border px-2 py-2 text-caption transition-[background-color,border-color,color,transform] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${active ? "border-[var(--pl-text-secondary)] bg-[var(--pl-surface-hover)] text-primary" : "border-line-subtle bg-panel text-muted hover:border-[var(--pl-border-strong)] hover:text-primary"}`}
              disabled={disabled}
              key={String(option.value)}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {visual ? <RatioGlyph height={visual.height} width={visual.width} /> : null}
              <span className="font-medium tabular-nums">
                {visual?.ratio ?? (option.value === "adaptive" ? t.pipeline.generationAdaptive : option.label)}
              </span>
              {dimensions && visual ? <span className="text-caption tabular-nums text-dim">{visual.dimensions}</span> : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function SegmentedParameterControl({
  disabled, label, onChange, options, value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: JsonValue) => void;
  options: GenerationParameterOption[];
  value: JsonValue | undefined;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-caption font-medium text-muted">{label}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              aria-pressed={active}
              className={`min-h-9 rounded-control border px-3 text-caption transition-[background-color,border-color,color,transform] active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${active ? "border-[var(--pl-text-secondary)] bg-[var(--pl-surface-hover)] font-medium text-primary" : "border-line-subtle bg-panel text-muted hover:border-[var(--pl-border-strong)] hover:text-primary"}`}
              disabled={disabled}
              key={String(option.value)}
              onClick={() => onChange(option.value)}
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

function SliderParameterControl({
  disabled, field, label, onChange, value,
}: {
  disabled: boolean;
  field: GenerationParameterField;
  label: string;
  onChange: (value: JsonValue) => void;
  value: JsonValue | undefined;
}) {
  const options = field.options ?? [];
  if (options.length) {
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
    const selected = options[selectedIndex] ?? options[0];
    return (
      <FieldLabel description={field.description} label={label} valueLabel={selected?.label}>
        <Slider
          disabled={disabled}
          max={Math.max(0, options.length - 1)}
          min={0}
          onChange={(index) => onChange(options[index]?.value ?? options[0].value)}
          step={1}
          tooltip={{ formatter: (index) => options[index ?? selectedIndex]?.label }}
          value={selectedIndex}
        />
      </FieldLabel>
    );
  }
  const numberValue = typeof value === "number" ? value : field.min ?? 0;
  return (
    <FieldLabel description={field.description} label={label} valueLabel={`${numberValue}${field.presentation?.unit ?? ""}`}>
      <Slider disabled={disabled} max={field.max} min={field.min} onChange={onChange} value={numberValue} />
    </FieldLabel>
  );
}

function MultiSelectParameterControl({
  disabled, field, label, onChange, value,
}: {
  disabled: boolean;
  field: GenerationParameterField;
  label: string;
  onChange: (value: JsonValue) => void;
  value: JsonValue | undefined;
}) {
  const selected = Array.isArray(value) ? value : [];
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-caption font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {field.options?.map((option) => {
          const active = selected.includes(option.value as never);
          return (
            <Checkbox
              checked={active}
              disabled={disabled}
              key={String(option.value)}
              onChange={() => onChange(active
                ? selected.filter((item) => item !== option.value)
                : [...selected, option.value])}
            >
              {option.label}
            </Checkbox>
          );
        })}
      </div>
    </fieldset>
  );
}

function FieldLabel({
  children, description, label, valueLabel,
}: {
  children: ReactNode;
  description?: string;
  label: string;
  valueLabel?: string;
}) {
  return (
    <label className="block text-caption text-muted" title={description}>
      <span className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        {valueLabel ? <span className="tabular-nums text-secondary">{valueLabel}</span> : null}
      </span>
      {children}
    </label>
  );
}

function RatioGlyph({ height, width }: { height: number; width: number }) {
  const longest = Math.max(height, width);
  const glyphWidth = Math.max(7, Math.round((width / longest) * 18));
  const glyphHeight = Math.max(7, Math.round((height / longest) * 18));
  return (
    <svg aria-hidden className="size-5" viewBox="0 0 20 20">
      <rect
        fill="none"
        height={glyphHeight}
        rx="1.5"
        stroke="currentColor"
        width={glyphWidth}
        x={(20 - glyphWidth) / 2}
        y={(20 - glyphHeight) / 2}
      />
    </svg>
  );
}

function optionValue(field: GenerationParameterField, serialized: string) {
  return field.options?.find((option) => String(option.value) === serialized)?.value ?? serialized;
}
