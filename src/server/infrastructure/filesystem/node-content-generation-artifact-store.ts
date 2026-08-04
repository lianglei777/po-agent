import { promises as fs } from "node:fs";
import path from "node:path";
import type { ContentGenerationArtifactStore } from "@/server/ports/content-generation-provider";

export class NodeContentGenerationArtifactStore
  implements ContentGenerationArtifactStore
{
  async save(input: {
    cwd: string;
    jobId: string;
    index: number;
    extension?: string;
    data: Uint8Array;
  }) {
    const directory = path.join(
      input.cwd,
      ".po-agent",
      "generated",
      input.jobId,
    );
    await fs.mkdir(directory, { recursive: true });
    const extension = safeExtension(input.extension);
    const filePath = path.join(directory, `output-${input.index + 1}.${extension}`);
    await fs.writeFile(filePath, input.data);
    return path.relative(input.cwd, filePath);
  }
}

function safeExtension(value?: string) {
  const normalized = value?.replace(/^\./, "").toLowerCase();
  return normalized && /^[a-z0-9]{1,10}$/.test(normalized)
    ? normalized
    : "bin";
}
