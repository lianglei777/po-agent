import { describe, expect, it } from "vitest";
import { withGenerationParameterPresentation } from "./generation-parameter-presentation";

describe("withGenerationParameterPresentation", () => {
  it("adds standard presentation metadata without changing validation fields", () => {
    const schema = withGenerationParameterPresentation({
      prompt: { required: true },
      parameters: [{ key: "durationSeconds", label: "Duration", type: "number", min: 2, max: 30 }],
    });
    expect(schema.parameters?.[0]).toEqual({
      key: "durationSeconds",
      label: "Duration",
      type: "number",
      min: 2,
      max: 30,
      presentation: { control: "slider", summary: true, unit: "s" },
    });
  });

  it("preserves explicit presentation and leaves unknown fields on generic fallback", () => {
    const schema = withGenerationParameterPresentation({
      prompt: { required: true },
      parameters: [
        { key: "quality", label: "Quality", type: "select", presentation: { control: "segmented" } },
        { key: "vendorSpecific", label: "Vendor-specific", type: "text" },
      ],
    });
    expect(schema.parameters?.[0].presentation).toEqual({ control: "segmented" });
    expect(schema.parameters?.[1].presentation).toBeUndefined();
  });
});
