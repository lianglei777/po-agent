import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NodeWorkspaceFileService } from "./node-file-system";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("NodeWorkspaceFileService media metadata", () => {
  it("identifies videos when listing and streaming workspace files", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "po-agent-files-"));
    temporaryDirectories.push(directory);
    const videoPath = path.join(directory, "result.mp4");
    await writeFile(videoPath, new Uint8Array([0, 1, 2, 3]));
    const service = new NodeWorkspaceFileService();

    await expect(service.list(directory)).resolves.toEqual([
      expect.objectContaining({
        contentType: "video/mp4",
        name: "result.mp4",
      }),
    ]);
    await expect(service.getBinary(videoPath)).resolves.toMatchObject({
      contentType: "video/mp4",
      size: 4,
    });
  });
});
