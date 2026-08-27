import { describe, expect, it } from "vitest";
import type { GenerationRouteDto } from "@/contracts/generation";
import {
  canvasVisibleParameterFields,
  generationSettingsSummary,
  IMAGE_ASPECT_RATIO_FIELD,
  reconcileComposerSettings,
} from "./generation-composer-settings";

function route(parameters: GenerationRouteDto["inputSchema"]["parameters"]): GenerationRouteDto {
  return {
    id: "route",
    name: "Route",
    description: "Description",
    tags: [],
    capability: "text-to-video",
    product: "Product",
    providerId: "provider",
    enabled: true,
    isDefault: true,
    revision: 1,
    defaults: { resolution: "720p", durationSeconds: 5 },
    inputSchema: { prompt: { required: true }, parameters },
  };
}

describe("reconcileComposerSettings", () => {
  it("preserves supported values and removes fields unsupported by the next route", () => {
    const next = route([
      { key: "resolution", label: "Resolution", type: "select", options: [{ label: "720p", value: "720p" }, { label: "1080p", value: "1080p" }] },
      { key: "durationSeconds", label: "Duration", type: "number", min: 5, max: 10 },
    ]);

    expect(reconcileComposerSettings(next, {
      resolution: "1080p",
      durationSeconds: 12,
      generateAudio: true,
    })).toEqual({ resolution: "1080p", durationSeconds: 5 });
  });

  it("adds the canvas aspect-ratio field when the image route does not declare it", () => {
    const next = route([
      { key: "resolution", label: "Resolution", type: "select", options: [{ label: "720p", value: "720p" }] },
    ]);

    expect(reconcileComposerSettings(next, { aspectRatio: "16:9" }, [IMAGE_ASPECT_RATIO_FIELD])).toEqual({
      resolution: "720p",
      aspectRatio: "16:9",
    });
  });
});

describe("canvas generation parameter presentation", () => {
  it("hides width and height when the canvas derives them from ratio and resolution", () => {
    const fields = [
      IMAGE_ASPECT_RATIO_FIELD,
      { key: "resolution", label: "Resolution", type: "select" as const },
      { key: "width", label: "Width", type: "number" as const },
      { key: "height", label: "Height", type: "number" as const },
      { key: "outputFormat", label: "Format", type: "select" as const },
    ];

    expect(canvasVisibleParameterFields(fields).map((field) => field.key)).toEqual([
      "aspectRatio",
      "resolution",
      "outputFormat",
    ]);
  });

  it("uses the automatic-duration label for Seedance's -1 sentinel", () => {
    expect(generationSettingsSummary(
      [{ key: "durationSeconds", label: "Duration", type: "select" }],
      { durationSeconds: -1 },
      { audioOn: "On", audioOff: "Off", autoDuration: "Auto" },
    )).toEqual(["Auto"]);
  });
});
