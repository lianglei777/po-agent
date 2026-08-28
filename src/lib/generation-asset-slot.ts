import type { GenerationAssetSlot } from "@/contracts/generation";

export interface GenerationAssetReferenceShape {
  mediaType: "image" | "video" | "audio" | "text";
  role?: "reference" | "first-frame" | "last-frame";
}

export function generationAssetSlotForReference(
  slots: GenerationAssetSlot[],
  reference: GenerationAssetReferenceShape,
): GenerationAssetSlot | undefined {
  if (reference.mediaType === "text") return undefined;
  const mediaSlots = slots.filter((slot) => slot.mediaType === reference.mediaType);
  const semanticKey = reference.role === "first-frame"
    ? "firstFrameUrl"
    : reference.role === "last-frame"
      ? "lastFrameUrl"
      : reference.mediaType === "image"
        ? "imageUrls"
        : reference.mediaType === "video"
          ? "videoUrls"
          : "audioUrls";
  const semanticSlot = mediaSlots.find((slot) => slot.key === semanticKey);
  if (semanticSlot) return semanticSlot;
  if (reference.role === "first-frame" || reference.role === "last-frame") return undefined;
  // 厂商可以自定义槽位名；仅在媒体类型对应唯一槽位时安全回退，避免把普通图片误当首帧或尾帧。
  return mediaSlots.length === 1 ? mediaSlots[0] : undefined;
}
