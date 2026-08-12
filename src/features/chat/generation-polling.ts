import type {
  GenerationRunStatus,
  GenerationRunViewDto,
  GenerationToolDetails,
} from "@/contracts/generation";

const ACTIVE_GENERATION_STATUSES = new Set<GenerationRunStatus>([
  "queued",
  "running",
  "cancel_requested",
]);

type GenerationRunReference = Pick<GenerationToolDetails, "runId" | "status">;

export function generationRunIdsKey(
  details: GenerationRunReference[],
): string {
  return [...new Set(details.map((item) => item.runId))].sort().join("|");
}

export function activeGenerationRunIdsKey(
  details: GenerationRunReference[],
  views: ReadonlyMap<string, GenerationRunViewDto>,
): string {
  return [...new Set(details
    .filter((item) => ACTIVE_GENERATION_STATUSES.has(
      views.get(item.runId)?.run.status ?? item.status,
    ))
    .map((item) => item.runId))]
    .sort()
    .join("|");
}

export function generationRunIds(key: string): string[] {
  return key ? key.split("|") : [];
}
