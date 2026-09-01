import type { GenerationAssetSlot, GenerationRouteDto } from "@/contracts/generation";
import type { CanvasPromptDocument, CanvasResourceReferenceAttrs } from "@/contracts/pipeline";
import { generationAssetSlotForReference } from "@/lib/generation-asset-slot";
import { promptDocumentResourceAttrs } from "./prompt-document";

export type PromptReferenceRouteProblem =
  | { kind: "unsupported"; reference: CanvasResourceReferenceAttrs }
  | { kind: "too-many"; slot: GenerationAssetSlot; count: number }
  | { kind: "missing-required"; slot: GenerationAssetSlot }
  | { kind: "missing-constrained"; slots: GenerationAssetSlot[]; minFiles: number }
  | { kind: "too-many-constrained"; slots: GenerationAssetSlot[]; count: number; maxFiles: number }
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
  for (const constraint of route.inputSchema.constraints ?? []) {
    if (constraint.kind === "mutually-exclusive-parameters") continue;
    const constrainedSlots = slots.filter((slot) => constraint.slots.includes(slot.key));
    const count = constrainedSlots.reduce((total, slot) => total + (counts.get(slot.key) ?? 0), 0);
    if (constraint.kind === "at-least-one-asset" && count < (constraint.minFiles ?? 1)) {
      return { kind: "missing-constrained", slots: constrainedSlots, minFiles: constraint.minFiles ?? 1 };
    }
    if (constraint.kind === "max-total-assets" && count > constraint.maxFiles) {
      return { kind: "too-many-constrained", slots: constrainedSlots, count, maxFiles: constraint.maxFiles };
    }
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
