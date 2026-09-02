import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AccessControlConfig } from "@/server/domain/access-control";
import type { AccessControlStore } from "@/server/ports/access-control";

export class FileAccessControlStore implements AccessControlStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async read(): Promise<AccessControlConfig | null> {
    try {
      return parseConfig(JSON.parse(await fs.readFile(this.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  write(config: AccessControlConfig): Promise<void> {
    const operation = this.writeQueue.then(() => this.writeAtomically(config));
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  private async writeAtomically(config: AccessControlConfig): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(
        temporaryPath,
        `${JSON.stringify(config, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
      await fs.rename(temporaryPath, this.filePath);
      await fs.chmod(this.filePath, 0o600);
    } finally {
      await fs.rm(temporaryPath, { force: true });
    }
  }
}

function parseConfig(value: unknown): AccessControlConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("access-control.json must contain an object");
  }
  const config = value as Record<string, unknown>;
  const password = config.password;
  if (
    config.version !== 1 ||
    typeof config.enabled !== "boolean" ||
    typeof config.mustChangePassword !== "boolean" ||
    !password ||
    typeof password !== "object" ||
    Array.isArray(password)
  ) {
    throw new Error("access-control.json is invalid");
  }
  const record = password as Record<string, unknown>;
  if (
    record.algorithm !== "scrypt" ||
    typeof record.salt !== "string" ||
    typeof record.hash !== "string"
  ) {
    throw new Error("access-control.json password record is invalid");
  }
  return {
    version: 1,
    enabled: config.enabled,
    mustChangePassword: config.mustChangePassword,
    password: {
      algorithm: "scrypt",
      salt: record.salt,
      hash: record.hash,
    },
  };
}
