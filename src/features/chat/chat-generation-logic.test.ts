import { describe, expect, it } from "vitest";
import type { GenerationRouteDto } from "@/contracts/generation";
import { bindGenerationAssets, composerGenerationSlots, missingGenerationSlots } from "./chat-generation-logic";

const route: GenerationRouteDto = {
  id: "video",
  name: "Video",
  description: "Video route",
  tags: ["Video"],
  capability: "image-to-video",
  product: "Video",
  providerId: "provider",
  enabled: true,
  isDefault: true,
  revision: 1,
  defaults: {},
  inputSchema: { prompt: { required: true }, assets: [{ key: "firstFrameUrl", label: "First frame", mediaType: "image", required: true }] },
};

describe("chat generation asset routing", () => {
  it("renders the exact named slots for a selected API", () => {
    expect(composerGenerationSlots({ type: "generation-route", routeId: "video" }, [route])).toEqual(route.inputSchema.assets);
  });

  it("binds an automatic asset only when its media type identifies one slot", () => {
    const bindings = bindGenerationAssets([{ id: "a", slot: "auto-image", file: new File(["x"], "a.png", { type: "image/png" }) }], route);
    expect(bindings[0]?.slot).toBe("firstFrameUrl");
    expect(missingGenerationSlots(route, bindings)).toEqual([]);
  });

  it("reports required slots before a selected API is submitted", () => {
    expect(missingGenerationSlots(route, [])).toEqual([
      route.inputSchema.assets?.[0],
    ]);
  });
});
