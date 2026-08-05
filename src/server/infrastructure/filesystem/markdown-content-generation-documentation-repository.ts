import { promises as fs } from "node:fs";
import path from "node:path";
import type { ContentGenerationDocumentationRepository } from "@/server/ports/content-generation-documentation";

// catalogId 映射到相对路径，支持多模型族子目录
const DOCUMENT_FILES: Readonly<Record<string, string>> = {
  "runninghub-seedance-2-text-to-video": "seedance2.0/text-to-video.md",
  "runninghub-seedance-2-image-to-video": "seedance2.0/image-to-video.md",
  "runninghub-seedance-2-multimodal-video": "seedance2.0/multimodal-video.md",
  "runninghub-seedream-v5-pro-text-to-image": "seedream/text-to-image.md",
  "runninghub-seedream-v5-pro-image-to-image": "seedream/image-to-image.md",
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
