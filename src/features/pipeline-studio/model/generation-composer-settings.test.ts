import { describe, expect, it } from "vitest";
import type { GenerationRouteDto } from "@/contracts/generation";
import {
  generationSettingsSummary,
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

  it("does not add parameters that the route does not declare", () => {
    const next = route([
      { key: "resolution", label: "Resolution", type: "select", options: [{ label: "720p", value: "720p" }] },
    ]);

    expect(reconcileComposerSettings(next, { aspectRatio: "16:9" })).toEqual({
      resolution: "720p",
    });
  });
});

describe("canvas generation parameter presentation", () => {
  it("uses the automatic-duration label for Seedance's -1 sentinel", () => {
    expect(generationSettingsSummary(
      [{ key: "durationSeconds", label: "Duration", type: "select", presentation: { summary: true } }],
      { durationSeconds: -1 },
      { enabled: "On", disabled: "Off", autoDuration: "Auto", fieldLabels: {} },
    )).toEqual(["Auto"]);
  });

  it("summarizes fields selected by catalog presentation metadata", () => {
    expect(generationSettingsSummary(
      [
        { key: "size", label: "Size", type: "select", presentation: { summary: true, optionVisual: "dimensions" } },
        { key: "promptExtend", label: "Prompt enhancement", type: "boolean", presentation: { summary: true } },
      ],
      { size: "1024*1536", promptExtend: false },
      { enabled: "On", disabled: "Off", autoDuration: "Auto", fieldLabels: {} },
    )).toEqual(["2:3", "1024×1536", "Prompt enhancementOff"]);
  });
});
