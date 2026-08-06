import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeGenerationFileStore } from "./node-generation-file-store";

describe("NodeGenerationFileStore", () => {
  let cwd: string;
  const store = new NodeGenerationFileStore();

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "po-agent-files-"));
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it("reads workspace-relative generation inputs", async () => {
    await fs.writeFile(path.join(cwd, "first.png"), new Uint8Array([1, 2, 3]));

    await expect(store.readInput({
      cwd,
      relativePath: "first.png",
      slot: "firstFrameUrl",
    })).resolves.toEqual({
      slot: "firstFrameUrl",
      name: "first.png",
      mimeType: "image/png",
      data: new Uint8Array([1, 2, 3]),
    });
  });

  it("registers uploaded inputs inside the workspace", async () => {
    const relativePath = await store.saveInput({
      cwd,
      name: "first frame.png",
      data: new Uint8Array([7, 8, 9]),
    });

    expect(relativePath).toMatch(/\.po-agent[\\/]generation-inputs[\\/].+-first-frame\.png$/);
    await expect(fs.readFile(path.join(cwd, relativePath))).resolves.toEqual(
      Buffer.from([7, 8, 9]),
    );
  });

  it("rejects paths outside the workspace", async () => {
    await expect(store.readInput({
      cwd,
      relativePath: "../secret.png",
      slot: "imageUrls",
    })).rejects.toMatchObject({ code: "PROJECT_NOT_REGISTERED" });
  });

  it("stores outputs under the run artifact directory", async () => {
    const relativePath = await store.saveOutput({
      cwd,
      runId: "run-1",
      index: 0,
      extension: "mp4",
      data: new Uint8Array([4, 5, 6]),
    });

    expect(relativePath).toBe(
      path.join(".po-agent", "generated", "run-1", "output-1.mp4"),
    );
    await expect(fs.readFile(path.join(cwd, relativePath))).resolves.toEqual(
      Buffer.from([4, 5, 6]),
    );
  });
});
