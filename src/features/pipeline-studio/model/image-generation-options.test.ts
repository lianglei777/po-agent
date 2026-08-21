import { describe, expect, it } from "vitest";
import type { GenerationRouteDto } from "@/contracts/generation";
import { imageGenerationRoutes, imagePromptProblem, selectImageGenerationRoute } from "./image-generation-options";

const route = (id: string, capability: GenerationRouteDto["capability"], isDefault = false): GenerationRouteDto => ({
  id,
  name: id,
  capability,
  product: "Product",
  providerId: "provider",
  enabled: true,
  isDefault,
  revision: 1,
  defaults: {},
  inputSchema: { prompt: { required: true, minLength: 5, maxLength: 20 } },
});

describe("image generation options", () => {
  it("keeps only text-to-image routes and respects the preferred route", () => {
    const routes = imageGenerationRoutes([
      route("video", "text-to-video"),
      route("image-default", "text-to-image", true),
      route("image-preferred", "text-to-image"),
    ]);

    expect(routes.map((item) => item.id)).toEqual(["image-default", "image-preferred"]);
    expect(selectImageGenerationRoute(routes, "image-preferred")?.id).toBe("image-preferred");
    expect(selectImageGenerationRoute(routes, "missing")?.id).toBe("image-default");
  });

  it("validates the selected route prompt bounds", () => {
    const selected = route("image", "text-to-image");
    expect(imagePromptProblem(selected, "")).toBe("required");
    expect(imagePromptProblem(selected, "four")).toBe("too-short");
    expect(imagePromptProblem(selected, "valid prompt")).toBeNull();
    expect(imagePromptProblem(selected, "this prompt is definitely too long")).toBe("too-long");
  });
});
