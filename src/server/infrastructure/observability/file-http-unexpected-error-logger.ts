import { promises as fs } from "node:fs";
import path from "node:path";
import type { UnexpectedErrorLogInput } from "@/server/ports/http-unexpected-error-logger";

const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LOG_VALUE_LENGTH = 16 * 1024;

/**
 * 将未知 HTTP 异常写入 Pi 数据目录。日志只能用于服务器诊断，绝不能进入 HTTP 响应。
 */
export class FileHttpUnexpectedErrorLogger {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  log(input: UnexpectedErrorLogInput): Promise<void> {
    const operation = this.writeQueue.then(() => this.append(input));
    // 前一次日志写入失败不能阻塞后续诊断记录。
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  private async append(input: UnexpectedErrorLogInput): Promise<void> {
    const line = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "http.unexpected_error",
      requestId: input.requestId,
      error: serializeError(input.error),
    })}\n`;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    await this.rotateIfNeeded(Buffer.byteLength(line));
    await fs.appendFile(this.filePath, line, { encoding: "utf8", mode: 0o600 });
    await fs.chmod(this.filePath, 0o600);
  }

  private async rotateIfNeeded(nextLineBytes: number): Promise<void> {
    try {
      const current = await fs.stat(this.filePath);
      if (current.size + nextLineBytes <= MAX_LOG_FILE_BYTES) return;
      await fs.rename(this.filePath, `${this.filePath}.1`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function serializeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  return {
    name: error instanceof Error ? error.name : "NonErrorThrown",
    message: redactAndTruncate(message),
    ...(stack ? { stack: redactAndTruncate(stack) } : {}),
  };
}

function redactAndTruncate(value: string): string {
  return redact(value).slice(0, MAX_LOG_VALUE_LENGTH);
}

function redact(value: string): string {
  return value
    .replace(/(Bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(
      /((?:api[_-]?key|authorization|token|password|secret|cookie|signature|access[_-]?key)\s*["']?\s*[:=]\s*["']?)[^\s,"'}\]]+/gi,
      "$1[REDACTED]",
    );
}
