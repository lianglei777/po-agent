import { promises as fs } from "node:fs";
import path from "node:path";
import type { PipelineSpecialistMetricInput, PipelineSpecialistMetrics } from "@/server/ports/pipeline-specialist-metrics";

/** 只记录发布指标，不保存用户输入、模型原文、Prompt 或凭据。 */
export class FilePipelineSpecialistMetrics implements PipelineSpecialistMetrics {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  record(input: PipelineSpecialistMetricInput): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      await fs.appendFile(this.filePath, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...input,
        metric: `pipeline.${input.event}`,
      })}\n`, { encoding: "utf8", mode: 0o600 });
      await fs.chmod(this.filePath, 0o600);
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }
}
