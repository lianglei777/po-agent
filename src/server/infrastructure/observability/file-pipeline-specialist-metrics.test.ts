import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilePipelineSpecialistMetrics } from "./file-pipeline-specialist-metrics";

let directory: string | undefined;
afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

describe("FilePipelineSpecialistMetrics", () => {
  it("records compact metrics without creative content", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "pipeline-specialist-metrics-"));
    const file = path.join(directory, "metrics.jsonl");
    const metrics = new FilePipelineSpecialistMetrics(file);
    await metrics.record({ event: "specialist-run", projectId: "project-1", specialist: "script", profileVersion: "1.0.0",
      outcome: "success", durationMs: 120, operationCount: 2, repairUsed: false });
    const entry = JSON.parse((await readFile(file, "utf8")).trim()) as Record<string, unknown>;
    expect(entry).toMatchObject({ event: "specialist-run", specialist: "script", outcome: "success", operationCount: 2 });
    expect(entry).not.toHaveProperty("prompt");
    expect(entry).not.toHaveProperty("response");
  });
});
