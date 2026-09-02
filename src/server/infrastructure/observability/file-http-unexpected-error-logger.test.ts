import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileHttpUnexpectedErrorLogger } from "./file-http-unexpected-error-logger";

describe("FileHttpUnexpectedErrorLogger", () => {
  let directory = "";

  afterEach(async () => {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  it("writes a request-correlated stack while redacting common credentials", async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "po-agent-http-log-"));
    const filePath = path.join(directory, "logs", "http-errors.jsonl");
    const logger = new FileHttpUnexpectedErrorLogger(filePath);

    await logger.log({
      requestId: "request-123",
      error: new Error("Bearer token-value apiKey=secret-value password: hunter2"),
    });

    const line = await fs.readFile(filePath, "utf8");
    expect(line).toContain('"requestId":"request-123"');
    expect(line).toContain("[REDACTED]");
    expect(line).not.toContain("token-value");
    expect(line).not.toContain("secret-value");
    expect(line).not.toContain("hunter2");
  });
});
