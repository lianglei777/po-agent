import { promises as fs } from "node:fs";
import path from "node:path";
import type { ContentGenerationDocumentationRepository } from "@/server/ports/content-generation-documentation";

const DOCUMENT_FILES: Readonly<Record<string, string>> = {
  "runninghub-seedance-2-text-to-video": "text-to-video.md",
  "runninghub-seedance-2-image-to-video": "image-to-video.md",
  "runninghub-seedance-2-multimodal-video": "multimodal-video.md",
};

export class MarkdownContentGenerationDocumentationRepository
  implements ContentGenerationDocumentationRepository
{
  constructor(private readonly documentationRoot: string) {}

  async read(catalogId: string): Promise<string | null> {
    const filename = DOCUMENT_FILES[catalogId];
    if (!filename) return null;
    try {
      return await fs.readFile(path.join(this.documentationRoot, filename), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
