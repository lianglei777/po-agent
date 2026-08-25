import type { GenerationAssetSlot, GenerationRouteDto } from "@/contracts/generation";
import type { CanvasPromptDocument, CanvasResourceReferenceAttrs } from "@/contracts/pipeline";
import { promptDocumentResourceAttrs } from "./prompt-document";

export type PromptReferenceRouteProblem =
  | { kind: "unsupported"; reference: CanvasResourceReferenceAttrs }
  | { kind: "too-many"; slot: GenerationAssetSlot; count: number }
  | { kind: "missing-required"; slot: GenerationAssetSlot }
  | null;

export function promptReferenceRouteProblem(
  document: CanvasPromptDocument,
  route: GenerationRouteDto | undefined,
  additionalReferences: CanvasResourceReferenceAttrs[] = [],
): PromptReferenceRouteProblem {
  if (!route) return null;
  const slots = route.inputSchema.assets ?? [];
  const counts = new Map<string, number>();
  const seenBindings = new Set<string>();

  for (const reference of [...additionalReferences, ...promptDocumentResourceAttrs(document)]) {
    if (reference.mediaType === "text") continue;
    const slotKey = referenceSlotKey(reference);
    const bindingKey = `${reference.sourceType}:${reference.sourceId}:${slotKey}`;
    if (seenBindings.has(bindingKey)) continue;
    seenBindings.add(bindingKey);
    const slot = slots.find((candidate) => candidate.key === slotKey && candidate.mediaType === reference.mediaType);
    if (!slot) return { kind: "unsupported", reference };
    const count = (counts.get(slot.key) ?? 0) + 1;
    counts.set(slot.key, count);
    if (slot.maxFiles !== undefined && count > slot.maxFiles) return { kind: "too-many", slot, count };
  }

  for (const slot of slots) {
    const minimum = slot.minFiles ?? (slot.required ? 1 : 0);
    if ((counts.get(slot.key) ?? 0) < minimum) return { kind: "missing-required", slot };
  }
  return null;
}

export function videoCapabilityForPrompt(
  document: CanvasPromptDocument,
  additionalReferences: CanvasResourceReferenceAttrs[] = [],
) {
  const references = [...additionalReferences, ...promptDocumentResourceAttrs(document)];
  if (references.some((reference) => reference.mediaType === "video"
    || reference.mediaType === "audio"
    || (reference.mediaType === "image" && reference.role === "reference"))) {
    return "multimodal-to-video" as const;
  }
  if (references.some((reference) => reference.mediaType === "image")) {
    return "image-to-video" as const;
  }
  return "text-to-video" as const;
}

function referenceSlotKey(reference: CanvasResourceReferenceAttrs): string {
  if (reference.role === "first-frame") return "firstFrameUrl";
  if (reference.role === "last-frame") return "lastFrameUrl";
  if (reference.mediaType === "image") return "imageUrls";
  if (reference.mediaType === "video") return "videoUrls";
  return "audioUrls";
}
