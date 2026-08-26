import type { GenerationRunStatus } from "@/contracts/generation";

export function videoGenerationHistoryAction(
  status: GenerationRunStatus,
  hasVideoArtifact: boolean,
): "select" | "retry" | null {
  if (status === "failed" || status === "cancelled") return "retry";
  if (status === "succeeded" && hasVideoArtifact) return "select";
  return null;
}
