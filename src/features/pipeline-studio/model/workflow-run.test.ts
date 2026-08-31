import { describe, expect, it } from "vitest";
import type { CanvasWorkflowRun } from "@/contracts/pipeline";
import { canvasWorkflowRunIsActive, canvasWorkflowRunProgress } from "./workflow-run";

describe("pipeline workflow run view model", () => {
  it("keeps a failed workflow active while an independent generation step is still running", () => {
    const run = workflowRun({ status: "failed", steps: [
      { nodeId: "image-1", status: "failed" },
      { nodeId: "video-1", status: "running", generationRunId: "generation-video" },
    ] });

    expect(canvasWorkflowRunIsActive(run)).toBe(true);
    expect(canvasWorkflowRunProgress(run)).toEqual({ completed: 0, total: 2 });
  });

  it("reports completed terminal workflows as inactive", () => {
    const run = workflowRun({ status: "completed", steps: [
      { nodeId: "image-1", status: "completed" },
      { nodeId: "video-1", status: "completed" },
    ] });

    expect(canvasWorkflowRunIsActive(run)).toBe(false);
    expect(canvasWorkflowRunProgress(run)).toEqual({ completed: 2, total: 2 });
  });
});

function workflowRun(overrides: Pick<CanvasWorkflowRun, "status" | "steps">): CanvasWorkflowRun {
  return {
    id: "workflow-run-1",
    projectId: "project-1",
    nodeIds: overrides.steps.map((step) => step.nodeId),
    edges: [],
    createdAt: "2026-08-29T00:00:00.000Z",
    updatedAt: "2026-08-29T00:00:00.000Z",
    ...overrides,
  };
}
