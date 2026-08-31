import type { CanvasWorkflowRun } from "@/contracts/pipeline";

export function canvasWorkflowRunIsActive(run: CanvasWorkflowRun | null): boolean {
  if (!run) return false;
  return run.status === "pending"
    || run.status === "running"
    || run.status === "cancelling"
    || run.steps.some((step) => step.status === "running");
}

export function canvasWorkflowRunProgress(run: CanvasWorkflowRun): { completed: number; total: number } {
  return {
    completed: run.steps.filter((step) => step.status === "completed").length,
    total: run.steps.length,
  };
}
