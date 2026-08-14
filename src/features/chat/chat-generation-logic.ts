import type {
  GenerationAssetSlot,
  GenerationRouteDto,
} from "@/contracts/generation";
import type { ChatGenerationAsset } from "./chat-generation-types";

export function composerGenerationSlots(
  mode: { type: "chat" } | { type: "generation-auto" } | { type: "generation-route"; routeId: string },
  routes: GenerationRouteDto[],
  labels: Record<"image" | "video" | "audio", string> = {
    image: "Image",
    video: "Video",
    audio: "Audio",
  },
): GenerationAssetSlot[] {
  if (mode.type === "chat") return [];
  if (mode.type === "generation-route") {
    return routes.find((route) => route.id === mode.routeId)?.inputSchema.assets ?? [];
  }
  const mediaTypes = new Set(
    routes.flatMap((route) => route.inputSchema.assets ?? []).map((slot) => slot.mediaType),
  );
  return [...mediaTypes].map((mediaType) => ({
    key: `auto-${mediaType}`,
    label: labels[mediaType],
    mediaType,
    multiple: true,
    maxFiles: 10,
    acceptedTypes: [`${mediaType}/*`],
  }));
}

export function bindGenerationAssets(
  assets: ChatGenerationAsset[],
  route: GenerationRouteDto,
) {
  const slots = route.inputSchema.assets ?? [];
  return assets.map((asset) => {
    if (!asset.slot.startsWith("auto-")) return { asset, slot: asset.slot };
    const mediaType = asset.file.type.split("/", 1)[0];
    const candidates = slots.filter((slot) => slot.mediaType === mediaType);
    return candidates.length === 1 ? { asset, slot: candidates[0]!.key } : { asset, slot: null };
  });
}

export function missingGenerationSlots(
  route: GenerationRouteDto,
  bindings: Array<{ slot: string | null }>,
) {
  return (route.inputSchema.assets ?? []).filter((slot) => {
    if (!slot.required) return false;
    const count = bindings.filter((binding) => binding.slot === slot.key).length;
    return count < (slot.minFiles ?? 1);
  });
}
