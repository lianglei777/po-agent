import type {
  GenerationParameterField,
  GenerationRouteDto,
  JsonValue,
} from "@/contracts/generation";

export const IMAGE_ASPECT_RATIO_FIELD: GenerationParameterField = {
  key: "aspectRatio",
  label: "画面比例",
  type: "select",
  defaultValue: "1:1",
  options: ["1:1", "16:9", "9:16", "4:3", "3:4"].map((value) => ({ label: value, value })),
};

export function composerParameterFields(
  route: GenerationRouteDto | undefined,
  supplements: GenerationParameterField[] = [],
) {
  const declared = route?.inputSchema.parameters ?? [];
  const declaredKeys = new Set(declared.map((field) => field.key));
  return [...declared, ...supplements.filter((field) => !declaredKeys.has(field.key))];
}

export function reconcileComposerSettings(
  route: GenerationRouteDto,
  previous: Record<string, JsonValue> = {},
  supplements: GenerationParameterField[] = [],
): Record<string, JsonValue> {
  const fields = composerParameterFields(route, supplements);
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
  labels: { audioOn: string; audioOff: string; autoDuration: string },
) {
  const preferredKeys = [
    "aspectRatio",
    "resolution",
    "durationSeconds",
    "generateAudio",
    "outputFormat",
    "bitrateMode",
  ];
  return preferredKeys.flatMap((key) => {
    const field = fields.find((candidate) => candidate.key === key);
    const value = values[key];
    if (!field || value === undefined) return [];
    if (key === "generateAudio") return [value === true ? labels.audioOn : labels.audioOff];
    if (key === "durationSeconds") {
      return [value === "auto" || value === -1 ? labels.autoDuration : `${String(value)}s`];
    }
    return [String(value).toUpperCase()];
  });
}

export function canvasVisibleParameterFields(fields: GenerationParameterField[]) {
  const usesDerivedDimensions = fields.some((field) => field.key === "aspectRatio")
    && fields.some((field) => field.key === "resolution");
  if (!usesDerivedDimensions) return fields;
  // 画布按画幅与分辨率计算最终尺寸，避免展示随后会被服务端覆盖的宽高输入。
  return fields.filter((field) => field.key !== "width" && field.key !== "height");
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
