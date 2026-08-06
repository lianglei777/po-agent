import { describe, expect, it } from "vitest";
import {
  generationArtifactPath,
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
});
