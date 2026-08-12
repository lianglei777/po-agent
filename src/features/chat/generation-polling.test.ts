import { describe, expect, it } from "vitest";
import type {
  GenerationRunViewDto,
  GenerationToolDetails,
} from "@/contracts/generation";
import {
  activeGenerationRunIdsKey,
  generationRunIds,
  generationRunIdsKey,
} from "./generation-polling";

function details(
  runId: string,
  status: GenerationToolDetails["status"],
): GenerationToolDetails {
  return {
    runId,
    status,
    phase: "queued",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    artifacts: [],
  };
}

function view(
  runId: string,
  status: GenerationRunViewDto["run"]["status"],
): GenerationRunViewDto {
  return {
    run: {
      id: runId,
      sessionId: "session-1",
      routeId: "route-1",
      capability: "text-to-image",
      status,
      source: "agent-tool",
      prompt: "test",
      input: { prompt: "test", parameters: {} },
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    },
    jobs: [],
    artifacts: [],
  };
}

describe("generation polling keys", () => {
  it("stays stable when streaming renders recreate and reorder run details", () => {
    const first = [details("run-b", "running"), details("run-a", "queued")];
    const nextRender = [
      { ...details("run-a", "queued") },
      { ...details("run-b", "running") },
      { ...details("run-a", "queued") },
    ];

    expect(generationRunIdsKey(first)).toBe("run-a|run-b");
    expect(generationRunIdsKey(nextRender)).toBe("run-a|run-b");
  });

  it("polls only runs whose latest loaded status is active", () => {
    const source = [
      details("run-a", "running"),
      details("run-b", "running"),
      details("run-c", "succeeded"),
    ];
    const views = new Map<string, GenerationRunViewDto>([
      ["run-a", view("run-a", "succeeded")],
      ["run-c", view("run-c", "queued")],
    ]);

    const key = activeGenerationRunIdsKey(source, views);

    expect(key).toBe("run-b|run-c");
    expect(generationRunIds(key)).toEqual(["run-b", "run-c"]);
  });
});
