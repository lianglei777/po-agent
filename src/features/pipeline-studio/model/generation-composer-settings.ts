import type { GenerationParameterField, GenerationRouteDto, JsonValue } from "@/contracts/generation";
import { generationOptionVisual } from "@/components/generation/generation-parameter-presentation";

export function composerParameterFields(
  route: GenerationRouteDto | undefined,
) {
  return route?.inputSchema.parameters ?? [];
}

export function reconcileComposerSettings(
  route: GenerationRouteDto,
  previous: Record<string, JsonValue> = {},
): Record<string, JsonValue> {
  const fields = composerParameterFields(route);
  return Object.fromEntries(fields.flatMap((field) => {
    const previousValue = previous[field.key];
    if (isSupportedValue(field, previousValue)) return [[field.key, previousValue]];
    const defaultValue = route.defaults[field.key] ?? field.defaultValue;
    return defaultValue === undefined ? [] : [[field.key, structuredClone(defaultValue) as JsonValue]];
  }));
}

export function generationSettingsSummary(
  fields: GenerationParameterField[],
  values: Record<string, JsonValue>,
  labels: {
    autoDuration: string;
    disabled: string;
    enabled: string;
    fieldLabels: Readonly<Record<string, string>>;
  },
) {
  return fields.filter((field) => field.presentation?.summary).flatMap((field) => {
    const value = values[field.key];
    if (value === undefined || value === "") return [];
    const label = labels.fieldLabels[field.key] ?? field.label;
    if (field.type === "boolean") return [`${label}${value === true ? labels.enabled : labels.disabled}`];
    if (field.key === "durationSeconds") {
      return [value === "auto" || value === -1 ? labels.autoDuration : `${String(value)}s`];
    }
    if (field.presentation?.optionVisual === "dimensions") {
      const visual = generationOptionVisual(value as string | number | boolean);
      return visual ? [visual.ratio, visual.dimensions] : [String(value)];
    }
    if (field.presentation?.optionVisual === "ratio") return [String(value)];
    const option = field.options?.find((candidate) => candidate.value === value);
    if (field.type === "number") return [`${label} ${String(value)}`];
    return [String(option?.label ?? value).toUpperCase()];
  });
}

function isSupportedValue(field: GenerationParameterField, value: JsonValue | undefined) {
  if (value === undefined) return false;
  if (field.options?.length) {
    return field.options.some((option) => option.value === value);
  }
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "number") {
    return typeof value === "number"
      && (field.min === undefined || value >= field.min)
      && (field.max === undefined || value <= field.max);
  }
  if (field.type === "multi-select") return Array.isArray(value);
  return typeof value === "string";
}
