import { promises as fs } from "node:fs";
import path from "node:path";
import type { PipelineValidationLogInput, PipelineValidationLogger } from "@/server/ports/pipeline-validation-logger";

/** 将可预期但需要追踪的画布校验失败写入独立日志，避免混入未知 HTTP 异常。 */
export class FilePipelineValidationLogger implements PipelineValidationLogger {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  log(input: PipelineValidationLogInput): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
      await fs.appendFile(this.filePath, `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "pipeline.invalid_frame_binding",
        ...input,
      })}\n`, { encoding: "utf8", mode: 0o600 });
      await fs.chmod(this.filePath, 0o600);
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }
}
