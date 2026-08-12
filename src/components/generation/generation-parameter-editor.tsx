"use client";

import { Checkbox, Input, Select, Switch } from "antd";
import type {
  GenerationParameterField,
  GenerationRouteDto,
  JsonValue,
} from "@/contracts/generation";
import { useI18n } from "@/i18n/use-i18n";

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
  // 控件按交互密度分组，确认卡和直接生成 Composer 共用同一套参数呈现规则。
  const gridFields = fields.filter((field) =>
    ["select", "number", "text"].includes(field.type),
  );
  const booleanFields = fields.filter((field) => field.type === "boolean");
  const multiSelectFields = fields.filter(
    (field) => field.type === "multi-select",
  );
  const setValue = (key: string, value: JsonValue) =>
    onChange({ ...values, [key]: value });

  return (
    <div className="space-y-3">
      {gridFields.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {gridFields.map((field) => (
            <ScalarParameterControl
              disabled={disabled}
              field={field}
              key={field.key}
              onChange={(value) => setValue(field.key, value)}
              translatedLabel={labels[field.key] ?? field.label}
              value={values[field.key]}
            />
          ))}
        </div>
      ) : null}
      {booleanFields.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {booleanFields.map((field) => (
            <label
              className="flex items-center gap-2 text-xs text-primary"
              key={field.key}
              title={field.description}
            >
              <Switch
                checked={values[field.key] === true}
                disabled={disabled}
                onChange={(value) => setValue(field.key, value)}
                size="small"
              />
              {labels[field.key] ?? field.label}
            </label>
          ))}
        </div>
      ) : null}
      {multiSelectFields.map((field) => (
        <MultiSelectParameterControl
          disabled={disabled}
          field={field}
          key={field.key}
          onChange={(value) => setValue(field.key, value)}
          translatedLabel={labels[field.key] ?? field.label}
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
        .map((field) => [
          field.key,
          structuredClone(field.defaultValue) as JsonValue,
        ]),
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

function ScalarParameterControl({
  disabled,
  field,
  onChange,
  translatedLabel,
  value,
}: {
  disabled: boolean;
  field: GenerationParameterField;
  onChange: (value: JsonValue) => void;
  translatedLabel: string;
  value: JsonValue | undefined;
}) {
  if (field.type === "select") {
    return (
      <label className="space-y-1 text-caption text-muted" title={field.description}>
        <span>{translatedLabel}</span>
        <Select
          className="w-full"
          disabled={disabled}
          onChange={(nextValue) => onChange(optionValue(field, nextValue))}
          options={field.options?.map((option) => ({
            label: option.label,
            value: String(option.value),
          }))}
          popupMatchSelectWidth={false}
          value={String(value ?? "")}
        />
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
        onChange={(event) =>
          onChange(
            field.type === "number"
              ? Number(event.target.value)
              : event.target.value,
          )
        }
        type={field.type === "number" ? "number" : "text"}
        value={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
      />
    </label>
  );
}

function MultiSelectParameterControl({
  disabled,
  field,
  onChange,
  translatedLabel,
  value,
}: {
  disabled: boolean;
  field: GenerationParameterField;
  onChange: (value: JsonValue) => void;
  translatedLabel: string;
  value: JsonValue | undefined;
}) {
  const selected = Array.isArray(value) ? value : [];
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-caption text-muted">{translatedLabel}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {field.options?.map((option) => {
          const active = selected.includes(option.value as never);
          return (
            <Checkbox
              checked={active}
              disabled={disabled}
              key={String(option.value)}
              onChange={() =>
                onChange(
                  active
                    ? selected.filter((item) => item !== option.value)
                    : [...selected, option.value],
                )
              }
            >
              {option.label}
            </Checkbox>
          );
        })}
      </div>
    </fieldset>
  );
}

function optionValue(field: GenerationParameterField, serialized: string) {
  return (
    field.options?.find((option) => String(option.value) === serialized)?.value ??
    serialized
  );
}
