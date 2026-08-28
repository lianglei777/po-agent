import type { GenerationInputSchema, GenerationParameterField } from "@/contracts/generation";

const PRESENTATION_BY_KEY: Readonly<Record<string, NonNullable<GenerationParameterField["presentation"]>>> = {
  size: { control: "ratio-grid", optionVisual: "dimensions", summary: true },
  aspectRatio: { control: "ratio-grid", optionVisual: "ratio", summary: true },
  resolution: { control: "segmented", summary: true },
  durationSeconds: { control: "slider", summary: true, unit: "s" },
  imageCount: { control: "number-input", summary: true },
  generateAudio: { control: "segmented", summary: true },
  promptExtend: { control: "segmented", summary: true },
  outputFormat: { control: "segmented", summary: true },
  bitrateMode: { control: "segmented", summary: true },
  watermark: { control: "segmented" },
  returnLastFrame: { control: "segmented" },
  seed: { control: "number-input" },
};

export function withGenerationParameterPresentation(schema: GenerationInputSchema): GenerationInputSchema {
  if (!schema.parameters?.length) return schema;
  return {
    ...schema,
    parameters: schema.parameters.map((field) => ({
      ...field,
      presentation: field.presentation ?? PRESENTATION_BY_KEY[field.key],
    })),
  };
}
