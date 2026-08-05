import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownContentGenerationDocumentationRepository } from "./markdown-content-generation-documentation-repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { force: true, recursive: true })));
});

describe("MarkdownContentGenerationDocumentationRepository", () => {
  it("reads only the allowlisted document for a catalog API", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-agent-api-docs-"));
    temporaryDirectories.push(root);
    await fs.mkdir(path.join(root, "seedance2.0"), { recursive: true });
    await fs.writeFile(path.join(root, "seedance2.0", "text-to-video.md"), "# Text to video", "utf8");
    const repository = new MarkdownContentGenerationDocumentationRepository(root);

    await expect(repository.read("runninghub-seedance-2-text-to-video"))
      .resolves.toBe("# Text to video");
    await expect(repository.read("../../secret"))
      .resolves.toBeNull();
  });

  it("reads documents from different model-family subdirectories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "po-agent-api-docs-"));
    temporaryDirectories.push(root);
    await fs.mkdir(path.join(root, "seedream"), { recursive: true });
    await fs.writeFile(path.join(root, "seedream", "text-to-image.md"), "# Text to image", "utf8");
    const repository = new MarkdownContentGenerationDocumentationRepository(root);

    await expect(repository.read("runninghub-seedream-v5-pro-text-to-image"))
      .resolves.toBe("# Text to image");
  });
});
