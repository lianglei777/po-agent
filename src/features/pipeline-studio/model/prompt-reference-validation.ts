import type { GenerationAssetSlot, GenerationRouteDto } from "@/contracts/generation";
import type { CanvasPromptDocument, CanvasResourceReferenceAttrs } from "@/contracts/pipeline";
import { generationAssetSlotForReference } from "@/lib/generation-asset-slot";
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
    const slot = generationAssetSlotForReference(slots, reference);
    if (!slot) return { kind: "unsupported", reference };
    const bindingKey = `${reference.sourceType}:${reference.sourceId}:${slot.key}`;
    if (seenBindings.has(bindingKey)) continue;
    seenBindings.add(bindingKey);
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

export function videoRouteSupportsPrompt(
  document: CanvasPromptDocument,
  route: GenerationRouteDto,
  additionalReferences: CanvasResourceReferenceAttrs[] = [],
) {
  if (promptReferenceRouteProblem(document, route, additionalReferences) !== null) return false;
  const references = [...additionalReferences, ...promptDocumentResourceAttrs(document)]
    .filter((reference) => reference.mediaType !== "text");
  if (!references.length) return route.capability === "text-to-video";
  if (references.some((reference) => reference.mediaType === "video"
    || (reference.mediaType === "image" && reference.role === "reference"))) {
    return route.capability === "multimodal-to-video";
  }
  if (references.some((reference) => reference.mediaType === "image")) {
    return route.capability === "image-to-video";
  }
  // 纯音频引用可以是文生视频的驱动音频，也可以是多模态输入，最终由路由 Schema 决定。
  return true;
}
