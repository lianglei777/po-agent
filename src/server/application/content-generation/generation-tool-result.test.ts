import { describe, expect, it } from "vitest";
import type { GenerationRunView } from "./generation-run-service";
import { generationToolResult } from "./generation-tool-result";

const NOW = "2026-09-12T00:00:00.000Z";

describe("generationToolResult", () => {
  it("exposes workspace-relative artifact paths in model-visible content", () => {
    const result = generationToolResult(view({
      status: "succeeded",
      artifactPaths: [
        ".po-agent/generated/run-1/first image.png",
        ".po-agent/generated/run-1/second.png",
      ],
    }));

    expect(result.content).toEqual([{
      type: "text",
      text: expect.stringContaining(
        'Workspace-relative artifact paths: [".po-agent/generated/run-1/first image.png",".po-agent/generated/run-1/second.png"].',
      ),
    }]);
  });

  it("does not expose remote URLs as workspace paths", () => {
    const run = view({ status: "succeeded", artifactPaths: [] });
    run.artifacts.push({
      id: "remote-artifact",
      runId: "run-1",
      jobId: "job-1",
      kind: "image",
      remoteUrl: "https://provider.example/private-output.png",
      createdAt: NOW,
    });

    const text = resultText(generationToolResult(run));

    expect(text).not.toContain("Workspace-relative artifact paths");
    expect(text).not.toContain("provider.example");
  });

  it("tells the model not to poll after a wait timeout", () => {
    const text = resultText(generationToolResult(
      view({ status: "running", artifactPaths: [] }),
      { waitTimedOut: true },
    ));

    expect(text).toContain("the run continues in the background");
    expect(text).toContain("do not poll automatically");
    expect(text).not.toContain("call get_generation to refresh");
  });

  it("exposes a persisted failure reason in model-visible content", () => {
    const failed = view({ status: "failed", artifactPaths: [] });
    failed.run.errorCode = "GENERATION_PROVIDER_ERROR";
    failed.run.errorMessage = "Provider rejected the prompt";
    failed.jobs.push({
      id: "job-1",
      runId: "run-1",
      attempt: 1,
      providerId: "provider-1",
      providerOperation: "text-to-image",
      routeRevision: 1,
      resolvedConfigSnapshot: {},
      status: "failed",
      failure: {
        phase: "provider-processing",
        origin: "provider",
        outputAvailable: false,
        recoveryAction: "resubmit",
        retryMayCharge: true,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const text = resultText(generationToolResult(failed));
    expect(text).toContain("Failure: GENERATION_PROVIDER_ERROR: Provider rejected the prompt.");
    expect(text).toContain("Recovery: submit a new generation attempt; retry may charge: yes.");
  });
});

function resultText(result: ReturnType<typeof generationToolResult>): string {
  const content = result.content[0];
  return content?.type === "text" ? content.text : "";
}

function view(input: {
  status: GenerationRunView["run"]["status"];
  artifactPaths: string[];
}): GenerationRunView {
  return {
    run: {
      id: "run-1",
      sessionId: "session-1",
      capability: "text-to-image",
      routeId: "route-1",
      status: input.status,
      prompt: "A blue paper boat",
      input: { prompt: "A blue paper boat" },
      source: "agent-tool",
      idempotencyKey: "session-1:call-1",
      createdAt: NOW,
      updatedAt: NOW,
    },
    jobs: [],
    artifacts: input.artifactPaths.map((localPath, index) => ({
      id: `artifact-${index + 1}`,
      runId: "run-1",
      jobId: "job-1",
      kind: "image",
      localPath,
      createdAt: NOW,
    })),
  };
}
