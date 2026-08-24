import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AppError } from "@/server/domain/app-error";
import type { GenerationFileStore } from "@/server/ports/generation-file-store";

const MAX_INPUT_BYTES = 50 * 1024 * 1024;

export class NodeGenerationFileStore implements GenerationFileStore {
  async saveInput(input: {
    cwd: string;
    name: string;
    data: Uint8Array;
  }): Promise<string> {
    if (!input.data.byteLength || input.data.byteLength > MAX_INPUT_BYTES) {
      throw new AppError(
        "FILE_TOO_LARGE",
        "Generation input must contain between 1 byte and 50 MiB",
        413,
      );
    }
    const root = path.resolve(input.cwd);
    const directory = await isPipelineProject(root)
      ? path.join(root, "assets", "imports")
      : path.join(root, ".po-agent", "generation-inputs");
    await fs.mkdir(directory, { recursive: true });
    const extension = path.extname(input.name).toLowerCase();
    const safeName = path.basename(input.name, extension)
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "asset";
    const filePath = path.join(
      directory,
      `${randomUUID()}-${safeName}${safeExtensionWithDot(extension)}`,
    );
    await fs.writeFile(filePath, input.data, { flag: "wx" });
    return path.relative(path.resolve(input.cwd), filePath);
  }

  async readInput(input: {
    cwd: string;
    relativePath: string;
    slot: string;
  }) {
    const filePath = resolveInsideWorkspace(input.cwd, input.relativePath);
    let stat;
    try {
      stat = await fs.stat(filePath);
    } catch {
      throw new AppError("FILE_NOT_FOUND", "Generation input was not found", 404);
    }
    if (!stat.isFile()) {
      throw new AppError("NOT_A_FILE", "Generation input is not a file", 400);
    }
    if (stat.size > MAX_INPUT_BYTES) {
      throw new AppError(
        "FILE_TOO_LARGE",
        "Generation input exceeds 50 MiB",
        413,
      );
    }
    return {
      slot: input.slot,
      name: path.basename(filePath),
      mimeType: mimeForPath(filePath),
      data: new Uint8Array(await fs.readFile(filePath)),
    };
  }

  async saveOutput(input: {
    cwd: string;
    runId: string;
    nameHint: string;
    index: number;
    extension?: string;
    data: Uint8Array;
  }): Promise<string> {
    if (!/^[a-zA-Z0-9_-]+$/.test(input.runId)) {
      throw new AppError("VALIDATION_ERROR", "Invalid generation run ID", 400);
    }
    const root = path.resolve(input.cwd);
    const directory = await isPipelineProject(root)
      ? path.join(root, "generated", input.runId)
      : path.join(root, ".po-agent", "generated", input.runId);
    await fs.mkdir(directory, { recursive: true });
    const extension = safeExtension(input.extension);
    const filePath = path.join(
      directory,
      `${safeOutputStem(input.nameHint)}-${input.index + 1}.${extension}`,
    );
    await fs.writeFile(filePath, input.data);
    return path.relative(path.resolve(input.cwd), filePath);
  }
}

function safeOutputStem(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[. -]+|[. -]+$/g, "")
    .slice(0, 80)
    .replace(/[. ]+$/g, "");
  return normalized && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(normalized)
    ? normalized
    : "generated";
}

function resolveInsideWorkspace(cwd: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    throw new AppError(
      "PROJECT_NOT_REGISTERED",
      "Generation input must use a workspace-relative path",
      403,
    );
  }
  const root = path.resolve(cwd);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError(
      "PROJECT_NOT_REGISTERED",
      "Generation input is outside the workspace",
      403,
    );
  }
  return target;
}

function safeExtension(value?: string): string {
  const normalized = value?.replace(/^\./, "").toLowerCase();
  return normalized && /^[a-z0-9]{1,10}$/.test(normalized)
    ? normalized
    : "bin";
}

function safeExtensionWithDot(value: string): string {
  return /^\.[a-z0-9]{1,10}$/.test(value) ? value : ".bin";
}

function mimeForPath(filePath: string): string {
  return ({
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
  } as Record<string, string>)[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream";
}

async function isPipelineProject(root: string) {
  try {
    await fs.access(path.join(root, ".pipeline-studio", "project.json"));
    return true;
  } catch {
    return false;
  }
}
