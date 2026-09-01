import { describe, expect, it } from "vitest";
import type { GenerationRouteDto } from "@/contracts/generation";
import { selectInitialVideoGenerationRoute, videoGenerationRoutes } from "./video-generation-options";

describe("video generation options", () => {
  it("keeps every enabled video capability regardless of the current prompt assets", () => {
    const routes = videoGenerationRoutes([
      route("text", "text-to-video"),
      route("image", "image-to-video"),
      route("multimodal", "multimodal-to-video"),
      route("lip-sync", "audio-to-video"),
      route("disabled", "image-to-video", false),
      route("still-image", "text-to-image"),
    ]);

    expect(routes.map((item) => item.id)).toEqual(["text", "image", "multimodal", "lip-sync"]);
  });

  it("respects a saved route before using input-based recommendation", () => {
    const routes = [
      route("text", "text-to-video", true, true),
      route("image", "image-to-video", true, true),
      route("multimodal", "multimodal-to-video"),
    ];

    expect(selectInitialVideoGenerationRoute(routes, "image", "text-to-video")?.id).toBe("image");
    expect(selectInitialVideoGenerationRoute(routes, undefined, "multimodal-to-video")?.id).toBe("multimodal");
    expect(selectInitialVideoGenerationRoute(routes, undefined, "image-to-video")?.id).toBe("image");
  });
});

function route(
  id: string,
  capability: GenerationRouteDto["capability"],
  enabled = true,
  isDefault = false,
): GenerationRouteDto {
  return {
    id,
    name: id,
    description: `${id} description`,
    tags: [],
    capability,
    product: "Product",
    providerId: "provider",
    enabled,
    isDefault,
    revision: 1,
    defaults: {},
    inputSchema: { prompt: { required: true } },
  };
}
