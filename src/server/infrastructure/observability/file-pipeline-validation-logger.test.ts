import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FilePipelineValidationLogger } from "./file-pipeline-validation-logger";

describe("FilePipelineValidationLogger", () => {
  let directory = "";

  afterEach(async () => {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  it("writes the validation entry with its call-site context", async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "po-agent-pipeline-validation-"));
    const filePath = path.join(directory, "logs", "pipeline-validation.jsonl");
    const logger = new FilePipelineValidationLogger(filePath);

    await logger.log({
      entrypoint: "mutation-batch",
      projectId: "project-1",
      edgeId: "edge-1",
      role: "first-frame",
      sourceNodeId: "text-1",
      sourceType: "text",
      targetNodeId: "video-1",
      targetType: "video",
    });

    await expect(fs.readFile(filePath, "utf8")).resolves.toContain(
      '"event":"pipeline.invalid_frame_binding"',
    );
    await expect(fs.readFile(filePath, "utf8")).resolves.toContain('"entrypoint":"mutation-batch"');
    await expect(fs.readFile(filePath, "utf8")).resolves.toContain('"sourceType":"text"');
  });
});
