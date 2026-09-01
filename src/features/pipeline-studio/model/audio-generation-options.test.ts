import { describe, expect, it } from "vitest";
import type { GenerationRouteDto } from "@/contracts/generation";
import { audioGenerationRoutes, selectAudioGenerationRoute } from "./audio-generation-options";

const route = (id: string, capability: GenerationRouteDto["capability"], enabled = true, isDefault = false) => ({
  id, capability, enabled, isDefault,
  name: id, description: id, tags: [], product: "Test", providerId: "test", revision: 1, defaults: {},
  inputSchema: { prompt: { required: false } },
}) satisfies GenerationRouteDto;

describe("audio generation options", () => {
  it("keeps only enabled video-to-audio routes", () => {
    expect(audioGenerationRoutes([
      route("vocal", "video-to-audio", true),
      route("disabled", "video-to-audio", false),
      route("video", "text-to-video", true),
    ]).map((item) => item.id)).toEqual(["vocal"]);
  });

  it("prefers the persisted route and then the capability default", () => {
    const routes = [route("default", "video-to-audio", true, true), route("vocal", "video-to-audio")];
    expect(selectAudioGenerationRoute(routes, "vocal")?.id).toBe("vocal");
    expect(selectAudioGenerationRoute(routes)?.id).toBe("default");
  });
});
