import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileGenerationCredentialStore } from "./file-generation-credential-store";

describe("FileGenerationCredentialStore", () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "po-agent-credentials-"));
    filePath = path.join(directory, "generation-credentials.json");
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("stores credentials without exposing them through a list contract", async () => {
    const store = new FileGenerationCredentialStore(filePath, {});

    await store.setCredential("runninghub:default", " secret-key ");

    await expect(store.hasCredential("runninghub:default")).resolves.toBe(true);
    await expect(store.getCredential("runninghub:default")).resolves.toBe(
      "secret-key",
    );
  });

  it("uses the environment as a non-persistent fallback", async () => {
    const store = new FileGenerationCredentialStore(
      filePath,
      { RUNNINGHUB_API_KEY: "environment-key" },
      { "runninghub:default": "RUNNINGHUB_API_KEY" },
    );

    await expect(store.getCredential("runninghub:default")).resolves.toBe(
      "environment-key",
    );
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("uses the trusted provider mapping for additional environment fallbacks", async () => {
    const store = new FileGenerationCredentialStore(
      filePath,
      { DASHSCOPE_API_KEY: "qianwen-environment-key" },
      { "qianwen:default": "DASHSCOPE_API_KEY" },
    );

    await expect(store.getCredential("qianwen:default")).resolves.toBe(
      "qianwen-environment-key",
    );
    await expect(store.getCredential("unknown:default")).resolves.toBeNull();
  });
});
