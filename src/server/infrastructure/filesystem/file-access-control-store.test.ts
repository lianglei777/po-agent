import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AccessControlConfig } from "@/server/domain/access-control";
import { FileAccessControlStore } from "./file-access-control-store";

describe("FileAccessControlStore", () => {
  let directory = "";

  afterEach(async () => {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  it("returns null before initialization and persists a valid config", async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "po-agent-access-"));
    const filePath = path.join(directory, "nested", "access-control.json");
    const store = new FileAccessControlStore(filePath);
    const config: AccessControlConfig = {
      version: 1,
      enabled: true,
      mustChangePassword: true,
      password: { algorithm: "scrypt", salt: "salt", hash: "hash" },
    };

    await expect(store.read()).resolves.toBeNull();
    await store.write(config);
    await expect(store.read()).resolves.toEqual(config);
  });

  it("rejects malformed persisted data", async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "po-agent-access-"));
    const filePath = path.join(directory, "access-control.json");
    await fs.writeFile(filePath, JSON.stringify({ enabled: true }));

    await expect(new FileAccessControlStore(filePath).read()).rejects.toThrow(
      "access-control.json is invalid",
    );
  });
});
