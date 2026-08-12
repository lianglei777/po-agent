import { describe, expect, it } from "vitest";
import {
  generationArtifactPath,
  generationDetailsWithView,
  generationToolDetails,
} from "./generation-tool-presentation";

describe("generation tool presentation", () => {
  it("accepts structured generation details without parsing result text", () => {
    const details = {
      runId: "run-1",
      providerId: "runninghub",
      providerTaskId: "remote-1",
      status: "succeeded",
      artifacts: [{ id: "artifact-1", kind: "image" }],
    };
    expect(generationToolDetails(details)).toEqual({
      ...details,
      phase: "completed",
    });
    expect(generationToolDetails({ runId: "run-1" })).toBeNull();
    expect(generationToolDetails("{\"runId\":\"run-1\"}")).toBeNull();
  });

  it("resolves a persisted artifact path inside the active workspace", () => {
    expect(generationArtifactPath("D:\\project", ".po-agent/generated/run-1/output.png"))
      .toBe("D:\\project\\.po-agent/generated/run-1/output.png");
    expect(generationArtifactPath("/project", "/tmp/output.png"))
      .toBe("/tmp/output.png");
  });

  it("preserves the review phase for historical pending runs", () => {
    expect(generationToolDetails({
      runId: "run-review",
      status: "awaiting_confirmation",
      artifacts: [],
    })).toMatchObject({ phase: "awaiting_confirmation" });
  });

  it("projects the latest durable run state over a static review result", () => {
    const details = generationToolDetails({
      runId: "run-review",
      status: "awaiting_confirmation",
      artifacts: [],
      review: { route: {}, input: {} },
    })!;
    const projected = generationDetailsWithView(details, {
      run: {
        id: "run-review",
        sessionId: "session-1",
        capability: "text-to-image",
        routeId: "route-1",
        status: "succeeded",
        prompt: "lake",
        input: { prompt: "lake" },
        source: "agent-tool",
        createdAt: "2026-08-12T00:00:00.000Z",
        updatedAt: "2026-08-12T00:01:00.000Z",
      },
      jobs: [],
      artifacts: [{
        id: "artifact-1",
        runId: "run-review",
        jobId: "job-1",
        kind: "image",
        localPath: ".po-agent/generated/run-review/lake-1.png",
        createdAt: "2026-08-12T00:01:00.000Z",
      }],
    });

    expect(projected).toMatchObject({
      status: "succeeded",
      phase: "completed",
      artifacts: [{ localPath: ".po-agent/generated/run-review/lake-1.png" }],
    });
    expect(projected.review).toBeUndefined();
  });
});
